-- 알림 종류에 새 정책(POLICY)·문화행사(EVENT)·주변 시설(FACILITY)을 추가한다 (FR-MY-012~015).
-- 실행 전에는 맞춤 알림(NEW_MATCH)만 만들어지고, 나머지 종류는 오류 없이 건너뛴다.
alter table notification drop constraint if exists notification_type_check;
alter table notification
  add constraint notification_type_check
  check (type in ('DEADLINE','NEW_MATCH','SYSTEM','POLICY','EVENT','FACILITY'));
