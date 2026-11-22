-- 신청 준비 기본 알림을 마감 7일 전·3일 전·1일 전 + 30분 전으로 되돌린다.
-- 20261119_preparing_presets_default.sql(1일 전·30분 전으로 변경)을 이미 실행한 DB에서 실행한다.
alter table alarm_preference alter column preparing_presets set default array['W1','D3','D1','M30'];

-- 사용자가 따로 바꾸지 않은(직전 기본값 그대로인) 행만 새 기본값으로 바꾼다
update alarm_preference
set preparing_presets = array['W1','D3','D1','M30']
where preparing_presets = array['D1','M30'];
