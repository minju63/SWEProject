# 지도 탭 연동 명세

- 작성: 김대환 (지도 탭·문화 데이터)
- 기준: SRS 통합본 v0.6-1, 브랜치 `feature/map-place-list` (2026-11-14)
- 목적: 지도 탭과 맞물리는 다른 탭의 기능, 주고받는 값, 공통 DB 변경을 한곳에 정리했습니다. 각 항목의 담당자께서 확인해 주시고, 다르게 구현하실 경우 말씀해 주시면 지도 쪽을 맞추겠습니다.

## 1. 요청 사항 요약

| 담당 | 요청 | 관련 SRS | 지도 쪽 상태 |
|---|---|---|---|
| 백민주 님 | AI 비서 장소 카드·[전체 보기]에서 지도 열기 (2절 주소 규칙) | FR-A17, FR-MAP-028, AC-MAP-021, AC-14 | 받는 쪽 구현 완료 |
| 백민주 님 | AI 비서 장소 답변의 장소 데이터는 `GET /api/v1/places` 또는 `v_map_places` 로 읽기 (3절) | FR-A17, AI-REQ-06 | API 완료 |
| 백민주 님 | 홈 '공간·시설' 전체 보기 → `/map` 으로 이동 | FR-H11 | 받는 쪽 구현 완료 |
| 백민주 님 | Dr.부를 숨겼을 때 지도 헤더 알림 버튼 옆 얼굴 버튼 (5절) | FR-A06 | 자리만 비워 둠 |
| 백민주 님 | 공통 테이블 사용 내용 확인 (7절) | — | 반영 완료 |
| 박은혜 님 | 지도 탭용 거주 구 응답 (거주 구만 돌려주기) (4절) | FR-MY-017, NFR-MAP-011, AC-MY-017 | 화면은 `region_code` 만 사용 중 |
| 박은혜 님 | 프로필 저장 뒤 `['profile']` 쿼리 갱신 | FR-MAP-005 | — |
| 박은혜 님 | 탈퇴 시 찜(`user_saved_places`) 삭제 확인 | NFR-MAP-012, NFR-016 | `auth.users` 삭제 시 자동 삭제 |
| 박은혜 님 | 알림 아이콘의 안 읽은 수·30초 갱신·99+ 표시 | FR-COM-17 | 공용 `NotificationBell` 사용 중 |
| 박은혜 님 | 문화행사·주변 시설 알림을 만들 때 현재 위치를 쓰지 않기 | FR-MY-008, NFR-MAP-009 | — |
| 박은혜 님 | (선택) 마이 탭에 찜한 장소 목록 | UI-MAP-06 | 찜 API 완료 |
| 서여경 님 | 검색 목록에서 문화 행사(`item_type = 'EVENT'`) 처리 방식 결정 (6절) | FR-SRCH, DATA-SRCH-04 | — |
| 서여경 님 | 문화 정책 상세의 공식 페이지 최종 확인일 표시 (선택) | DATA-MAP-16, DATA-SRCH-04 | 하루 1회 기록 중 |
| 모두 | 브랜치를 받은 뒤 `npm install` (backend·frontend), SQL 실행 여부 확인 (8절) | — | — |

## 2. 다른 화면에서 지도 열기 (FR-MAP-028)

지도 탭은 주소의 쿼리 문자열로 여는 상태를 받습니다. 지도 탭에 이미 있을 때 다시 이동해도 매번 적용됩니다.

| 쿼리 | 값 | 동작 |
|---|---|---|
| `place` | 장소 번호 `place_id (장소 UUID)` 또는 `place_key (원본 장소 키, 예: LIB-39b9d0f5)` | 지도 중심을 그 장소로 옮기고 마커를 강조한 장소 카드 상태로 엽니다. 지도에 없는 장소면 '장소 정보를 찾을 수 없어요'를 띄웁니다 |
| `category` | `category_code (지도 카테고리 코드)`: `culture` 문화시설, `library` 도서관, `sports` 체육시설, `public_facility` 공공시설, `youth_space` 청년공간 | 그 카테고리 칩을 선택한 상태로 엽니다 |
| `q` | 검색어 | 검색창에 넣고 검색을 실행합니다. 일치 1곳이면 그 장소 카드, 2곳 이상이면 검색 결과 목록 |

