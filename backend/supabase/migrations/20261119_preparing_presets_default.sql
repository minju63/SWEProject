-- (이후 7일·3일·1일 전 + 30분 전으로 다시 바뀜: 20261122_preparing_presets_restore.sql)
-- 신청 준비 기본 알림을 찜과 같은 1일 전·30분 전으로 맞춘다.
-- 20261119_application_alarms.sql 을 이전 내용(기본 7일 전·3일 전·1일 전)으로 먼저 실행한 경우에만 필요하다.
alter table alarm_preference alter column preparing_presets set default array['D1','M30'];

-- 사용자가 따로 바꾸지 않은(이전 기본값 그대로인) 행만 새 기본값으로 바꾼다
update alarm_preference
set preparing_presets = array['D1','M30']
where preparing_presets = array['W1','D3','D1'];
