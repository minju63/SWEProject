-- Manual rollback ONLY if all four newly created staging tables are empty.
-- Never run after a collection has stored history. No CASCADE, no legacy tables.
begin;

-- Keep the four staging tables stable while checking that all are empty.
lock table public.finance_raw_run, public.finance_raw_response,
    public.finance_raw_error, public.finance_review_candidate in access exclusive mode;

do $$
begin
    if exists (select 1 from public.finance_raw_run)
       or exists (select 1 from public.finance_raw_response)
       or exists (select 1 from public.finance_raw_error)
       or exists (select 1 from public.finance_review_candidate) then
        raise exception 'staging rollback refused: one or more tables contain data';
    end if;
end;
$$;

drop table public.finance_review_candidate;
drop table public.finance_raw_error;
drop table public.finance_raw_response;
drop table public.finance_raw_run;

commit;