- `place` 가 있으면 `category`·`q` 는 쓰지 않습니다. `category` 와 `q` 는 함께 쓸 수 있습니다.
- 아무 쿼리도 없으면(`/map`) 전체 장소 목록으로 엽니다. 홈 '공간·시설' 전체 보기(FR-H11)는 `/map` 으로 이동해 주세요.
- 주소에 사용자 위치 좌표를 넣지 않습니다 (NFR-MAP-009·010).

```jsx
import { useNavigate } from 'react-router-dom';
const navigate = useNavigate();

navigate(`/map?place=${place.place_id}`);                           // AI 비서 장소 카드
navigate(`/map?category=library`);                                   // [전체 보기] - 카테고리
navigate(`/map?q=${encodeURIComponent('서면')}&category=library`);   // [전체 보기] - 검색어 + 카테고리
navigate('/map');                                                    // 홈 공간·시설 전체 보기
```

## 3. 장소 데이터 읽기 (AI 비서 FR-A17)

### 3-1. 읽는 곳

`place` 테이블에는 2026-11-14부터 **부산 전체 장소(약 1,000곳)** 가 들어갑니다(SRS DP-MAP-02). 지도에 나오는 장소는 그중 서비스 지역(사하구·부산진구)이면서 좌표 검증을 통과한 장소뿐이므로, 장소 답변은 아래 둘 중 하나로 읽어 주세요. `place` 를 직접 읽으면 서비스 지역 밖 장소와 좌표가 불확실한 장소가 섞입니다.

1. API: `GET /api/v1/places` (로그인 불필요)
2. DB 뷰: `v_map_places` (공개 읽기, 지도와 같은 조건)

뷰 조건: `is_active (사용 중)` 참, `is_target (서비스 지역 여부)` 참, 좌표 있음, `coord_status (좌표 검증 상태)` 가 `verified`·`fixed`·`coord_only`, 분류표에 있는 세부 유형.

