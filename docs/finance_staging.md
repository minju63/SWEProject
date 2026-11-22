# 장학·금융 원본 및 검토 후보 수집

이 브랜치의 `auto_collect.py`는 온통청년 정책명·키워드 검색, 정책 상세, 공식 페이지와 부산 공식 인덱스, 기존 보완 목록을 그대로 사용합니다. 수집 전에 기존 필터를 바꾸지 않습니다. HTTP 응답 훅이 JSON 파싱, HTML 정리, 지역·정책 필터보다 먼저 응답 전체를 저장하므로 제외된 후보도 검색 응답 원본에 남습니다. 공식 페이지는 실제 접근한 응답만 저장됩니다. 접근 실패나 robots 차단으로 받지 못한 본문은 만들지 않고 오류로 기록합니다.

`sql/finance_raw_staging.sql`은 준비된 일회성 DDL입니다. 이름이 같은 객체가 있으면 실패하고 트랜잭션 전체를 롤백합니다. 운영 DB에는 이 단계에서 적용하지 않습니다. 비운영 DB에 적용한 뒤 `sql/finance_raw_staging_verify.sql`로 제약·RLS·권한·이력과 기존 정책 행 수를 확인해야 합니다. 검증 SQL은 기존 `policy`와 `finance_detail`이 있는 테스트 복제본을 전제로 합니다.

## 수동 실행

