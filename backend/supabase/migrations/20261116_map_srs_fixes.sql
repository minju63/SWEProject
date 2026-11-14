-- =====================================================================
-- 지도 SRS 점검 반영 (김대환, SRS v0.6-1)
--   1. place 좌표 검증 컬럼 4개 (DATA-MAP-08, DP-MAP-03, AC-MAP-016)
--   2. place 요금 근거 컬럼 3개 (DP-MAP-04)
--   3. place_issues 종류 추가: coord_review(좌표 확인 필요), api_error(외부 API 오류) (UC-MAP-008 2A·5B·5E)
--   4. user_saved_places 찜 테이블 (FR-MAP-019, NFR-MAP-012, DATA-MAP-12)
--   5. v_map_places 에 원본 확인 일시(source_checked_at) 추가 (NFR-006 최신성)
-- 지금 값은 place.raw_data(처음 적재한 places.csv 행)에서 옮긴다. 좌표 값은 원본 그대로 옮기고 새로 만들지 않는다.
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run (다시 실행해도 안전)
-- 되돌리기: 맨 아래 주석의 rollback 블록
-- =====================================================================

begin;

-- 1. 좌표 검증: 원본 좌표, 좌표 출처, 행안부 좌표와의 거리(m). 행안부 좌표 자체는 fixed 장소의 lat·lng 로만 둔다
alter table place add column if not exists lat_src numeric(10,7);
alter table place add column if not exists lng_src numeric(10,7);
alter table place add column if not exists coord_source text;
alter table place add column if not exists coord_distance_m integer;
alter table place drop constraint if exists place_coord_source_check;
alter table place add constraint place_coord_source_check check (coord_source in ('source', 'mois_juso'));
alter table place drop constraint if exists place_coord_status_check;
alter table place add constraint place_coord_status_check
  check (coord_status in ('verified', 'fixed', 'review', 'coord_only', 'missing'));

update place set
  lat_src = nullif(raw_data->>'lat_src', '')::numeric,
  lng_src = nullif(raw_data->>'lng_src', '')::numeric,
  coord_source = nullif(raw_data->>'coord_source', ''),
  coord_distance_m = nullif(raw_data->>'coord_distance_m', '')::numeric::integer
where coord_source is null and raw_data ? 'coord_source';

-- 2. 요금 근거: user_provided(담당자 제공 안내)·rule(규칙)·source(원본 데이터)·web(공식 페이지)
alter table place add column if not exists fee_basis text;
alter table place add column if not exists fee_source_url text;
alter table place add column if not exists fee_checked_at date;
alter table place drop constraint if exists place_fee_basis_check;
alter table place add constraint place_fee_basis_check
  check (fee_basis in ('user_provided', 'rule', 'source', 'web'));

update place set
  fee_basis = nullif(split_part(raw_data->>'fee_basis', '(', 1), ''),
  fee_source_url = nullif(raw_data->>'fee_source_url', ''),
  fee_checked_at = nullif(raw_data->>'fee_checked_at', '')::date
where fee_basis is null and raw_data ? 'fee_basis';

-- 3. 문제 종류 추가
alter table place_issues drop constraint if exists place_issues_issue_type_check;
alter table place_issues add constraint place_issues_issue_type_check check (issue_type in (
  'source_differs', 'source_changed', 'place_missing_in_source', 'new_place_candidate',
  'event_place_unmatched', 'event_missing_in_source',
  'policy_unlinked', 'policy_missing_in_source', 'policy_new_candidate',
  'coord_review',   -- 좌표 확인 필요 (행안부 후보 여러 개, 원본과 300m 초과)
  'api_error'));    -- 외부 API 오류 (그 API 만 빼고 진행)
alter table place_issues drop constraint if exists place_issues_ref_type_check;
alter table place_issues add constraint place_issues_ref_type_check
  check (ref_type in ('place', 'venue', 'event', 'policy', 'api'));

-- 4. 찜: 사용자 번호·장소 번호·찜한 시각만 저장. 본인 행만 읽고 바꾸며 탈퇴하면 함께 지운다
create table if not exists user_saved_places (
  user_id   uuid not null references auth.users(id) on delete cascade,
  place_id  uuid not null references place(place_id) on delete cascade,
  saved_at  timestamptz not null default now(),
  primary key (user_id, place_id)
);
alter table user_saved_places enable row level security;
drop policy if exists "own rows" on user_saved_places;
create policy "own rows" on user_saved_places for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 5. 지도 뷰: 맨 끝에 원본 확인 일시 추가 (앞 컬럼은 그대로)
create or replace view v_map_places with (security_invoker = true) as
select
  p.place_id, p.place_key, p.name, p.place_type,
  c.category_code, c.category_name, c.sort_order, c.color,
  p.region_code, r.region_name as district,
  p.address, p.lat, p.lng, p.coord_status,
  p.tel, p.homepage_url, p.open_hours_text, p.closed_days_text,
  p.fee_text, p.is_free, p.fee_type, p.reservation_url, p.capacity,
  p.image_url, p.image_source, p.description,
  p.source_name, p.last_collected_at,
  p.source_checked_at
from place p
join place_type_map t on t.place_type = p.place_type
join map_category c on c.category_code = t.category_code
left join region r on r.region_code = p.region_code
where p.is_active
  and p.lat is not null and p.lng is not null
  and p.coord_status in ('verified', 'fixed', 'coord_only', 'review');

commit;

-- rollback
-- begin;
-- (v_map_places 는 20261113_map_support.sql 의 정의로 다시 만든다)
-- drop table if exists user_saved_places;
-- delete from place_issues where issue_type in ('coord_review', 'api_error');
-- (place_issues 제약은 20261115_culture_policy_sync.sql 의 정의로 되돌린다)
-- alter table place drop column if exists fee_checked_at, drop column if exists fee_source_url, drop column if exists fee_basis;
-- alter table place drop column if exists coord_distance_m, drop column if exists coord_source, drop column if exists lng_src, drop column if exists lat_src;
-- commit;