### 3-2. `GET /api/v1/places` 응답

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "place_id": "uuid", "place_key": "LIB-39b9d0f5", "name": "부산광역시립시민도서관",
        "place_type": "도서관", "category_code": "library", "category_name": "도서관",
        "sort_order": 2, "color": "#3f8ad8",
        "region_code": "26230", "district": "부산진구", "address": "부산광역시 부산진구 ...",
        "lat": 35.0, "lng": 129.0, "coord_status": "verified",
        "tel": "...", "homepage_url": "...", "open_hours_text": "...", "closed_days_text": "...",
        "fee_text": null, "is_free": true, "fee_type": "free", "reservation_url": null, "capacity": 300,
        "image_url": null, "image_source": null, "description": null,
        "source_name": "tn_pubr_public_lbrry_api", "last_collected_at": "...", "source_checked_at": "...",
        "live_event_count": 0, "next_event_status": null
      }
    ],
    "categories": [{ "category_code": "culture", "category_name": "문화시설", "sort_order": 1, "color": "#8b63d0" }],
    "totalCount": 108,
    "sync": { "last_success_at": "...", "next_run_at": null }
  }
}
```

- 장소 카드에 쓰실 값: `name`, `category_name`, `address`. 거리는 표시할 수 있을 때만 브라우저에서 계산해 주세요.
- 장소 유형 질문(예: "서면 근처 도서관")은 `category_code`·`place_type`·`district`·`address` 로 거르시면 됩니다. 세부 유형: 공연장·전시공간(문화시설), 도서관, 체육시설, 공공시설, 청년공간.
- 응답에 없는 장소(서비스 지역 밖, 좌표 확인 필요)는 "확인된 정보가 없어요"로 답해 주세요(FR-A17).
- 상세: `GET /api/v1/places/:placeId` → 위 항목 + `events` (진행·예정 행사).

### 3-3. 위치 정보 (AI-REQ-06, NFR-MAP-010)

- 현재 위치 좌표를 LLM 입력과 서버 요청에 넣지 않습니다. 거리순 정렬은 브라우저에서만 계산합니다.
- 장소 좌표(`lat`, `lng`)도 화면에 숫자로 표시하지 않습니다 (NFR-MAP-025).

## 4. 마이 탭 연동

### 4-1. 거주 구와 사용자 번호 (FR-MY-017, NFR-MAP-011)

- 지도는 `useQuery({ queryKey: ['profile'], queryFn: fetchProfile, select: (p) => p?.region_code })` 로 거주 구만 꺼내 씁니다. 사용자 번호는 `useAuthStore` 의 `user.id` 를 찜 요청에만 씁니다.
- 지금 `GET /api/v1/me/profile` 은 프로필 전체(`select *`)를 돌려줍니다. SRS는 지도 탭이 거주 구와 사용자 번호만 받도록 정하고 있어(AC-MY-017), 거주 구만 돌려주는 응답을 부탁드립니다. 예: `GET /api/v1/me/region` → `{ "region_code": "26380" }`. 만들어 주시면 지도 쪽 호출을 바꾸겠습니다.
- 마이 탭에서 거주 구를 저장한 뒤 `queryClient.invalidateQueries({ queryKey: ['profile'] })` 를 호출해 주시면 지도 초기 중심(FR-MAP-005)이 바로 바뀝니다.

### 4-2. 찜한 장소 (FR-MAP-018~020, P2)

| 메서드 | 경로 | 로그인 | 내용 |
|---|---|---|---|
| GET | `/api/v1/places/saved` | 필요 | `{ placeIds: [...] }` 찜한 장소 번호 (찜한 순서) |
| PUT | `/api/v1/places/:placeId/saved` | 필요 | 찜하기 (같은 장소는 한 번만 저장) |
| DELETE | `/api/v1/places/:placeId/saved` | 필요 | 찜 해제 |

- 테이블: `user_saved_places` — `user_id (사용자 번호)`, `place_id (장소 번호)`, `saved_at (찜한 시각)` 만 저장합니다. RLS로 본인 행만 읽고 바꿉니다.
- 마이 탭에 찜한 장소를 보여 주실 경우: `GET /places/saved` 의 번호를 `GET /places` 의 `items` 와 맞춰 쓰시면 됩니다. 지도에서 빠진 장소(좌표 확인 필요로 바뀐 곳)는 목록에 없으니 표시하지 않으면 됩니다.
- 쿼리 키 `['savedPlaces', user.id]` 를 함께 쓰시면 지도와 마이 탭의 찜 상태가 같이 갱신됩니다.

### 4-3. 탈퇴 (NFR-MAP-012, NFR-016)

- `user_saved_places.user_id` 는 `auth.users(id)` 를 참조하고 `on delete cascade` 입니다. 탈퇴 처리에서 Supabase Auth 사용자를 지우면 찜도 함께 지워집니다.
- 탈퇴를 앱 테이블 표시만으로 처리하시는 경우에는 7일 안에 `delete from user_saved_places where user_id = :id` 를 함께 실행해 주세요.

### 4-4. 알림 (FR-COM-17, FR-MY-008)

- 지도 헤더도 공용 `components/NotificationBell.jsx` 를 씁니다. 안 읽은 수 API를 연결하실 때 지도 헤더에도 그대로 반영되도록 컴포넌트 안에서 수를 읽어 주시면 지도 쪽 수정이 필요 없습니다.
- FR-COM-17은 100건 이상을 '99+'로 표시합니다. 지금 컴포넌트는 10건 이상을 '9+'로 표시합니다.
- 문화행사 알림의 데이터: `policy` (`item_type = 'EVENT'`) + `culture_detail` 의 `event_start_at (시작 시각)`, `event_end_at (종료 시각)`, `place_id (장소 번호)`, `venue_text (장소명 원문)`.
- 주변 시설 알림은 거주 구 기준으로만 만들어 주세요. 현재 위치는 서버·DB에 저장할 수 없습니다 (NFR-MAP-009).

## 5. 공통 헤더 (FR-A06)

- `frontend/src/pages/map/MapHeader.jsx` 맨 끝의 `NotificationBell` 옆에 Dr.부 얼굴 버튼 자리를 두었습니다.
- Dr.부 숨김 상태를 전역 상태(예: zustand store)로 두시고 `DrBuFaceButton` 같은 공용 컴포넌트를 만들어 주시면, 지도 헤더에 한 줄로 넣겠습니다. 지금 `AssistantButton.jsx` 는 숨김 상태를 컴포넌트 안에만 들고 있어 헤더가 알 수 없습니다.

## 6. 검색·상세 연동

- `policy` 에 문화 행사가 `item_type = 'EVENT'` 로 들어 있습니다(부산 문화 행사 API, 하루 1회 갱신, 진행 중·예정만). 지금 `GET /api/v1/policies` 는 행사를 거르지 않으므로, 검색 결과에 행사를 넣을지 정해 주세요. 빼실 경우 `.eq('item_type', 'POLICY')` 조건이면 됩니다.
- 공간·시설은 SRS대로 검색 분야에서 빠지고 지도 탭이 다룹니다. `place` 는 검색 대상이 아닙니다.
- 문화 정책(온통청년 `YCU-xxx` 33건)은 하루 1회 온통청년 원본과 비교해 신청 기간·신청 주소를 갱신합니다.
- DATA-MAP-16: 문화 정책의 공식 기관 페이지를 하루 1회 확인해 `policy_source` 에 `source_type = 'CRAWL'`, `external_id = 'WEB-정책번호'`, `source_url (원문 주소)`, `last_checked_at (최종 확인일)` 로 남깁니다. 정책 상세에 '최종 확인일'을 보여 주실 경우 이 행을 쓰시면 됩니다.

## 7. 공통 DB 사용·변경 (백민주 님 확인)

| 테이블·뷰 | 지도 쪽 사용 | 비고 |
|---|---|---|
| `policy`, `culture_detail`, `policy_source`, `policy_region` | 문화 행사·문화 정책 적재와 갱신 | 행사 `item_type = 'EVENT'`, `collection_domain = 'CULTURE'` |
| `policy_source` (`source_type = 'CRAWL'`) | 공식 페이지 확인 기록 | 11-14 추가 |
| `collection_run`, `collection_error` | 하루 1회 갱신 기록 | `collection_domain = 'CULTURE'`, 오류 종류 `API`·`CRAWL`·`INTEGRITY` |
| `region` | 장소 소속 구 | 읽기만 |
| `place` | 지도 장소 (부산 전체, `is_target`) | 지도 전용 |
| `place_issues` | 수집 문제 목록 (사람이 확인) | 지도 전용, 화면에서 읽지 않음 |
| `map_category`, `place_type_map`, `v_map_places` | 지도 분류표·표시 대상 | 지도 전용 |
| `user_saved_places` | 장소 찜 | 지도 전용, RLS 본인 행 |

SQL 실행 순서 (`backend/supabase/migrations`, 실행은 대환이 합니다):

| 파일 | 실행 |
|---|---|
| `20261111_culture_place.sql` ~ `20261116_map_srs_fixes.sql` | 완료 |
| `20261117_map_srs_strict.sql` | 예정 (`place.is_target`, 문제 종류 추가, `v_map_places` 조건) |

## 8. 실행·배포

- 브랜치를 받은 뒤: `cd backend && npm install`, `cd frontend && npm install` (추가 패키지: backend `node-cron`·`node-html-parser`·`fast-xml-parser`, frontend `tailwindcss`·`@tailwindcss/vite`).
- frontend `.env`: `VITE_KAKAO_JS_KEY` (카카오맵 JavaScript 키). 카카오 개발자 콘솔에 등록한 도메인에서만 지도가 열리며, 지금은 `http://localhost:5173` 만 등록되어 있습니다. 배포 주소가 정해지면 알려 주세요. 등록하겠습니다.
- backend `.env`: `DATA_GO_API_KEY`, `YOUTHCENTER_API_KEY`, `DORO_KEY`, `COORDINATE_KEY` (지도 데이터 갱신용). 값은 대환에게 따로 받으시고 저장소에는 올리지 않습니다.
- 하루 1회 갱신은 `CULTURE_SYNC_ENABLED=true` 인 서버에서만 04:00(한국 시간)에 돕니다. 공용 DB에 쓰므로 각자 PC에서는 켜지 마세요. 배포 서버 한 곳에서만 켭니다.
- 배포 주소는 HTTPS여야 합니다 (NFR-MAP-015). 위치 권한도 HTTPS에서만 동작합니다.
