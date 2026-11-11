-- =====================================================================
-- v_policy_status: 행사(EVENT) 상태 계산 추가 (요청 백민주, 실행 김대환)
--   행사는 신청 기간이 비어 있으므로 culture_detail.event_start_at·event_end_at 으로 계산해
--   예정·진행 중·종료·기간 미정을 돌려준다. 행사의 d_day 는 종료일(한국 시간) 기준이다.
--   정책(POLICY)·공고(POSTING) 계산은 그대로다. POLICY 의 event_* 는 사업 운영 기간이라 쓰지 않는다.
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

-- ---------------------------------------------------------------------
-- rollback (기존 뷰로 되돌리기, 필요할 때만 주석을 풀고 실행)
-- ---------------------------------------------------------------------
-- create or replace view v_policy_status as
-- select policy_id,
--   case
--     when is_always_open then '상시'
--     when application_start_date is null and application_end_date is null then '기간 미정'
--     when application_start_date > current_date then '모집 예정'
--     when application_end_date < current_date then '마감'
--     else '모집 중'
--   end as recruitment_status,
--   case
--     when application_end_date is not null and not is_always_open
--       then application_end_date - current_date
--   end as d_day
-- from policy p;
