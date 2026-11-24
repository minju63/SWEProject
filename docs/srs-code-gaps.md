# 코드와 SRS v0.7이 다른 곳

> **처리 현황(2026-11-24)**: 1·2·3·5·8번은 코드를 SRS에 맞춰 고쳤다. 6번은 SRS 문구를 코드에 맞추기로 해서 고칠 문구를 `srs-edit-proposals.md`에 정리했다. 4번·7번은 아직 정하지 않았다. 아래 표는 고치기 전 상태다.

점검일: 2026-11-24 · 기준: SRS v0.7(축약·수정본), `develop` 브랜치 코드, 실제 Supabase 스키마
점검 범위: 숫자·동작을 코드로 확인할 수 있는 항목만. 화면 모양, 성능 측정(2초·10초), 위치 권한 동작, 인증번호 재발송 60초·오류 5회 제한(DB 함수에 있어 이 저장소에 없음)은 확인하지 못했다.

## 1. 코드가 SRS와 다른 곳

| # | SRS 요구사항 | 현재 코드 | 코드 위치 | 크기 |
|---|---|---|---|---|
| 1 | NFR-COM-001: AI 응답 95%는 10초 이내 | 정책 설명·비교 AI 제한 시간이 12초. (AI 비서는 6초라 문제없음) | `backend/src/services/ai-common.service.js`, `policy-explanation.service.js` (`timeoutMs = 12000`) | 작음 |
| 2 | NFR-COM-005: AI 지연시간·대체 여부 기록 | DB 로그(`ai_execution_log`)에는 성공·실패만 남고 걸린 시간은 서버 콘솔에만 찍힘. 정책 설명·비교 AI는 DB 로그가 없음 | `backend/src/lib/opsLog.js`, `assistant.service.js` (`[ai] ... ms=`) | 작음 |
| 3 | NFR-COM-026: 운영자의 데이터 변경(작업자·시각·대상) 기록 | `security_audit_log` 표는 있으나 기록하는 코드가 없고 30일 지난 행을 지우는 작업만 있음 | `backend/src/lib/opsLog.js` | 중간 |
| 4 | FR-SRCH-001: 정책명 또는 주요 키워드로 검색 | 정책 제목에 글자가 들어 있는지만 찾음. 지원 내용·대상 안의 키워드는 검색되지 않음 | `backend/src/repositories/policy.repository.js` (`ilike('title', ...)`) | 큼 |
| 5 | AI-REQ-COM-005: 인용 ID와 정책명·날짜·금액이 DB 근거와 일치하는지 검증 | AI 비서는 숫자와 정책명이 같은지만 검사하고 인용 ID는 검증하지 않음. (정책 설명·비교는 ID·숫자·URL까지 검사함) | `assistant.service.js` (`keepsFacts`) ↔ `ai-common.service.js` (`groundedAiText`) | 중간 |
| 6 | FR-A-008: 관심분야와 일치하는 후보를 TOP 3로 | 관심분야 일치를 먼저 두지만, 3건이 안 되면 다른 분야로 채움 | `assistant.service.js` (`recommend`), `recommend.service.js` (`sortRecommended`) | 작음~중간 |
| 7 | SRS 7.3: `places`·`events` 표, `v_map_events` 뷰 | 실제는 `place` 표와, `policy`의 행사 종류(`item_type = EVENT`)에 `culture_detail`을 더한 구조. 뷰는 없음. 기능은 동작하고 이름만 다름 | `backend/supabase/schema.sql`, `migrations/` | 큼(이름 변경 시) |
| 8 | AI-REQ-COM-004: 소득·가구·주거 형태 추출 | 미구현. SRS 비고에도 미구현으로 적혀 있음 | `assistant.service.js` (`extractWithLlm`, `sanitizeExtraction`) | 큼 |

## 2. SDD와 코드가 다른 곳

| # | SDD | 현재 코드 |
|---|---|---|
| 1 | ADR-007·008: 지도 탭이 공개 뷰를 DB에서 직접 읽음 | 서버 `/api/v1/places`를 거침. SRS 요구(위치·검색어 비전송, 앱 키는 읽기만)는 지켜짐 |
| 2 | ADR-013: 한국어 검색은 pg_trgm + 벡터 검색 | 제목 부분 일치만 사용(위 1-4와 같은 문제). SRS는 검색·상세·비교에 pgvector를 쓰지 않는다고 함 |

## 3. SRS와 맞는 것으로 확인한 것

- 알림 발송 작업 1분 주기, 알림 배지 30초 갱신·99+ 표시
- 홈 마감 임박: 14일 이내·최대 10개
- 직접 정한 알림 정책당 최대 10개
- 대화창 100px 내려서 닫기, AI 질문 300자 제한
- 네이버 백과사전 3초 제한·같은 용어 24시간 캐시
- 이메일 인증번호 5분 유효
- 검색 결과 페이지 20개, 검색 기본 정렬 추천순
- 운영 로그 30일 보관 후 삭제, 대화 기록 기기 저장 20개

## 4. 같이 고친 것

- SDD 6장에 "홈(/home)은 로그인 없이도 호출된다"고 쓴 것은 틀렸다. 서버가 `/home`보다 먼저 로그인 검사를 걸기 때문에 로그인해야만 호출된다. SDD에서 해당 문장을 지웠다.
