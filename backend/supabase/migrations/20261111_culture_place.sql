-- =====================================================================
-- 문화 파트 스키마 변경 (김대환, 2026-11-11)
--   1. 지도 장소 테이블 place 신설 (culture_detail.place_id 의 FK 대상)
--   2. culture_detail: culture_type 허용 값 확장, 컬럼 4개 추가, place FK 연결
-- 실행: Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 Run (한 번만)
-- 되돌리기: 맨 아래 주석의 rollback 블록
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 지도 장소
-- ---------------------------------------------------------------------
create table if not exists place (
  place_id           uuid primary key default gen_random_uuid(),
  place_key          text not null unique,         -- 원본 장소 키 (CUL-FC000178, LIB-xxxx, OPN-xxxx, YSP-xxxx)
  name               text not null,
  place_type         text not null check (place_type in ('공연장','전시공간','도서관','체육시설','청년공간','공공시설')),
  region_code        text references region(region_code),
  address            text,                         -- 화면 표시용 대표 주소
  road_address       text,
  jibun_address      text,
  lat                numeric(10,7),
  lng                numeric(10,7),
  coord_status       text check (coord_status in ('verified','fixed','review','coord_only')),
  tel                text,
  homepage_url       text,
  open_hours_text    text,                         -- 운영시간 원문
  closed_days_text   text,                         -- 휴관일 원문
  fee_text           text,                         -- 이용료 원문
  is_free            boolean,                      -- NULL = 확인필요 또는 프로그램별 상이
  reservation_url    text,
  capacity           integer,
  is_active          boolean not null default true,
  source_name        text,                         -- 수집 출처 API·페이지
  source_id          text,                         -- 출처 쪽 식별값
  raw_data           jsonb,                        -- 수집 원본 행
  last_collected_at  timestamptz,
  last_verified_at   timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index if not exists place_region_idx on place(region_code);
create index if not exists place_type_idx on place(place_type);

alter table place enable row level security;
drop policy if exists "public read" on place;
create policy "public read" on place for select using (true);

-- ---------------------------------------------------------------------
-- 2. culture_detail
-- ---------------------------------------------------------------------
alter table culture_detail drop constraint if exists culture_detail_culture_type_check;
alter table culture_detail add constraint culture_detail_culture_type_check
  check (culture_type in ('공연','전시','문화프로그램','문화할인','문화비지원','창작지원','교육·인력양성','청년공간'));

alter table culture_detail add column if not exists genre               text;     -- 장르 (클래식, 뮤지컬, 연극, 전시 ...)
alter table culture_detail add column if not exists price_text          text;     -- 관람료 원문
alter table culture_detail add column if not exists support_amount      integer;  -- 1인당 지원 금액(원), 못 정하면 NULL
alter table culture_detail add column if not exists support_amount_text text;     -- 지원 금액 원문

alter table culture_detail drop constraint if exists culture_detail_place_id_fkey;
alter table culture_detail add constraint culture_detail_place_id_fkey
  foreign key (place_id) references place(place_id) on delete set null;
create index if not exists culture_detail_place_idx on culture_detail(place_id);

commit;

-- ---------------------------------------------------------------------
-- rollback (필요할 때만 주석을 풀고 실행)
-- ---------------------------------------------------------------------
-- begin;
-- alter table culture_detail drop constraint if exists culture_detail_place_id_fkey;
-- drop index if exists culture_detail_place_idx;
-- alter table culture_detail drop column if exists genre;
-- alter table culture_detail drop column if exists price_text;
-- alter table culture_detail drop column if exists support_amount;
-- alter table culture_detail drop column if exists support_amount_text;
-- alter table culture_detail drop constraint if exists culture_detail_culture_type_check;
-- alter table culture_detail add constraint culture_detail_culture_type_check
--   check (culture_type in ('문화프로그램','전시','공연','문화할인'));
-- drop table if exists place;
-- commit;
