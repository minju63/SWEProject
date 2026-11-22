# SWproject 원본 저장 테이블 운영 적용 결과

대상: `flkoszigqobfkztbvsyw` (`SWproject`), 2026-11-22. 승인된 신규 원본 저장 테이블 4개만 운영 DB에 생성했다. 마이그레이션 기록: `20261122001752_finance_raw_staging_prod_20261122`.

## 변경 전 확인

- `policy` 502행, 내용 MD5 `96ae05432ec9aac83ed9fe00e93871cd`
- `finance_detail` 93행, 내용 MD5 `f05eb9db794768a98bf3924320255fd9`
- 장학·금융 정책 93행, 검증된 자격조건 27행, 자격조건·절차·서류·검증 플래그 MD5 `867bdcc0aaf41d28548f26e9c82cb670`
- 예정된 신규 테이블·인덱스·시퀀스 이름 충돌 0건
- 기존 정책 전체 행 내보내기/백업은 실행하지 않았다.

## 생성 및 권한 검증

`sql/finance_raw_staging.sql`을 적용해 `finance_raw_run`, `finance_raw_response`, `finance_raw_error`, `finance_review_candidate`를 생성했다. 기본키 4개, 신규 실행 테이블을 가리키는 외래키 3개, 실행별 중복 방지 고유 제약 2개, 명시적 보조 인덱스 4개와 identity 시퀀스 3개를 확인했다.

네 테이블의 RLS가 모두 활성화돼 있다. `anon`과 `authenticated`의 SELECT/INSERT/UPDATE/DELETE 권한은 모두 false이고 정책은 0개다. `service_role`의 SELECT/INSERT는 네 테이블에서 true, UPDATE는 실행 테이블에서만 true, DELETE는 모두 false다. 시퀀스 USAGE는 `service_role`만 true다. 이 검증을 통과한 뒤에만 저장 테스트를 했다.

## 가상 데이터 저장 및 정리

`sql/finance_raw_staging_prod_smoke.sql`을 `service_role`로 실행했다. 가상 실행 ID `7e023ff0-e452-480d-b42c-007d38f662b8`에 원본 응답 1건과 검토 후보 1건이 저장됐고 오류는 0건이었다. 원본 식별자는 `SMOKE-ONLY`, 검토 상태는 `PENDING`, 자격조건 검증 상태는 false였다. 실제 외부 API 요청이나 수집기 실행은 하지 않았다.

저장 후 기존 정책 행 수와 위 해시 3개가 모두 변경 전과 같았다. 이어 `sql/finance_raw_staging_cleanup_smoke.sql`이 네 staging 테이블을 잠그고 정확히 이 가상 행들만 존재하는지 검사한 뒤, 검토 후보→원본 응답→실행 순으로 3행을 삭제했다. 최종 확인에서 신규 테이블 4개는 존재하고 RLS가 켜져 있으며, 네 테이블의 행 수는 모두 0이다. 기존 정책 행 수·해시도 다시 확인해 동일했다.

`policy`, `finance_detail`과 검증된 JSON에 대한 쓰기·구조 변경, `--sync-db`, 실제 대량 수집, GitHub Actions 활성화는 하지 않았다. 이 테스트는 PostgreSQL 권한과 JSONB 저장만 확인했으며 실제 수집기의 REST 호출·외부 API 경로는 검증하지 않았다.
