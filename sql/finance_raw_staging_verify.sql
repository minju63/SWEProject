-- Read-only checks after applying finance_raw_staging.sql.
-- Expected: four tables, RLS enabled, no anon/authenticated privileges or policies.

select c.relname, c.relrowsecurity,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
       has_table_privilege('anon', c.oid, 'UPDATE') as anon_update,
       has_table_privilege('anon', c.oid, 'DELETE') as anon_delete,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete,
       has_table_privilege('service_role', c.oid, 'SELECT') as service_select,
       has_table_privilege('service_role', c.oid, 'INSERT') as service_insert,
       has_table_privilege('service_role', c.oid, 'UPDATE') as service_update,
       has_table_privilege('service_role', c.oid, 'DELETE') as service_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('finance_raw_run', 'finance_raw_response',
                    'finance_raw_error', 'finance_review_candidate')
order by c.relname;

select conrelid::regclass as table_name, conname, contype,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.finance_raw_run'::regclass,
                   'public.finance_raw_response'::regclass,
                   'public.finance_raw_error'::regclass,
                   'public.finance_review_candidate'::regclass)
order by conrelid::regclass::text, contype, conname;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('finance_raw_run', 'finance_raw_response',
                    'finance_raw_error', 'finance_review_candidate');

select c.relname as sequence_name,
       has_sequence_privilege('anon', c.oid, 'USAGE') as anon_usage,
       has_sequence_privilege('authenticated', c.oid, 'USAGE') as authenticated_usage,
       has_sequence_privilege('service_role', c.oid, 'USAGE') as service_usage
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'S'
  and c.relname in ('finance_raw_response_response_id_seq',
                    'finance_raw_error_error_id_seq',
                    'finance_review_candidate_review_id_seq')
order by c.relname;

-- Run these after a collection. They disclose metadata only.
select run_id, scheduled_date, status, response_count, error_count,
       discovered_count, excluded_count, review_count
from public.finance_raw_run
order by started_at desc limit 10;

-- Inspect only; do not mark a run failed until its collector process is gone.
select run_id, started_at, now() - started_at as elapsed
from public.finance_raw_run
where status = 'RUNNING' and started_at < now() - interval '4 hours'
order by started_at;

select source_identifier, response_sha256,
       count(distinct run_id) as runs_with_same_response, count(*) as stored_rows
from public.finance_raw_response
group by source_identifier, response_sha256
order by runs_with_same_response desc, source_identifier
limit 20;

-- Must return zero rows: duplicate response within the same run.
select run_id, request_fingerprint, response_sha256, http_status, count(*)
from public.finance_raw_response
group by run_id, request_fingerprint, response_sha256, http_status
having count(*) > 1;

select comparison_status, review_status, count(*)
from public.finance_review_candidate
group by comparison_status, review_status
order by comparison_status, review_status;

select stage, count(*) from public.finance_raw_error group by stage order by stage;

-- Compare these counts with the values recorded before the collection.
select 'policy' as table_name, count(*) from public.policy
union all
select 'finance_detail', count(*) from public.finance_detail;

-- Record before and after collection; hashes must be identical.
select md5(string_agg(
           policy_id::text || ':' ||
           coalesce(eligibility_conditions::text, 'NULL') || ':' ||
           coalesce(application_process::text, 'NULL') || ':' ||
           coalesce(required_documents::text, 'NULL'),
           '|' order by policy_id)) as finance_policy_json_md5
from public.policy
where collection_domain = 'FINANCE';
