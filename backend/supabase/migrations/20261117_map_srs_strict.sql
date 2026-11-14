-- =====================================================================
-- 지도 데이터를 SRS v0.6-1 문구대로 맞춤 (김대환, 2026-11-14)
--   1. place.is_target (서비스 지역 장소 여부)                        DP-MAP-02
--      원천 4종에서 받은 부산 장소를 모두 place 에 두고, 사하구·부산진구 장소만 참으로 둔다
--   2. place.place_type 허용 값에 공공시설개방 세부 유형 '강의실·강당', '회의실' 추가
--      분류표(place_type_map)에 없는 유형이라 지도에는 나오지 않는다      FR-MAP-031
--   3. place_issues 종류 추가: merge_candidate (이름만 같거나 주소만 같은 장소) DP-MAP-02
--   4. v_map_places: 서비스 지역 + 좌표 검증 verified·fixed·coord_only 만     FR-MAP-001, DP-MAP-03
--      review(수동 확인 대상)·missing(좌표 없음) 장소는 지도에 나오지 않는다
--      (2026-11-11 '위치 확인 필요' 표시 결정을 SRS 대로 되돌림)
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run (다시 실행해도 안전)
-- 되돌리기: 맨 아래 주석의 rollback 블록
-- =====================================================================

begin;

-- 1. 서비스 지역 장소 여부. 지금 있는 장소는 소속 구로 채운다 (26230 부산진구, 26380 사하구)
alter table place add column if not exists is_target boolean not null default false;
update place set is_target = coalesce(region_code in ('26230', '26380'), false)
where is_target is distinct from coalesce(region_code in ('26230', '26380'), false);
create index if not exists place_is_target_idx on place(is_target);

-- 2. 세부 유형
alter table place drop constraint if exists place_place_type_check;
alter table place add constraint place_place_type_check check (place_type in (
  '공연장', '전시공간', '도서관', '체육시설', '청년공간', '공공시설', '강의실·강당', '회의실'));

-- 3. 문제 종류
alter table place_issues drop constraint if exists place_issues_issue_type_check;
alter table place_issues add constraint place_issues_issue_type_check check (issue_type in (
  'source_differs', 'source_changed', 'place_missing_in_source', 'new_place_candidate',
  'merge_candidate',  -- 이름만 같거나 주소만 같은 장소 (병합하지 않음)
  'event_place_unmatched', 'event_missing_in_source',
  'policy_unlinked', 'policy_missing_in_source', 'policy_new_candidate',
  'coord_review', 'api_error'));

-- 4. 지도 표시 대상 장소 (컬럼은 20261116 과 같고 조건만 바뀐다)
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
  and p.is_target
  and p.lat is not null and p.lng is not null
  and p.coord_status in ('verified', 'fixed', 'coord_only');

commit;

-- rollback (서비스 지역 밖 장소를 먼저 지워야 한다. 그 장소에 연결된 행사는 장소 연결만 끊긴다)
-- begin;
-- (v_map_places 는 20261116_map_srs_fixes.sql 의 정의로 다시 만든다)
-- delete from place_issues where issue_type = 'merge_candidate';
-- (place_issues 제약은 20261116_map_srs_fixes.sql 의 정의로 되돌린다)
-- delete from place where not is_target;
-- alter table place drop constraint if exists place_place_type_check;
-- alter table place add constraint place_place_type_check
--   check (place_type in ('공연장','전시공간','도서관','체육시설','청년공간','공공시설'));
-- drop index if exists place_is_target_idx;
-- alter table place drop column if exists is_target;
-- commit;
