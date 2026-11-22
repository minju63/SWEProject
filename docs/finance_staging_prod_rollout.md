# 운영 SWproject 원본 수집 테이블 적용 계획 (적용 당시 계획)

대상 프로젝트: `flkoszigqobfkztbvsyw` (`SWproject`). 이 문서는 적용 전 계획의 기록이다. 실제 적용·검증·가상 데이터 정리 결과는 `docs/finance_staging_prod_result.md`를 참조한다.

## 변경 전 확인 (2026-11-22 UTC)

- `policy`: 502행, 전체 행 내용 MD5 `96ae05432ec9aac83ed9fe00e93871cd`.
- `finance_detail`: 93행, 전체 행 내용 MD5 `f05eb9db794768a98bf3924320255fd9`.
- `policy.collection_domain='FINANCE'`: 93행(그중 `eligibility_verified=true` 27행), 자격조건·절차·서류·검증 플래그 MD5 `867bdcc0aaf41d28548f26e9c82cb670`.
- `policy_source`: 605행. 비교 시 읽기 전용으로만 사용한다.
- 신규 테이블·인덱스·시퀀스 예정 이름과 충돌하는 DB 객체: 0개.
- 조직 요금제는 Free이므로 Supabase의 일일 관리 백업을 전제로 할 수 없다. 이 PC에는 `pg_dump`, Supabase CLI, Docker가 없다. 전체 행의 로컬 백업은 확보하지 않았으며 이번 작업에서는 내보내기를 시도하지 않는다. 행 수와 해시는 변경 감지 수단일 뿐 복구 가능한 백업이 아니다.

## 백업 없이 적용할 때의 위험

신규 테이블만 만드는 DDL은 기존 정책 행을 직접 수정하지 않으므로 예상되는 직접 손상 위험은 낮다. 그러나 운영 DB에서의 예기치 않은 오류, 권한·스키마 오설정, 동시 운영 변경, 사람의 실행 실수에 대해 기존 행을 복구할 자체 백업은 없다. 변경 전후 행 수·해시가 달라지면 발견할 수 있으나 이 값만으로 복원할 수 없다. 이 잔여 위험을 명시하고 별도 승인을 받은 뒤에만 적용한다. 기존 정책 전체 행을 자동 내보내지 않는다.

## 승인 요청 대상 SQL

`sql/finance_raw_staging.sql` 한 파일만 운영 DB에 적용한다. 하나의 `BEGIN`/`COMMIT` 안에서 `public.finance_raw_run`, `public.finance_raw_response`, `public.finance_raw_error`, `public.finance_review_candidate` 4개를 만들고, 해당 테이블의 인덱스·identity 시퀀스·RLS·역할 권한만 설정한다. 기존 `policy`, `finance_detail`, 검증된 JSON, `policy_source`를 참조하는 DDL/DML은 없다. 신규 테이블의 FK는 `finance_raw_run`만 가리킨다. 테이블 이름이 이미 있거나 중간 문장이 실패하면 트랜잭션 전체가 롤백된다.

## 적용 직후 중단 기준

수집 전에 `sql/finance_raw_staging_verify.sql`을 실행하여 4개 테이블, PK/FK/UQ, RLS, anon/authenticated의 모든 테이블 권한 false, service_role의 필요한 SELECT/INSERT와 실행 테이블 UPDATE true, service_role DELETE false, 시퀀스 권한을 확인한다. REST에서도 anon/authenticated GET/POST 거부와 service_role의 staging 저장을 검증한다. 어느 권한 검사든 실패하면 수집·검토용 JSON 저장·GitHub Actions 설정을 중단한다.

권한 검증이 실패했고 아직 네 staging 테이블이 비어 있다면 `sql/finance_raw_staging_rollback_empty.sql`로 **네 신규 테이블만** 삭제한다. 이 SQL은 행이 하나라도 있으면 거부하며 `CASCADE`를 사용하지 않는다. 가상 smoke 실행 1건, 응답 1건, 검토 후보 1건만 남아 있고 다른 수집 이력이 전혀 없을 때는 `sql/finance_raw_staging_rollback_smoke.sql`을 별도 검토·승인 후 실행할 수 있다. 이 파일은 네 테이블을 잠근 뒤 각 테스트 행의 식별자·해시와 정확한 행 수를 검사하고 네 신규 테이블만 삭제한다. 검사 실패 시 전체 트랜잭션이 롤백된다. 다른 수집 이력이 있으면 자동 DROP을 하지 않고 수집을 멈춘 뒤 별도 보존·복구 결정을 한다. 기존 정책 테이블을 백업으로 덮어쓰거나 전체 프로젝트를 과거 시점으로 복원하는 작업은 이 롤백 절차에 포함하지 않는다.

## 소량 저장 검증 (권한 통과 후)

기존 `--max-pages 1`은 여러 검색어, 공식 인덱스, 보완 정책을 여전히 순회하므로 소량 테스트로 간주하지 않는다. 우선 `sql/finance_raw_staging_prod_smoke.sql`로 **가상 응답 1건과 검토 후보 1건만** 신규 staging 테이블에 저장한다. 이 SQL은 트랜잭션 안에서 `service_role`로 역할을 바꿔 실제 쓰기 권한을 확인한다. 이 단계는 DDL/권한/JSONB 저장의 확인이며 실제 수집기의 REST 경로·외부 API 동작 검증과 구분한다. `sql/finance_raw_staging_prod_baseline.sql`을 DDL 직전과 가상 저장 후 실행하여 기존 테이블 전체 행 수·해시, 장학·금융 93건, 검증된 자격조건 27건이 동일한지 확인한다. 차이가 있으면 운영 중 정당한 변경인지 확인하기 전까지 다음 단계로 진행하지 않는다. 이후 서비스 키를 서버 전용 환경에 설정한 상태에서 별도로 범위를 제한한 수집기 실행 방법을 마련하기 전까지 실제 외부 API 수집과 스케줄은 시작하지 않는다. `--sync-db`는 사용하지 않는다.

GitHub Actions 예시는 `docs/finance_staging_workflow.example.yml`에만 있다. 기본 브랜치에 배치하거나 Secrets를 연결하거나 예약 실행을 활성화하지 않는다. 수집 브랜치가 원격에 올라가고, 권한·소량 저장·기존 데이터 해시 검증과 수집 범위 제한을 마친 후 결정한다.
