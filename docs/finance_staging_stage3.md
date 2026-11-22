# 장학·금융 수집 3단계: 비운영 DB 검증 절차

현재 Windows PC에는 Docker/Podman, Supabase CLI, `psql`/PostgreSQL 실행 파일, WSL 배포판이 없다. Supabase CLI의 실험적 native runtime도 Windows를 지원하지 않는다. 따라서 이 PC에서 PostgreSQL 또는 Supabase REST에 실제 저장한 결과는 아직 없다. `tests/test_finance_staging.py`의 loopback HTTP 서버 검증은 요청 전송 확인일 뿐 DB/RLS 검증이 아니다. 운영 SWproject 프로젝트에는 SQL과 데이터 쓰기를 하지 않는다.

## 별도 테스트 프로젝트 준비

1. 운영 SWproject와 **다른** 새 Supabase 프로젝트를 만들고, 그 프로젝트의 URL, `service_role` 키, anon 키를 테스트 셸에만 설정한다. 정책 실데이터나 운영 백업을 복제하지 않는다. URL의 프로젝트 ref가 운영 프로젝트 ref와 다른지 확인한다. 서버 키는 브라우저, Vite 변수, 저장소에 넣지 않는다.
2. 테스트 프로젝트의 SQL Editor에서 `sql/finance_raw_staging_test_fixture.sql`을 적용한다. 이는 5개의 가상 `policy` 행과 `policy_source` 행만 만드는 최소 비교 스키마다. `finance_detail`은 빈 테이블로 만든다. 운영 프로젝트에는 이 fixture를 절대 적용하지 않는다.
3. 같은 테스트 프로젝트에 `sql/finance_raw_staging.sql`을 **한 번** 적용한다. 이어 `sql/finance_raw_staging_verify.sql`을 실행한다. 네 staging 테이블의 PK/FK/UQ, RLS=true, anon/authenticated 모든 DML 권한=false, service_role의 필요한 SELECT/INSERT 및 `finance_raw_run` UPDATE=true, service_role DELETE=false, staging RLS 정책 0개, 세 identity sequence USAGE 제한을 확인한다. SQL Editor는 관리자 권한이므로 RLS 자체를 시험하지는 못한다.
4. REST에서 anon 키와 authenticated JWT로 네 테이블 GET/POST가 거부되는지 확인한다. service_role 키로 staging POST/GET/PATCH가 성공하는지 확인한다. Data API의 `public` 노출 설정도 확인한다. 인증 테스트는 반드시 **테스트** 프로젝트의 키만 사용한다.

## 가상 응답 저장 시나리오

외부 온통청년 API와 공식 사이트에 실제 요청하지 않도록, 테스트 코드에서 `YouthPolicyAPI`와 공식 페이지 수집 함수를 가상 응답으로 교체한 뒤 `run_raw_collection(..., store=RawStore(TEST_URL, TEST_SERVICE_KEY))`를 호출한다. `--raw-only`와 `--stage-review` CLI 플래그 자체는 정상 분기 및 동시 사용 금지 오프라인 테스트로 확인한다. 실제 CLI를 그대로 실행하면 외부 요청이 발생하므로 이 단계의 가상 시나리오에서 실행하지 않는다.

가상 API 응답에 부산 대상과 기존 필터에서 제외될 지역을 함께 넣고, 가상 공식 HTML/PDF를 응답 훅에 통과시킨다. 2회 실행하여 `run_id`가 다르고 같은 `response_sha256`가 각각 남는지 확인한다. 같은 실행 안에서 동일한 `(run_id, request_fingerprint, response_sha256, http_status)`를 재전송해 행이 하나만 남는지 확인한다. 2MB 이상 JSON도 저장 후 원본 SHA-256과 `body_size_bytes`를 대조한다.

검토 후보는 fixture의 외부 ID `SAME`, `CHANGED`, `AMBIGUOUS`, `OTHER` 및 없는 ID를 사용하여 각각 `SAME`, `DIFFERENT`, `AMBIGUOUS_MATCH`, `LOOKUP_INCOMPLETE`, `NO_EXACT_MATCH`를 확인한다. `NO_EXACT_MATCH`는 정확한 ID/URL 일치가 없다는 뜻이며 확정 신규 정책은 아니다. `eligibility_verified=false`, `review_status=PENDING`를 확인한다. 가상 429/타임아웃/단일 정책 실패를 주입하여 `finance_raw_error`와 `FAILED`/`PARTIAL`을 확인한다. 저장 REST 504/타임아웃 시 staging 외 테이블이 변하지 않는지 확인한다. 각 실행 전후 fixture `policy`/`finance_detail` 행 수와 정책 JSON 해시를 비교한다.

수집 중 프로세스가 종료되면 `finance_raw_run.status='RUNNING'`이 남을 수 있다. 먼저 해당 실행 프로세스가 종료되었음을 확인하고, 충분한 유예 시간(예: 워크플로 최대 실행시간보다 긴 4시간) 후 `RUNNING` 행을 조회한다. 재수집은 새 `run_id`로 시작한다. 운영 절차가 정해지면 오래된 실행만 `FAILED`로 전환하고 `finance_raw_error`에 중단 사유를 남기는 별도 복구 명령을 staging 테이블 대상으로 구현·검증한다. 현재 자동 복구는 없다.

현재 수집기는 상류 API 429/5xx와 네트워크 오류에 최대 3회 시도(재시도 2회)하며 요청 타임아웃은 25초다. 저장 REST는 요청당 30초 타임아웃이고 자동 재시도는 없다. `Retry-After` 헤더 반영과 대용량 응답의 실제 Supabase/프록시 한계, PATCH 0행 성공 응답 감지는 테스트 DB에서 추가 확인해야 한다. `PARTIAL` 실행도 현재 프로세스 종료 코드는 성공이므로 Actions 활성화 전 상태 조회/실패 처리 기준이 필요하다.

## GitHub Actions 준비안 (미활성)

`docs/finance_staging_workflow.example.yml`은 검토용 예시다. 실제 `.github/workflows/`에는 두지 않았다. 기본 브랜치 `main`에 나중에 워크플로를 배치하고, checkout `ref: yg-data-remote`로 수집 브랜치를 실행한다. 현재 `origin/yg-data-remote`가 없으므로 코드 검토 후 브랜치를 push해야 한다. `schedule`은 `Asia/Seoul`의 03:00, `workflow_dispatch`는 수동 실행을 제공한다. 예약 실행은 GitHub의 지연 가능성이 있으므로 정확히 03:00 시작을 보장하지 않는다.

Secrets: `YOUTHCENTER_POLICY_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. 운영 적용 전까지는 URL/키가 테스트 프로젝트를 가리켜야 한다. 실행 로그의 `run_id`를 `finance_raw_run`/`finance_raw_error`와 대조하고, `PARTIAL`과 오래된 `RUNNING`을 별도 실패로 탐지해야 한다. 실운영 활성화 전 비운영 DB에서 위 모든 SQL/REST 테스트를 완료하고, 예상 외부 호출량 및 API 한도, 보관 기간, 실행 중복 방지 정책을 확정한다.
