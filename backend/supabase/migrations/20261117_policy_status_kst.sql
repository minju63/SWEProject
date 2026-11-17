-- =====================================================================
-- v_policy_status: 정책 모집 상태·D-day 를 한국 시간 기준 날짜로 계산 (백민주)
--   Supabase 서버 시간대가 UTC 라 current_date 를 쓰면 한국 시간 0~9시에 하루 전 날짜로 계산됐다.
--   (예: 마감일 당일 오전에 '마감'으로 보이거나 D-day 가 하루 어긋남)
--   행사(EVENT) 계산은 이미 한국 시간이라 그대로다. 컬럼 이름·개수·타입은 바뀌지 않는다.
--   마감 시각이 따로 없는 정책은 마감일 23:59 까지 '모집 중'이다.
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run
-- 되돌리기: 맨 아래 주석의 rollback 블록
-- =====================================================================

create or replace view v_policy_status as
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
    when p.application_start_date > (now() at time zone 'Asia/Seoul')::date then '모집 예정'
    when p.application_end_date   < (now() at time zone 'Asia/Seoul')::date then '마감'
    else '모집 중'
  end as recruitment_status,
  case
    when p.item_type = 'EVENT' then
      (cd.event_end_at at time zone 'Asia/Seoul')::date - (now() at time zone 'Asia/Seoul')::date
    when p.application_end_date is not null and not p.is_always_open
      then p.application_end_date - (now() at time zone 'Asia/Seoul')::date
  end as d_day
from policy p
left join culture_detail cd using (policy_id);

-- ---------------------------------------------------------------------
-- 확인 (실행 후 날짜가 한국 시간과 같은지)
-- ---------------------------------------------------------------------
-- select (now() at time zone 'Asia/Seoul')::date as kst_today, current_date as utc_today;
-- select recruitment_status, count(*) from v_policy_status group by 1;

-- ---------------------------------------------------------------------
-- rollback (20261112_event_status_view.sql 의 정의로 되돌리기, 필요할 때만 주석을 풀고 실행)
-- ---------------------------------------------------------------------
-- create or replace view v_policy_status as
-- select p.policy_id,
--   case
--     when p.item_type = 'EVENT' then
--       case
--         when cd.event_start_at is null and cd.event_end_at is null then '기간 미정'
--         when cd.event_start_at > now() then '예정'
--         when cd.event_end_at   < now() then '종료'
--         else '진행 중'
--       end
--     when p.is_always_open then '상시'
--     when p.application_start_date is null and p.application_end_date is null then '기간 미정'
--     when p.application_start_date > current_date then '모집 예정'
--     when p.application_end_date   < current_date then '마감'
--     else '모집 중'
--   end as recruitment_status,
--   case
--     when p.item_type = 'EVENT' then
--       (cd.event_end_at at time zone 'Asia/Seoul')::date - (now() at time zone 'Asia/Seoul')::date
--     when p.application_end_date is not null and not p.is_always_open
--       then p.application_end_date - current_date
--   end as d_day
-- from policy p
-- left join culture_detail cd using (policy_id);