SQL을 별도 환경에 적용한 뒤 서버 환경변수 `YOUTHCENTER_POLICY_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 설정합니다. 서비스 역할 키는 백엔드 또는 제한된 수집 실행 환경에만 둡니다.

```powershell
python -m pip install -r requirements.txt
python auto_collect.py --raw-only --max-pages 6
python auto_collect.py --stage-review --max-pages 6
```

`--raw-only`는 원본 응답·실행·오류 이력만 저장합니다. `--stage-review`는 동일한 원본 수집에 더해 기존 v14~v16 정제 및 JSON 생성 결과를 `finance_review_candidate`에 보관하고 `policy_source.external_id` 또는 `policy.official_url`의 정확한 일치만 읽기 전용으로 비교합니다. 정확한 일치가 없거나 여러 정책이 일치하면 검토 상태로 남깁니다. 두 옵션 모두 `--sync-db`와 함께 사용할 수 없습니다. 현재 기존 `--sync-db` 동작 자체는 수정하지 않았으므로 운영 환경에서 사용하지 마세요.

## 테이블과 안전 경계

- `finance_raw_run`: 실행 ID, 날짜, 상태, 원본·오류·검토 건수.
- `finance_raw_response`: 응답 시각, API/크롤링 출처, 요청 식별자와 URL, 상태, 원본 JSON·텍스트, PDF 또는 디코딩 불가 본문의 base64, 응답 SHA-256. 같은 실행의 같은 요청·응답 중복은 고유 제약으로 방지합니다. 다른 실행의 동일 원본은 계속 보관합니다.
- `finance_raw_error`: 단계, 출처 URL, 오류. URL의 API 키 매개변수와 오류 문자열의 키를 제거합니다.
- `finance_review_candidate`: 정제 결과 JSON, 해시, 기존 정책과 정확히 일치한 ID, 변경 필드명, `PENDING` 상태. 서비스 화면은 이 테이블을 읽지 않습니다.

새 테이블 네 곳은 RLS가 켜져 있고 anon/authenticated 권한과 정책이 없습니다. 수집 코드의 쓰기 대상은 위 네 테이블로 한정하고, 기존 `policy` 및 `policy_source`는 비교할 때 GET만 허용합니다. `finance_detail`에는 접근하지 않습니다. 수집 오류는 기존 정책 데이터에 영향을 주지 않습니다.

## JSON 형식

실제 DB에서 장학·금융 JSONB는 `policy.eligibility_conditions`(object), `policy.application_process`(array), `policy.required_documents`(array 또는 NULL)입니다. `finance_detail`에는 JSON/JSONB 컬럼이 없습니다. `policy_source.raw_data`는 출처 원본 JSONB이나 일부 행만 값이 있고 실행별 응답 이력은 아닙니다. `policy_field_verification.verified_value`는 검증 증거값이며 이 수집기는 사용하지 않습니다.

자격조건은 `required`/`exclusions`를 RAW 노드로 유지하고 `source_field`, `source_url`, `original_text`를 추가합니다. 연령·지역·소득·재산·취업·재학 문구는 있으면 `structured_hints.*_raw`에 별도로 보존합니다. 이 힌트는 백엔드 판정기의 입력이 아닙니다. `logic: UNVERIFIED`, `verification: 확인필요`, `eligibility_verified: false`이므로 자동 수집으로 `ELIGIBLE` 판정이 생기지 않습니다. AND/OR를 원문에서 확정할 수 없는 경우 묶지 않습니다.

신청 절차는 프론트엔드가 순서대로 표시하는 문자열 배열을 유지합니다. 기존 라벨·화살표·신청 방법 추출과 오래된 회차 방지 로직을 재사용하며, 명시되지 않은 인증·제출 단계는 만들지 않습니다. `NULL`은 세부 절차 미확인을 뜻합니다. 온라인·방문·우편 등의 방식은 실제 원문에서 확인된 `application_method`에 남습니다.

준비물은 기존 문자열 추출을 최종 단계에서 `{key, name, required, confirmed, condition, source_url}` 객체로 변환합니다. `key`는 서류명 해시로 안정적으로 만들고 중복을 제거합니다. `required`는 필수/선택/해당자 문구로 확정할 수 있을 때만 true/false이며 불명확하면 null입니다. 자동 추출의 `confirmed`는 false입니다. 기존 객체형 항목은 키와 검증 플래그를 그대로 유지합니다. 체크리스트의 `user_document_check.doc_key`는 저장된 key를 사용하므로 검토 후 게시할 경우 키 변경에 따른 기존 체크 상태 마이그레이션을 검토해야 합니다.

## 후속 단계

비운영 DB에서 DDL·RLS·원본 응답 크기·오류 복구·일일 실행을 검증합니다. 검토 담당자가 원본과 추출 JSON, 비교 필드를 대조한 뒤 별도의 승인·게시 흐름을 설계해야 합니다. 정제 결과는 기존 정책 데이터에 자동 반영하지 않습니다. 스케줄러와 프론트엔드 변경은 이 단계에 포함하지 않습니다.

### 비운영 DB 검증 순서

1. `policy`, `finance_detail`, `policy_source` 구조가 있는 별도 테스트 프로젝트에서 기존 두 정책 테이블의 행 수를 기록합니다. 테스트 프로젝트의 URL과 서버 전용 키만 테스트 셸에 설정합니다.
2. `sql/finance_raw_staging.sql`을 테스트 프로젝트에 한 번 적용합니다. 같은 이름의 객체가 있으면 트랜잭션이 실패해야 하므로 구조를 확인하고 재실행 여부를 결정합니다.
3. `sql/finance_raw_staging_verify.sql`을 실행합니다. 네 테이블 모두 RLS가 켜져 있고 anon/authenticated SELECT가 false, service_role DELETE가 false이며, 정책 행은 0개여야 합니다. 기본키·외래키·고유 제약과 세 identity 시퀀스 권한을 확인합니다.
4. `--raw-only --max-pages 1`을 두 번, `--stage-review --max-pages 1`을 한 번 실행합니다. 각각 다른 `run_id`가 생기고 동일 응답 해시가 실행별로 보존되는지, 한 실행 안에 동일 요청·본문·HTTP 상태의 중복이 없는지 확인합니다. 검토 후보의 `NO_EXACT_MATCH`는 신규 *후보*일 뿐 확정 신규 정책이 아닙니다.
5. 오류·429·타임아웃·대용량 본문은 오프라인 테스트로 먼저 확인하고, 테스트 프로젝트에서는 응답 저장 크기와 30초 REST 타임아웃, 부분 실패 후 실행 상태를 확인합니다. 실제 원본 API 호출량과 `Retry-After` 정책도 확인해야 합니다.
6. 다시 `policy`·`finance_detail` 행 수 및 관심 JSON 필드의 해시를 대조합니다. 이 수집 경로가 두 테이블을 수정하지 않았음을 확인한 후에만 운영 적용을 검토합니다.
