# 주거정책 수집·검토·적재 자동화

2026-11-19: 최신 DB 형식 통일은 [적재 형식 안내](README.contract.md)를 참고하세요. 자동·검토 적재는 공통 형식 검사를 사용합니다. 읽기 전용 대조 명령은 `housing-sync.cmd check-contract`입니다.

## 매일 자동 적재 — 2026-11-17 추가

사용자 승인에 따라 `housing-sync.cmd daily`는 새 수집 후 신규 온통청년 정책을 자동 INSERT합니다. 기존 `scan`/수동 `publish` 명령은 그대로 사용할 수 있습니다. `daily --preview`는 DB에 쓰지 않습니다.

Windows 작업 `SWEProject-Housing-Daily`는 매일 로컬시각09:00에 실행합니다. 이 PC가 켜져 있고 사용자 로그인 상태여야 합니다. 예약 시각을 놓치면 다음 이용 가능 시 실행합니다. PC가 꺼져 있는 동안 서버에서 실행되는 방식은 아닙니다. 실행 로그는 `research/housing-sync/daily-logs`에 저장합니다.

자동 적재 범위는 적용지역 코드가 확인된 신규 API 정책이며 공식 HTML 원문·API 원본을 함께 보존합니다. 기존 제목/URL·출처 중복, 만료된 단일 신청기간, 이벤트 의심, 첨부 해석 필요, 원문 접근실패는 건너뜁니다. LH/BMC 공고는 수집·검토목록으로 남습니다. 신규 금액·금리·기간 상세는 추측하지 않고NULL, 유형NULL·소분류기타, 자격은UNVERIFIED/eligibility_verified=false로 저장합니다. 지역코드는 원본 분류이며 개인의 자격 검증 완료를 뜻하지 않습니다. 원본 지원내용은 그대로 저장합니다.

기존 정책의 금액·신청기간·조건을 자동 UPDATE/DELETE하지 않습니다. 기존 원문 변경은 source_changes.json에 기록합니다. 실패 시 저장된 auto_bundle을 먼저 재개하며, 이미 동일한 내용으로 들어간 행은 재사용합니다. 여러 테이블에 걸친 단일 트랜잭션은 아닙니다. 오류·원문 변경 시 중단하고 daily_pending.json과 auto_bundle/result.json에서 원인을 확인합니다. 임의로 실패 잠금을 삭제하기 전에 실행 프로세스를 확인하세요.

프로젝트 루트에서 Node.js 18 이상으로 실행합니다. 별도 패키지 설치는 필요 없습니다. 실행 방식은 사용자가 선택한 **명령 실행 → 사람이 검토 → 승인 항목만 적재**입니다.

## 1. 수집

PowerShell:

```powershell
.\housing-sync.cmd scan
```

또는 어느 운영체제에서든:

```text
node backend/scripts/housing-sync/cli.cjs scan
```

