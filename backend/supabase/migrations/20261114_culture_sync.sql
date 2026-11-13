-- =====================================================================
-- 지도 장소·행사 하루 1회 갱신 (김대환, SRS v0.6 FR-MAP-029, DP-MAP-01·02, DATA-MAP-13)
--   1. place.source_values, source_checked_at  공공데이터 원본 값 기준 (사람이 고친 값을 덮어쓰지 않기 위함)
--   2. culture_detail.detail_fetched           행사 상세 API 응답을 받았는지 (DP-MAP-01)
--   3. place_issues                             장소·행사 연결 실패, 새 장소 후보, 원본 변경 기록 (DATA-MAP-13)
-- 실행 기록은 팀 공통 collection_run, collection_error 에 남긴다 (테이블 변경 없음).
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run (다시 실행해도 안전)
-- 되돌리기: 맨 아래 주석의 rollback 블록
-- =====================================================================

begin;

-- 1. 공공데이터 원본 값 기준. 원본이 바뀌었고 DB 값이 이 기준과 같을 때만 자동 반영한다
alter table place add column if not exists source_values jsonb;        -- 마지막으로 받은 원본 값 (좌표 제외)
alter table place add column if not exists source_checked_at timestamptz;

-- 2. 행사 상세 API 응답 여부 (정책 행은 NULL)
alter table culture_detail add column if not exists detail_fetched boolean;
update culture_detail cd
   set detail_fetched = ps.source_name like '%DetailService'
  from policy_source ps, policy p
 where ps.policy_id = cd.policy_id
   and p.policy_id = cd.policy_id
   and p.item_type = 'EVENT'
   and cd.detail_fetched is null;

-- 3. 장소 문제 목록. 같은 문제(issue_type + ref_key)는 한 행으로 두고 마지막 확인 시각을 갱신한다
create table if not exists place_issues (
  issue_id       uuid primary key default gen_random_uuid(),
  issue_type     text not null check (issue_type in (
                   'source_differs',            -- 처음 비교에서 원본과 DB 값이 다름 (확인용)
                   'source_changed',            -- 원본이 바뀌었지만 반영하지 않음 (이름·주소·요금, 사람이 고친 값)
                   'place_missing_in_source',   -- 원본 목록에서 사라진 장소
                   'new_place_candidate',       -- 서비스 지역의 새 장소 후보
                   'event_place_unmatched',     -- 행사 장소를 장소 테이블에서 찾지 못함
                   'event_missing_in_source')), -- 행사 목록 API 에서 사라진 행사
  ref_type       text not null check (ref_type in ('place', 'venue', 'event')),
  ref_key        text not null,                 -- place_key, 행사 장소 키, 행사 external_id
  place_id       uuid references place(place_id) on delete set null,
  name           text,
  detail         text,
  status         text not null default '미처리' check (status in ('미처리', '확인', '해결', '무시')),
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  resolved_at    timestamptz,
  unique (issue_type, ref_key)
);
create index if not exists place_issues_status_idx on place_issues (status, issue_type);

-- 지도 화면(anon)은 읽지 않는다. 서버(service_role)만 쓴다
alter table place_issues enable row level security;

commit;

-- rollback
-- begin;
-- drop table if exists place_issues;
-- alter table culture_detail drop column if exists detail_fetched;
-- alter table place drop column if exists source_checked_at;
-- alter table place drop column if exists source_values;
-- commit;
