-- 마이 › 알림 설정 저장 (FR-MY-009, FR-MY-012~016)
-- alarm_preference 에 전체 알림·맞춤 알림·문화행사 알림·주변 시설 알림 설정을 추가한다.
--   기존 컬럼과의 대응: 정책 알림(FR-MY-013) = new_match_enabled, 마감 임박 알림(FR-MY-016) = deadline_enabled
--   전체 알림(all_enabled)이 꺼져 있어도 하위 설정값은 그대로 유지하고, 발송만 하지 않는다 (FR-MY-009)
--   맞춤 알림은 선택 동의가 있어야 하므로 기본값이 꺼짐이다 (FR-MY-012)
alter table alarm_preference
  add column if not exists all_enabled       boolean not null default true,
  add column if not exists recommend_enabled boolean not null default false,
  add column if not exists event_enabled     boolean not null default false,
  add column if not exists facility_enabled  boolean not null default false;
