-- =====================================================================
-- 지도 탭 지원 (김대환, SRS v0.6 FR-MAP-001·015·024·031)
--   1. place.fee_type (요금 구분)             FR-MAP-024, FR-MAP-031
--   2. map_category, place_type_map (분류표)   FR-MAP-004, FR-MAP-031
--   3. culture_detail 행사 상세 4개 컬럼       FR-MAP-015
--   4. v_map_places (지도 표시 대상 장소 뷰)    FR-MAP-001
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run (다시 실행해도 안전)
-- 되돌리기: 맨 아래 주석의 rollback 블록
-- =====================================================================

begin;

-- 1. 요금 구분: free(무료), paid(유료), per_program(프로그램별 상이), unknown(근거 확인 못 함)
alter table place add column if not exists fee_type text;
alter table place drop constraint if exists place_fee_type_check;
alter table place add constraint place_fee_type_check
  check (fee_type in ('free', 'paid', 'per_program', 'unknown'));

-- 2. 분류표: 장소 세부 유형(place_type) → 지도 카테고리
create table if not exists map_category (
  category_code  text primary key,
  category_name  text not null unique,
  sort_order     smallint not null,
  color          text not null                      -- 마커·칩 색
);
create table if not exists place_type_map (
  place_type     text primary key,
  category_code  text not null references map_category(category_code)
);

insert into map_category (category_code, category_name, sort_order, color) values
  ('culture',         '문화시설', 1, '#8b63d0'),
  ('library',         '도서관',   2, '#3f8ad8'),
  ('sports',          '체육시설', 3, '#e0587a'),
  ('public_facility', '공공시설', 4, '#35a276'),
  ('youth_space',     '청년공간', 5, '#e8863a')
on conflict (category_code) do update
  set category_name = excluded.category_name, sort_order = excluded.sort_order, color = excluded.color;

insert into place_type_map (place_type, category_code) values
  ('공연장', 'culture'), ('전시공간', 'culture'), ('도서관', 'library'),
  ('체육시설', 'sports'), ('공공시설', 'public_facility'), ('청년공간', 'youth_space')
on conflict (place_type) do update set category_code = excluded.category_code;

alter table map_category enable row level security;
alter table place_type_map enable row level security;
drop policy if exists "public read" on map_category;
create policy "public read" on map_category for select using (true);
drop policy if exists "public read" on place_type_map;
create policy "public read" on place_type_map for select using (true);

-- 3. 행사 상세 (부산 다봄 상세 API 원문)
alter table culture_detail add column if not exists runtime   text;  -- 러닝타임
alter table culture_detail add column if not exists organizer text;  -- 주최·기획
alter table culture_detail add column if not exists casting   text;  -- 출연
alter table culture_detail add column if not exists crew      text;  -- 제작진

-- 4. 지도 표시 대상 장소
--    사용 중 + 좌표 있음 + 분류표에 있는 유형만. review(좌표 불확실)는 표시하고 화면에서 '위치 확인 필요'를 붙인다
--    (2026-11-13 결정, SRS FR-MAP-001 개정 예정).
drop view if exists v_map_places;
create view v_map_places with (security_invoker = true) as
select
  p.place_id, p.place_key, p.name, p.place_type,
  c.category_code, c.category_name, c.sort_order, c.color,
  p.region_code, r.region_name as district,
  p.address, p.lat, p.lng, p.coord_status,
  p.tel, p.homepage_url, p.open_hours_text, p.closed_days_text,
  p.fee_text, p.is_free, p.fee_type, p.reservation_url, p.capacity,
  p.image_url, p.image_source, p.description,
  p.source_name, p.last_collected_at
from place p
join place_type_map t on t.place_type = p.place_type
join map_category c on c.category_code = t.category_code
left join region r on r.region_code = p.region_code
where p.is_active
  and p.lat is not null and p.lng is not null
  and p.coord_status in ('verified', 'fixed', 'coord_only', 'review');

commit;

-- ---------------------------------------------------------------------
-- rollback (필요할 때만 주석을 풀고 실행)
-- ---------------------------------------------------------------------
-- begin;
-- drop view if exists v_map_places;
-- alter table culture_detail drop column if exists runtime;
-- alter table culture_detail drop column if exists organizer;
-- alter table culture_detail drop column if exists casting;
-- alter table culture_detail drop column if exists crew;
-- drop table if exists place_type_map;
-- drop table if exists map_category;
-- alter table place drop constraint if exists place_fee_type_check;
-- alter table place drop column if exists fee_type;
-- commit;
