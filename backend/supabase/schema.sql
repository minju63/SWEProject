-- =====================================================================
-- 청해 (부산 청년 정책 플랫폼) — Supabase(PostgreSQL) 스키마
-- 기준: 노션 "청해 — DB Entity 수정본" + DB 엔터티 정의서(파트별 상세·사용자 서비스 테이블)
-- 실행: Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. 공통 기준정보
-- ---------------------------------------------------------------------
create table policy_category (
  category_id        uuid primary key default gen_random_uuid(),
  category_name      text not null unique,          -- 취업·진로, 주거·생활, 장학·금융, 문화, 공간·시설
  is_search_enabled  boolean not null default true,
  sort_order         integer not null default 0
);

create table policy_subcategory (
  subcategory_id    uuid primary key default gen_random_uuid(),
  category_id       uuid not null references policy_category(category_id) on delete cascade,
  subcategory_name  text not null,
  sort_order        integer not null default 0,
  unique (category_id, subcategory_name)
);

create table region (
  region_code         text primary key,
  region_name         text not null,
  region_level        text not null check (region_level in ('NATION','CITY','GU')),
  parent_region_code  text references region(region_code)
);

-- ---------------------------------------------------------------------
-- 1. 정책 (공통)
-- ---------------------------------------------------------------------
create table policy (
  policy_id               uuid primary key default gen_random_uuid(),
  title                   text not null,
  category_id             uuid references policy_category(category_id),
  collection_domain       text not null check (collection_domain in ('JOB','HOUSING','FINANCE','CULTURE')),
  item_type               text not null default 'POLICY' check (item_type in ('POLICY','POSTING','EVENT')),
  target_summary          text,
  support_content         text,
  benefit_type            text,
  min_age                 smallint,
  max_age                 smallint,
  income_condition        text,
  application_start_date  date,
  application_end_date    date,
  is_always_open          boolean not null default false,
  application_method      text,
  application_url         text,
  official_url            text,
  eligibility_conditions  jsonb,                 -- 필수 조건·AND/OR·제외 조건
  eligibility_verified    boolean not null default false,
  application_process     jsonb,                 -- ["온라인 신청", ...]
  required_documents      jsonb,                 -- [{"key":"d1","name":"주민등록등본","required":true,"confirmed":true}]
  classification_method   text,
  classification_status   text check (classification_status in ('확정','확인필요')),
  last_verified_at        timestamptz,
  last_collected_at       timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (min_age is null or max_age is null or min_age <= max_age)
);
create index policy_category_idx on policy(category_id);
create index policy_end_date_idx on policy(application_end_date);

create table policy_subcategory_map (
  policy_id       uuid references policy(policy_id) on delete cascade,
  subcategory_id  uuid references policy_subcategory(subcategory_id) on delete cascade,
  primary key (policy_id, subcategory_id)
);

create table policy_region (
  policy_id    uuid references policy(policy_id) on delete cascade,
  region_code  text references region(region_code),
  primary key (policy_id, region_code)
);

-- 모집 상태·D-day 는 저장하지 않고 계산 (culture_detail 생성 뒤로 옮김, 아래 2-1 참고)

-- ---------------------------------------------------------------------
-- 2. 파트별 상세 (policy 와 1:1)
-- ---------------------------------------------------------------------
create table job_detail (            -- 취업·진로 (백민주)
  policy_id            uuid primary key references policy(policy_id) on delete cascade,
  job_type             text check (job_type in ('채용공고','인턴십','멘토링','취업상담','자격증지원','정장대여')),
  company_name         text,
  employment_type      text,
  job_field            text,
  work_region_code     text references region(region_code),
  salary_text          text,
  requirement_text     text,
  headcount            integer,
  support_amount       integer,
  support_limit_count  smallint,
  rental_days          smallint,
  program_mode         text check (program_mode in ('온라인','오프라인','혼합')),
  venue_text           text
);

create table housing_detail (        -- 주거·생활 (박은혜)
  policy_id             uuid primary key references policy(policy_id) on delete cascade,
  housing_support_type  text check (housing_support_type in ('청년주택','월세지원','전세지원','이사비','공과금','교통비')),
  monthly_amount        integer,
  total_amount_max      integer,
  support_months        smallint,
  payment_method        text,
  deposit_max           integer,
  monthly_rent_max      integer,
  loan_limit            integer,
  interest_rate         numeric(5,2),
  housing_kind          text,
  supply_units          integer,
  exclusive_area_max    numeric(6,2)
);

