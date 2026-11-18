-- =====================================================================
-- 지도 장소 법정동 (지도 검색 FR-MAP-021) (김대환, 2026-11-19)
--   동네 이름 검색을 주소 글자 대신 법정동으로 판단한다.
--   주소 글자로 찾으면 동 이름이 없는 도로명 주소(지도 장소 107곳 중 60곳)는 빠지고,
--   도로명에 든 동 이름('가야대로', '당감서로', '다대로')에는 다른 동 장소가 걸린다.
--   1. place.legal_dong: 행안부 도로명주소 검색 API 의 법정동(emdNm).
--      처음 값은 backend/scripts/culture/fillLegalDong.js 가 만든 SQL 로 넣고,
--      이후에는 하루 1회 갱신의 좌표 검증(coords.js)이 같은 검색 결과로 함께 고친다.
--   2. v_map_places 맨 끝에 legal_dong 을 더한다 (나머지는 20261117_map_srs_strict.sql 정의 그대로).
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run (다시 실행해도 안전)
-- 되돌리기: 맨 아래 주석
-- =====================================================================

begin;

alter table place add column if not exists legal_dong text;
comment on column place.legal_dong is
  '법정동 (행안부 도로명주소 검색 API emdNm). 지도 동네 검색용. 카카오 결과는 넣지 않는다';

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
  p.source_checked_at,
  p.legal_dong
from place p
join place_type_map t on t.place_type = p.place_type
join map_category c on c.category_code = t.category_code
left join region r on r.region_code = p.region_code
where p.is_active
  and p.is_target
  and p.lat is not null and p.lng is not null
  and p.coord_status in ('verified', 'fixed', 'coord_only');

commit;

-- 되돌리기 (필요할 때만): 뷰의 컬럼은 create or replace 로 뺄 수 없어 뷰를 다시 만든다.
-- 다시 만들면 뷰 권한(anon·authenticated·service_role select)도 다시 줘야 하므로,
-- 법정동 검색만 끄려면 프런트(mapUtils.js)를 되돌리는 쪽이 간단하다.
-- begin;
-- drop view v_map_places;
-- (20261117_map_srs_strict.sql 의 create view 문)
-- grant select on v_map_places to anon, authenticated, service_role;
-- alter table place drop column legal_dong;
-- commit;
