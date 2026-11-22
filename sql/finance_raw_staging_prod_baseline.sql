-- Read-only baseline. Run immediately before DDL and after the small collection.
-- Compare every row count and digest; any difference requires investigation.
-- These hashes detect changes but cannot restore rows.
begin transaction isolation level repeatable read read only;

select 'policy' as table_name, count(*) as row_count,
       md5(string_agg(md5(to_jsonb(t)::text), '' order by policy_id)) as content_md5
from public.policy t
union all
select 'finance_detail', count(*),
       md5(string_agg(md5(to_jsonb(t)::text), '' order by policy_id))
from public.finance_detail t
union all
select 'finance_policy_json', count(*),
       md5(string_agg(md5(
           coalesce(eligibility_conditions::text, 'NULL') || '|' ||
           coalesce(application_process::text, 'NULL') || '|' ||
           coalesce(required_documents::text, 'NULL') || '|' ||
           coalesce(eligibility_verified::text, 'NULL')),
           '' order by policy_id))
from public.policy t
where collection_domain = 'FINANCE';

-- Expected historical reference: 502 policy rows, 93 finance policy rows,
-- 93 finance_detail rows, and 27 verified finance eligibility rows.
select count(*) filter (where collection_domain = 'FINANCE') as finance_policy_count,
       count(*) filter (where collection_domain = 'FINANCE'
                         and eligibility_verified is true) as verified_finance_count
from public.policy;

commit;
