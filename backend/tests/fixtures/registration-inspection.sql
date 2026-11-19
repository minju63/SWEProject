-- Run in the SQL Editor of flkoszigqobfkztbvsyw. SELECT only: no changes.
-- 1. Existing tables and RLS. Missing tables are shown explicitly.
select wanted.table_name,
 c.oid is not null as table_exists,
 c.relrowsecurity as rls_enabled,
 case when c.oid is not null then has_table_privilege('anon',c.oid,'SELECT') end as anon_can_select,
 case when c.oid is not null then has_table_privilege('authenticated',c.oid,'SELECT') end as member_can_select
from (values ('user_profile'),('user_bookmark'),('user_recent_view'),
 ('user_application'),('user_document_check'),('user_followup_task')) wanted(table_name)
left join pg_namespace n on n.nspname='public'
left join pg_class c on c.relnamespace=n.oid and c.relname=wanted.table_name and c.relkind in ('r','p')
order by wanted.table_name;

-- 2. Existing policies; ownership/anon access must be reviewed alongside the new restriction.
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies
where (schemaname='public' and tablename in ('user_profile','user_bookmark','user_recent_view',
 'user_application','user_document_check','user_followup_task'))
or (schemaname='storage' and tablename='objects')
order by schemaname,tablename,policyname;

-- 3. Counts only, no emails/names/passwords.
select count(*) as auth_users,
 count(*) filter(where raw_app_meta_data->>'registration_pending'='true'
  and raw_app_meta_data->>'registration_request_id' is null) as old_pending_requiring_review,
 count(*) filter(where coalesce(raw_app_meta_data->>'registration_pending','false')<>'true'
  and not(coalesce(raw_app_meta_data,'{}'::jsonb) ? 'registration_request_id')) as legacy_accounts_to_preserve,
 count(*) filter(where raw_app_meta_data->>'registration_request_id' is not null) as accounts_with_new_request_marker
from auth.users;

-- 4. Existing signup providers: a global Auth hook can affect these flows too.
select provider,count(*) as identities from auth.identities group by provider order by provider;

-- 5. Detect collisions/prior application. Do not rerun a partially or previously applied migration blindly.
select n.nspname as schema_name,c.relname as object_name
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='app_private' and c.relname like 'registration_%';
select n.nspname as schema_name,p.proname as function_name
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('registration_command','registration_access_allowed','hook_registration_before_user_created');
select schemaname,tablename,policyname from pg_policies where policyname='registration_completed';

-- 6. Auth deletion dependencies: references may delete dependent rows or prevent deletion.
select n.nspname as schema_name,c.relname as table_name,k.conname,
 pg_get_constraintdef(k.oid) as foreign_key
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace
where k.contype='f' and k.confrelid='auth.users'::regclass
order by n.nspname,c.relname;
select t.tgname as trigger_name,pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t where t.tgrelid='auth.users'::regclass and not t.tgisinternal;
