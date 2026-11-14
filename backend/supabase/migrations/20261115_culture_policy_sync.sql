-- =====================================================================
-- 문화 정책(온통청년) 하루 1회 비교 결과를 place_issues 에 함께 기록 (김대환, SRS DATA-SRCH-01, FR-COM-06)
--   1. place_issues.policy_id     문제가 걸린 정책
--   2. issue_type 추가            policy_unlinked, policy_missing_in_source, policy_new_candidate
--   3. ref_type 추가              policy
-- 원본·DB 값 차이(source_differs, source_changed)는 장소와 같은 종류를 쓴다.
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run (다시 실행해도 안전)
-- 되돌리기: 맨 아래 주석의 rollback 블록
-- =====================================================================

begin;

alter table place_issues add column if not exists policy_id uuid references policy(policy_id) on delete set null;

alter table place_issues drop constraint if exists place_issues_issue_type_check;
alter table place_issues add constraint place_issues_issue_type_check check (issue_type in (
  'source_differs',            -- 처음 비교에서 원본과 DB 값이 다름 (확인용)
  'source_changed',            -- 원본이 바뀌었지만 반영하지 않음
  'place_missing_in_source',   -- 원본 목록에서 사라진 장소
  'new_place_candidate',       -- 서비스 지역의 새 장소 후보
  'event_place_unmatched',     -- 행사 장소를 장소 테이블에서 찾지 못함
  'event_missing_in_source',   -- 행사 목록 API 에서 사라진 행사
  'policy_unlinked',           -- 온통청년 원본과 연결 못 한 문화 정책
  'policy_missing_in_source',  -- 온통청년에서 사라진 문화 정책
  'policy_new_candidate'));    -- 새 문화 정책 후보

alter table place_issues drop constraint if exists place_issues_ref_type_check;
alter table place_issues add constraint place_issues_ref_type_check
  check (ref_type in ('place', 'venue', 'event', 'policy'));

commit;

-- rollback (정책 문제 행을 먼저 지워야 한다)
-- begin;
-- delete from place_issues where ref_type = 'policy';
-- alter table place_issues drop constraint place_issues_ref_type_check;
-- alter table place_issues add constraint place_issues_ref_type_check check (ref_type in ('place', 'venue', 'event'));
-- alter table place_issues drop constraint place_issues_issue_type_check;
-- alter table place_issues add constraint place_issues_issue_type_check check (issue_type in ('source_differs',
--   'source_changed', 'place_missing_in_source', 'new_place_candidate', 'event_place_unmatched', 'event_missing_in_source'));
-- alter table place_issues drop column if exists policy_id;
-- commit;