create table finance_detail (        -- 장학·금융 (서여경)
  policy_id            uuid primary key references policy(policy_id) on delete cascade,
  finance_type         text check (finance_type in ('장학금','저축','자산형성','학자금대출','이자지원')),
  support_amount       integer,
  payment_schedule     text,
  savings_monthly_min  integer,
  savings_monthly_max  integer,
  match_amount         integer,
  term_months          smallint,
  interest_rate        numeric(5,2),
  gpa_min              numeric(3,2),
  gpa_scale            numeric(2,1),
  school_type          text,
  selection_count      integer,
  duplicate_allowed    boolean
);

-- 지도 장소 (김대환, 2026-11-11 추가: migrations/20261111_culture_place.sql)
create table place (
  place_id           uuid primary key default gen_random_uuid(),
  place_key          text not null unique,         -- 원본 장소 키 (CUL-FC000178, LIB-xxxx, OPN-xxxx, YSP-xxxx)
  name               text not null,
  place_type         text not null check (place_type in ('공연장','전시공간','도서관','체육시설','청년공간','공공시설','강의실·강당','회의실')),
  region_code        text references region(region_code),
  is_target          boolean not null default false,  -- 서비스 지역(사하구·부산진구) 장소 (migrations/20261117_map_srs_strict.sql, DP-MAP-02)
  address            text,
  road_address       text,
  jibun_address      text,
  lat                numeric(10,7),
  lng                numeric(10,7),
  lat_src            numeric(10,7),                -- 원본 좌표 (migrations/20261116_map_srs_fixes.sql)
  lng_src            numeric(10,7),
  coord_status       text check (coord_status in ('verified','fixed','review','coord_only','missing')),
  coord_source       text check (coord_source in ('source','mois_juso')),  -- lat·lng 출처. mois_juso 는 fixed 만
  coord_distance_m   integer,                      -- 원본 좌표와 행안부 좌표의 거리(m)
  tel                text,
  homepage_url       text,
  open_hours_text    text,
  closed_days_text   text,
  fee_text           text,
  is_free            boolean,
  fee_type           text check (fee_type in ('free','paid','per_program','unknown')),  -- 요금 구분
  fee_basis          text check (fee_basis in ('user_provided','rule','source','web')),  -- 요금 구분 근거
  fee_source_url     text,
  fee_checked_at     date,
  reservation_url    text,
  capacity           integer,
  is_active          boolean not null default true,
  image_url          text,                         -- 사진 URL (공공 API·기관 공식 페이지, 링크만 저장)
  image_source       text,                         -- 사진 출처 페이지
  description        text,                         -- 소개문 원문
  source_name        text,
  source_id          text,
  raw_data           jsonb,
  source_values      jsonb,                        -- 마지막으로 받은 공공데이터 원본 값 (하루 1회 갱신의 비교 기준, 좌표 제외)
  source_checked_at  timestamptz,
  last_collected_at  timestamptz,
  last_verified_at   timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index place_region_idx on place(region_code);
create index place_type_idx on place(place_type);
create index place_is_target_idx on place(is_target);

-- 장소 문제 목록 (migrations/20261114_culture_sync.sql, 20261115_culture_policy_sync.sql)
--   하루 1회 갱신이 장소·행사·문화 정책 문제를 기록, 지도 화면은 읽지 않음
create table place_issues (
  issue_id       uuid primary key default gen_random_uuid(),
  issue_type     text not null check (issue_type in ('source_differs','source_changed','place_missing_in_source',
                   'new_place_candidate','merge_candidate','event_place_unmatched','event_missing_in_source',
                   'policy_unlinked','policy_missing_in_source','policy_new_candidate','coord_review','api_error')),
  ref_type       text not null check (ref_type in ('place','venue','event','policy','api')),
  ref_key        text not null,
  place_id       uuid references place(place_id) on delete set null,
  policy_id      uuid references policy(policy_id) on delete set null,
  name           text,
  detail         text,
  status         text not null default '미처리' check (status in ('미처리','확인','해결','무시')),
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  resolved_at    timestamptz,
  unique (issue_type, ref_key)
);
create index place_issues_status_idx on place_issues (status, issue_type);

-- 찜한 장소 (migrations/20261116_map_srs_fixes.sql, FR-MAP-019): 본인 행만, 탈퇴하면 함께 삭제
create table user_saved_places (
  user_id   uuid not null references auth.users(id) on delete cascade,
  place_id  uuid not null references place(place_id) on delete cascade,
  saved_at  timestamptz not null default now(),
  primary key (user_id, place_id)
);

-- 지도 분류표 (migrations/20261113_map_support.sql): 장소 세부 유형 → 지도 카테고리
create table map_category (
  category_code  text primary key,
  category_name  text not null unique,
  sort_order     smallint not null,
  color          text not null
);
create table place_type_map (
  place_type     text primary key,
  category_code  text not null references map_category(category_code)
);

create table culture_detail (        -- 문화 (김대환)
  policy_id             uuid primary key references policy(policy_id) on delete cascade,
  culture_type          text check (culture_type in ('공연','전시','문화프로그램','문화할인','문화비지원','창작지원','교육·인력양성','청년공간')),
  genre                 text,          -- 장르 (클래식, 뮤지컬, 연극, 전시 ...)
  place_id              uuid references place(place_id) on delete set null,
  venue_text            text,
  event_start_at        timestamptz,
  event_end_at          timestamptz,
  schedule_text         text,
  price                 integer,       -- 0 = 무료, 등급별 요금이면 최저가
  price_text            text,          -- 관람료 원문
  support_amount        integer,       -- 1인당 지원 금액(원)
  support_amount_text   text,          -- 지원 금액 원문
  discount_rate         numeric(5,2),
  discount_text         text,
  reservation_required  boolean,
  reservation_url       text,
  capacity              integer,
  age_rating            text,
  runtime               text,          -- 러닝타임 (행사 상세 원문)
  organizer             text,          -- 주최·기획
  casting               text,          -- 출연
  crew                  text,          -- 제작진
  detail_fetched        boolean        -- 행사 상세 API 응답을 받았는지 (정책 행은 NULL)
);
create index culture_detail_place_idx on culture_detail(place_id);

-- ---------------------------------------------------------------------
-- 2-1. 모집 상태·D-day 뷰 (migrations/20261112_event_status_view.sql)
--   정책: 상시·기간 미정·모집 예정·모집 중·마감 (신청 기간 기준)
--   행사(EVENT): 예정·진행 중·종료·기간 미정 (culture_detail.event_* 기준, d_day 는 종료일 한국 시간)
-- ---------------------------------------------------------------------
create view v_policy_status as
select p.policy_id,
  case
    when p.item_type = 'EVENT' then
      case
        when cd.event_start_at is null and cd.event_end_at is null then '기간 미정'
        when cd.event_start_at > now() then '예정'
        when cd.event_end_at   < now() then '종료'
        else '진행 중'
      end
    when p.is_always_open then '상시'
    when p.application_start_date is null and p.application_end_date is null then '기간 미정'
    when p.application_start_date > current_date then '모집 예정'
    when p.application_end_date   < current_date then '마감'
    else '모집 중'
  end as recruitment_status,
  case
    when p.item_type = 'EVENT' then
      (cd.event_end_at at time zone 'Asia/Seoul')::date - (now() at time zone 'Asia/Seoul')::date
    when p.application_end_date is not null and not p.is_always_open
      then p.application_end_date - current_date
  end as d_day
from policy p
left join culture_detail cd using (policy_id);

-- 지도 표시 대상 장소 (migrations/20261113_map_support.sql, 20261117_map_srs_strict.sql, FR-MAP-001)
--   사용 중 + 서비스 지역 + 좌표 있음 + 좌표 검증 verified·fixed·coord_only + 분류표에 있는 유형
create view v_map_places with (security_invoker = true) as
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

-- ---------------------------------------------------------------------
-- 3. 데이터 수집·관리
-- ---------------------------------------------------------------------
create table policy_source (
  source_id        uuid primary key default gen_random_uuid(),
  policy_id        uuid not null references policy(policy_id) on delete cascade,
  source_name      text,
  source_type      text not null check (source_type in ('API','CRAWL','MANUAL')),
  external_id      text,
  source_url       text,
  raw_data         jsonb,
  last_checked_at  timestamptz,
  created_at       timestamptz not null default now(),
  unique (source_type, external_id)
);

create table collection_run (
  run_id             uuid primary key default gen_random_uuid(),
  collection_type    text not null check (collection_type in ('API','CRAWL')),
  collection_domain  text,
  scheduled_date     date,
  started_at         timestamptz,
  finished_at        timestamptz,
  status             text check (status in ('성공','부분 성공','실패')),
  collected_count    integer default 0,
  updated_count      integer default 0,
  failed_count       integer default 0
);

create table collection_error (
  error_id           uuid primary key default gen_random_uuid(),
  run_id             uuid references collection_run(run_id) on delete cascade,
  policy_id          uuid references policy(policy_id) on delete set null,
  source_url         text,
  error_type         text,
  error_message      text,
  retry_count        integer default 0,
  resolution_status  text check (resolution_status in ('미처리','재시도','수동 보완','확인필요','해결')),
  occurred_at        timestamptz not null default now(),
  resolved_at        timestamptz
);

create table policy_field_verification (
  verification_id      uuid primary key default gen_random_uuid(),
  policy_id            uuid not null references policy(policy_id) on delete cascade,
  field_name           text not null,
  verified_value       jsonb,
  source_id            uuid references policy_source(source_id),
  verification_status  text check (verification_status in ('확정','확인필요')),
  verified_by          uuid references auth.users(id),
  verified_at          timestamptz,
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. 사용자
-- ---------------------------------------------------------------------
create table user_profile (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  birth_date              date,
  region_code             text references region(region_code),
  residence_months        smallint,
  final_education         text,
  current_status          text,
  interest_categories     text[],
  housing_type            text,
  household_type          text,
  lives_separately        boolean,
  marital_status          text,
  home_ownership          text,
  household_role          text,
  housing_benefit_status  text,
  special_targets         text[],
  updated_at              timestamptz not null default now()
);

create table user_role (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         text not null default 'USER' check (role in ('USER','ADMIN')),
  assigned_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table user_bookmark (
  bookmark_id  uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  policy_id    uuid not null references policy(policy_id) on delete cascade,
  saved_from   text check (saved_from in ('HOME','SEARCH','DETAIL','CHAT')),
  created_at   timestamptz not null default now(),
  unique (user_id, policy_id)
);

create table user_application (
  application_id        uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  policy_id             uuid not null references policy(policy_id) on delete cascade,
  stage                 text not null default 'PREPARING' check (stage in ('PREPARING','APPLIED','RESULT')),
  apply_status          text check (apply_status in ('RECEIVED','REVIEWING','NEED_CHECK','CLOSED')),
  result                text check (result in ('WAITING','SELECTED','REJECTED')),
  applied_at            date,
  receipt_no            text,
  expected_result_date  date,
  memo                  text,
  added_from            text check (added_from in ('BOOKMARK','SEARCH','DETAIL')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, policy_id)
);

create table user_document_check (
  user_id     uuid references auth.users(id) on delete cascade,
  policy_id   uuid references policy(policy_id) on delete cascade,
  doc_key     text,
  is_checked  boolean not null default false,
  checked_at  timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (user_id, policy_id, doc_key)
);

create table user_followup_task (
  task_id         uuid primary key default gen_random_uuid(),
  application_id  uuid not null references user_application(application_id) on delete cascade,
  title           text not null,
  is_default      boolean not null default false,
  is_done         boolean not null default false,
  sort_order      smallint not null default 0,
  done_at         timestamptz,
  created_at      timestamptz not null default now()
);

create table user_recent_view (
  user_id    uuid references auth.users(id) on delete cascade,
  policy_id  uuid references policy(policy_id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (user_id, policy_id)
);

create table search_history (
  search_id    uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  keyword      text not null,
  searched_at  timestamptz not null default now()
);

create table popular_search_keyword (
  keyword           text primary key,
  search_count      bigint not null default 0,
  last_searched_at  timestamptz,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. 알림
-- ---------------------------------------------------------------------
create table alarm_preference (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  default_presets       text[] not null default array['D1','M30'],
  day_alarm_time        time not null default '09:00',
  deadline_enabled      boolean not null default true,
  new_match_enabled     boolean not null default true,
  bot_bubble_enabled    boolean not null default true,
  doc_reminder_enabled  boolean not null default true,
  updated_at            timestamptz not null default now()
);

create table saved_alarm (
  alarm_id      uuid primary key default gen_random_uuid(),
  bookmark_id   uuid not null references user_bookmark(bookmark_id) on delete cascade,
  kind          text not null check (kind in ('PRESET','CUSTOM','DOC_REMINDER')),
  preset_code   text check (preset_code in ('W1','D3','D1','DDAY_AM','H3','H1','M30','M10')),
  fire_at       timestamptz not null,
  repeat_daily  boolean not null default false,
  status        text not null default 'PENDING' check (status in ('PENDING','SENT','CANCELLED','FAILED')),
  sent_at       timestamptz
);
create index saved_alarm_due_idx on saved_alarm(status, fire_at);
create unique index saved_alarm_preset_uq on saved_alarm(bookmark_id, preset_code) where kind = 'PRESET';

create table notification (
  notification_id  uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  policy_id        uuid references policy(policy_id) on delete set null,
  alarm_id         uuid references saved_alarm(alarm_id) on delete set null,
  type             text not null check (type in ('DEADLINE','NEW_MATCH','SYSTEM')),
  title            text not null,
  body             text,
  link             text,
  is_read          boolean not null default false,
  created_at       timestamptz not null default now()
);
create index notification_unread_idx on notification(user_id, is_read, created_at);

create table push_subscription (
  sub_id      uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. 로그
-- ---------------------------------------------------------------------
create table security_audit_log (
  log_id             uuid primary key default gen_random_uuid(),
  actor_user_id      uuid references auth.users(id) on delete set null,
  action_type        text not null,
  target_table       text,
  target_record_key  text,
  result             text check (result in ('성공','실패')),
  error_code         text,
  occurred_at        timestamptz not null default now()
);

create table ai_execution_log (
  ai_log_id          uuid primary key default gen_random_uuid(),
  feature_type       text not null,
  policy_id          uuid references policy(policy_id) on delete set null,
  compare_policy_id  uuid references policy(policy_id) on delete set null,
  status             text check (status in ('성공','실패')),
  error_code         text,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------
-- 정책·기준정보: 누구나 읽기, 쓰기는 service_role(수집 서버)만
do $$
declare t text;
begin
  foreach t in array array['policy_category','policy_subcategory','region','policy',
    'policy_subcategory_map','policy_region','job_detail','housing_detail',
    'finance_detail','culture_detail','place','map_category','place_type_map','popular_search_keyword']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "public read" on %I for select using (true)', t);
  end loop;
end $$;

-- 사용자 데이터: 본인 행만
do $$
declare t text;
begin
  foreach t in array array['user_profile','user_bookmark','user_application',
    'user_document_check','user_recent_view','search_history','alarm_preference',
    'notification','push_subscription','user_saved_places']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table user_followup_task enable row level security;
create policy "own rows" on user_followup_task for all
  using (exists (select 1 from user_application a where a.application_id = user_followup_task.application_id and a.user_id = auth.uid()))
  with check (exists (select 1 from user_application a where a.application_id = user_followup_task.application_id and a.user_id = auth.uid()));

alter table saved_alarm enable row level security;
create policy "own rows" on saved_alarm for all
  using (exists (select 1 from user_bookmark b where b.bookmark_id = saved_alarm.bookmark_id and b.user_id = auth.uid()))
  with check (exists (select 1 from user_bookmark b where b.bookmark_id = saved_alarm.bookmark_id and b.user_id = auth.uid()));

alter table user_role enable row level security;
create policy "read own role" on user_role for select using (user_id = auth.uid());

-- 수집·로그 테이블은 RLS만 켜고 정책 없음 → service_role 만 접근
alter table policy_source enable row level security;
alter table collection_run enable row level security;
alter table collection_error enable row level security;
alter table place_issues enable row level security;
alter table policy_field_verification enable row level security;
alter table security_audit_log enable row level security;
alter table ai_execution_log enable row level security;

-- ---------------------------------------------------------------------
-- 8. 기본 데이터
-- ---------------------------------------------------------------------
insert into policy_category (category_name, is_search_enabled, sort_order) values
  ('취업·진로', true, 1), ('주거·생활', true, 2), ('장학·금융', true, 3),
  ('문화', true, 4), ('공간·시설', false, 5);

insert into map_category (category_code, category_name, sort_order, color) values
  ('culture', '문화시설', 1, '#8b63d0'), ('library', '도서관', 2, '#3f8ad8'),
  ('sports', '체육시설', 3, '#e0587a'), ('public_facility', '공공시설', 4, '#35a276'),
  ('youth_space', '청년공간', 5, '#e8863a');
insert into place_type_map (place_type, category_code) values
  ('공연장', 'culture'), ('전시공간', 'culture'), ('도서관', 'library'),
  ('체육시설', 'sports'), ('공공시설', 'public_facility'), ('청년공간', 'youth_space');