기존 `.env`만 사용합니다. 루트 `.env`의 `YOUTHCENTER_API_KEY`, `backend/.env`의 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`가 필요합니다. 키를 코드·검토표에 입력하지 마세요.

수집 명령은 DB를 읽기만 합니다. 실행 결과는 `research/housing-sync/latest.json`에 안내된 폴더에 저장합니다. `state.json`의 `last_run`은 최근 **실제 조회** 실행입니다. 파일 실행 ID는 UTC, 보고서 시간은 한국 시간입니다.

- `검토표.xlsx`, `결과.md`: 집중 조사와 후보 목록
- `candidates.csv/json`: 새 후보, 지역 범위, 기존 정책과의 중복·연관
- `draft_44columns.csv/json`: 기존 공통 조사 포맷의44컬럼 초안. 미확인 금액·나이·날짜·최종확인일은 비워둡니다. 적재 파일이 아닙니다.
- `source_changes.json`: 기존 80건 등 주거 정책 원문 해시 변화
- `sources.json`: 조회한 원문 전체와 해시, 실패·추가 검토 상태
- `scan_inputs.json`, `api/*.json`: API 전체 응답과 DB 읽기 스냅샷
- `notice_lists.json`: LH 부산·BMC 목록 원문과 발견 공고
- `reviews.template.json`: 기본값이 모두 `pending`인 검토 양식

API는 총건수에 따라 끝까지 페이지를 읽습니다. 페이지 상한·중복 페이지·중간 실패는 완전 수집으로 처리하지 않습니다. 지역은 전국·부산 전체·부산진구·사하구만 후보로 분류하고, 다른 구 단독 사업은 제외합니다. 지역 코드가 없으면 전국으로 추정하지 않습니다.

API의 일시적500·429와 연결 오류는 읽기 요청만 최대3회 재시도합니다. 그래도 실패하면 `PARTIAL_REVIEW_REQUIRED`로 남기고 적재를 막습니다. 실패한 실행의 ID로 `.\housing-sync.cmd scan --resume RUN_ID`를 실행하면 실패한 API 조회를 재개하고,24시간 이내 성공한 공개 원문은 조회 시각을 유지한 채 재사용합니다. 실제 적재 직전에는 승인한 원문을 다시 조회해 해시를 확인합니다. 기본 `scan`은 새로 조회합니다.

LH 부산과 BMC 목록은 `config.json`에 정한 앞쪽 페이지를 확인하는 **제한된 탐색**입니다. 전체 공고를 모두 찾았다고 보장하지 않습니다. 주택 공급 위치와 신청자 거주자격은 다릅니다. 공고 첨부·정정·관련 사업은 사람이 검토해야 합니다. API 후보의 공식 상세 조회는 실행당 상한이 있으며, 미조회 항목은 `NOT_FETCHED`로 남깁니다.

기존 원문의 해시가 달라져도 자격 변경으로 확정하거나 기존 DB 행을 자동 수정하지 않습니다. 첫 실행은 비교 기준선을 만듭니다. 접근 실패와 미조회 항목은 검증 완료가 아닙니다. PDF/HWPX는 원본을 보존하지만 이 도구는 첨부 자격을 자동 해석하지 않습니다. 예산자료만 있는 사업·과거 한시 상품은 승인 입력이 차단됩니다.

## 2. 검토

실행 폴더의 `reviews.template.json`을 프로젝트 내부의 `research/housing-sync/reviews.json` 등으로 복사하고, 넣을 항목만 `decision`을 `approve`로 바꿉니다. 기본 양식 그대로는 적재되지 않습니다.

필수 확인:

1. `reviewer`, `reviewed_at`(시간대 포함 ISO 시각), `review_notes`를 기록합니다.
2. 적용 지역·현재 개인 신청자격·기존 사업과의 관계를 확인한 후 각각 `scope_verified`, `qualifications_reviewed`, `duplicate_relation_reviewed`를 `true`로 바꿉니다.
3. 검토한 원문의 `source_key`, `expected_source_sha256`를 유지합니다. 다른 원문으로 바뀌면 재수집·재검토합니다.
4. `policy`의 대상·지원·신청방법·기간을 확정합니다. 제도 운영기간을 신청기간으로 옮기지 마세요. 모르는 날짜는 `null`, 실제 연중 접수 근거가 있을 때만 `is_always_open=true`입니다.
5. `eligibility_conditions.required/exclusions`를 신청자·배우자·자녀·가구 기준으로 작성합니다. AND/OR를 명시하고 기관 심사나 미확정 예외는 `MANUAL_REVIEW`로 남깁니다. `min_age/max_age`는 `null`을 유지합니다.
6. 금액은 원 단위 숫자, 모르는 값은 `null`입니다. `region_codes`는 `KR`, `26`, `26230`, `26380` 중 실제 해당 범위를 고릅니다. `subcategory_name`은 현재 DB에 있는 주거 소분류 이름을 사용합니다. 새 공통 분류는 자동 생성하지 않습니다.

검토용 조건 예:

```json
{
  "required": [
    {
      "operator": "AND",
      "conditions": [
        {"subject": "household", "field": "all_members_homeless", "operator": "EQ", "value": true},
        {"subject": "authority", "operator": "MANUAL_REVIEW", "text": "소득·자산·우선순위와 예외를 공식 공고로 확인"}
      ]
    }
  ],
  "exclusions": [
    {"subject": "authority", "operator": "MANUAL_REVIEW", "text": "중복지원 및 제외대상 확인"}
  ]
}
```

이는 형식 예시이며 사업별 실제 조건을 대신하지 않습니다. 개인 자격을 자동 확정하지 않습니다. 적재 시 `eligibility_verified=false`를 유지하고 `required/exclusions/review_notices`로 조건·제외·검토 안내를 분리합니다. 신청절차·준비물은 공식 본문과 일치하는 API 내용만 추출합니다.

현재 공통 상태뷰에서 주거 EVENT의 날짜가 반영되지 않는 문제가 있어 EVENT 적재는 차단합니다. 행사 유형을 POLICY로 바꿔 우회하지 마세요.

## 3. 적재 미리보기 → 실제 적재

`RUN_ID`는 검토한 **실제 조회 실행**의 ID입니다. 아래 명령의 대문자 부분은 실제 값으로 바꾸세요.

```powershell
.\housing-sync.cmd publish --run RUN_ID --reviews research/housing-sync/reviews.json
```

검증된 입력 파일이 해당 실행 폴더의 `approved_bundle/`에 생성됩니다. 이 단계는 DB 쓰기 0건입니다. 승인 항목이 없으면 `NO_APPROVED_ROWS`로 끝납니다.

검토표와 미리보기 확인 후:

```powershell
.\housing-sync.cmd publish --run RUN_ID --reviews research/housing-sync/reviews.json --apply
```

실제 적재 직전에 DB 중복·분류·지역·컬럼을 재조회하고, 승인한 공식 원문 해시를 다시 확인합니다. 원문이 달라지면 멈추며 다시 검토해야 합니다. API를 근거로 쓴 경우 해당 정책이 포함된 전체 API 응답도 `policy_source.raw_data`에 보관합니다.

새 정책·상세·출처·지역·소분류 연결만 INSERT합니다. 기존 행 UPDATE/DELETE나 스키마 변경은 없습니다. 같은 입력을 재실행하면 동일 UUID와 내용이 확인되는 행을 재사용합니다. 기존 내용이 다르면 멈춥니다.

REST 요청은 테이블별 처리로 **전체 단일 트랜잭션이 아닙니다**. 오류가 나면 `load_result.json`을 확인하고 원인을 해결한 뒤 같은 입력으로 재개합니다. 각 단계는 입력 후 다시 읽어 대조하며 모집상태는 저장하지 않고 뷰로 확인합니다. 쓰기 권한·현재 DB CHECK·트리거는 실제 적재에서 오류가 날 수 있습니다.

## 확인 명령

```powershell
.\housing-sync.cmd scan --offline
.\housing-sync.cmd notices
node --test backend/scripts/housing-sync/sync.test.cjs
```

`--offline`은 캐시를 재분석하며 네트워크·DB 쓰기를 하지 않습니다. 캐시 실행은 적재할 수 없습니다. `notices`는 LH/BMC 목록 어댑터만 읽기 전용으로 확인합니다. 테스트의 적재는 가상 DB를 사용하며 실제 Supabase에는 쓰지 않습니다.

수집할 공식 출처와 검색어는 `config.json`에서 추가합니다. 이 도구는 온통청년 API·지정 출처·LH/BMC 일부 목록을 자동화하며, 웹 전체 탐색이나 복잡한 법적 자격의 완전 검증을 대신하지 않습니다.

## 신청절차·준비물 매일 자동 적재 (2026-11-17)

기존 오전 9시 작업에 `application_process`와 `required_documents` 적재를 추가했습니다. 신규 정책은 공식 본문에서 확인되는 신청절차·준비물을 함께 넣습니다. 기존 주거 정책은 두 컬럼이 NULL인 경우에만 채웁니다. 이미 입력된 값은 유지하고, 수집한 내용과 다르면 검토 목록에 남깁니다. 개인별 준비물 체크 상태는 변경하지 않습니다.

API 정책명과 공식 URL이 모두 일치하고, API의 절차·서류 내용이 공식 본문에서도 확인되어야 자동 반영합니다. 별도 검토한 주택도시기금 10개 정책은 등록된 공식 이용절차 구간이 그대로인지 재확인합니다. 첨부파일만 있거나 조건·면제 문구가 불명확하거나 원문이 달라지면 자동 반영하지 않습니다. 따라서 모든 정책의 빈 칸이 반드시 채워지는 것은 아닙니다.

서류는 `{key, name, required, confirmed}` 형식입니다. 해당자 서류의 조건을 이름에 남기고 `required=false`로 저장합니다. `confirmed`는 출처 확인 여부이며 이용자의 준비 완료 여부가 아닙니다.

실행별 `application_info/plan.json`, `application_info/result.json`, `application_info/sources/`에 계획·반영 결과·공식 근거를 보관합니다. 전체 결과는 `daily_result.json`, 최근 완료는 `research/housing-sync/daily_latest.json`입니다. 두 단계가 완료되어야 당일 완료로 기록하며 실패하면 다음 실행에서 재개합니다.

```powershell
.\housing-sync.cmd daily
.\housing-sync.cmd daily --preview
.\housing-sync.cmd application-info --run RUN_ID
.\housing-sync.cmd application-info --run RUN_ID --apply
```

`application-info` 단독 실행은 기본 미리보기입니다. 기존 수동 `publish`의 입력 양식은 그대로 유지하며, 위 두 컬럼의 자동 보완은 `daily`의 별도 단계에서 처리합니다. 예약은 이 PC가 켜져 있고 사용자 로그인 상태일 때 실행됩니다.
