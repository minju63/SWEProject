-- 신청 준비 정책에도 마감 알림을 붙인다 (기본 알림은 마감 7일 전·3일 전·1일 전 09:00 + 30분 전)
-- 지금까지 saved_alarm 은 찜(user_bookmark)에만 붙을 수 있었다. 찜하지 않고 신청 준비만 한 정책에도
-- 알림을 붙일 수 있게 신청(user_application)을 가리키는 컬럼을 추가하고, 찜 번호는 비어도 되게 바꾼다.
alter table saved_alarm
  add column if not exists application_id uuid references user_application(application_id) on delete cascade;

alter table saved_alarm alter column bookmark_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'saved_alarm_owner_chk') then
    alter table saved_alarm
      add constraint saved_alarm_owner_chk check (bookmark_id is not null or application_id is not null);
  end if;
end $$;

create index if not exists saved_alarm_application_idx on saved_alarm(application_id);
create unique index if not exists saved_alarm_app_preset_uq
  on saved_alarm(application_id, preset_code)
  where kind = 'PRESET' and application_id is not null;

-- 캘린더 '알림 설정'에서 바꾸는 기본 알림: 신청 준비 정책의 기본 알림 시점 (찜은 기존 default_presets 를 쓴다)
alter table alarm_preference
  add column if not exists preparing_presets text[] not null default array['W1','D3','D1','M30'];
