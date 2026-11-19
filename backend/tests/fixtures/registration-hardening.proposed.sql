-- Review before applying to flkoszigqobfkztbvsyw. No policy/domain data is changed.
-- PAUSED by user: current login/signup runs in file mode. Do not apply this SQL for that flow.
begin;
-- Do not silently strand requests written by the old Storage-only implementation.
do $$ begin
 if exists(select 1 from auth.users where raw_app_meta_data->>'registration_pending'='true'
    and raw_app_meta_data->>'registration_request_id' is null) then
  raise exception 'Legacy pending registrations require reconciliation before this migration';
 end if;
end; $$;
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to service_role;

create table app_private.registration_requests (
 id uuid primary key default gen_random_uuid(),
 username text not null unique check(username ~ '^[a-z][a-z0-9]{7,14}$'),
 email text not null unique check(email=lower(email)), nickname text not null,
 consents jsonb not null,
 user_id uuid unique references auth.users(id) on delete cascade,
 status text not null check(status in ('creating','pending','sending','verifying','verified','completing','completed','cleanup')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '24 hours'),
 sent_at timestamptz, otp_expires_at timestamptz, last_send_attempt_at timestamptz,
 attempts integer not null default 0 check(attempts between 0 and 5), generation integer not null default 0,
 operation_id uuid, operation_until timestamptz
);
create index registration_expiry on app_private.registration_requests(expires_at) where status<>'completed';
create table app_private.registration_rate_limits (
 key text primary key, count integer not null, expires_at timestamptz not null
);
create index registration_rate_expiry on app_private.registration_rate_limits(expires_at);
create table app_private.registration_deletions (
 id uuid primary key default gen_random_uuid(), user_id uuid unique,
 request_id uuid unique, reason text not null check(reason in ('cancel','abandoned','withdrawal')),
 created_at timestamptz not null default now(), next_attempt_at timestamptz not null default now(),
 operation_id uuid, operation_until timestamptz, attempts integer not null default 0, last_error text
);
create index registration_deletions_due on app_private.registration_deletions(next_attempt_at);
-- Snapshot once: future raw Auth signups can never become legacy users.
create table app_private.registration_legacy_users (
 user_id uuid primary key references auth.users(id) on delete cascade
);
insert into app_private.registration_legacy_users(user_id)
 select id from auth.users where coalesce(raw_app_meta_data->>'registration_pending','false')<>'true'
 and not coalesce(raw_app_meta_data,'{}'::jsonb) ? 'registration_request_id';

-- Preserve username login for accounts completed by the previous implementation.
insert into app_private.registration_requests(username,email,nickname,consents,user_id,status)
 select lower(raw_app_meta_data->'registration'->>'username'),lower(email),
 coalesce(raw_app_meta_data->'registration'->>'nickname','회원'),
 coalesce(raw_app_meta_data->'registration'->'consents','{}'::jsonb),id,'completed'
 from auth.users where raw_app_meta_data->>'registration_pending' is distinct from 'true'
 and lower(raw_app_meta_data->'registration'->>'username') ~ '^[a-z][a-z0-9]{7,14}$';

alter table app_private.registration_requests enable row level security;
alter table app_private.registration_rate_limits enable row level security;
alter table app_private.registration_deletions enable row level security;
alter table app_private.registration_legacy_users enable row level security;
grant all on all tables in schema app_private to service_role;

-- All mutations below execute as the service role, with millisecond row locks.
-- No external Auth/Storage call runs inside a Postgres transaction.
create or replace function public.registration_command(p_action text,p_id uuid default null,p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 r app_private.registration_requests%rowtype; j app_private.registration_deletions%rowtype;
 n timestamptz:=clock_timestamp(); op uuid:=gen_random_uuid(); c integer; v_until timestamptz; uid uuid;
begin
 if p_action='health' then return jsonb_build_object('version',2); end if;
 if p_action='auth_email_exists' then return jsonb_build_object('exists',exists(select 1 from auth.users where lower(email)=p_input->>'email')); end if;
 if p_action='find_pending_auth_user' then
  select id into uid from auth.users where raw_app_meta_data->>'registration_request_id'=p_id::text and lower(email)=p_input->>'email';
  return case when uid is null then 'null'::jsonb else jsonb_build_object('userId',uid) end;
 end if;
 if p_action='rate' then
  insert into app_private.registration_rate_limits as limits(key,count,expires_at)
  values(p_input->>'key',1,n+interval '60 seconds') on conflict(key) do update
   set count=case when limits.expires_at<=n then 1 else least(limits.count+1,41) end,
       expires_at=case when limits.expires_at<=n then n+interval '60 seconds' else limits.expires_at end
   returning count,expires_at into c,v_until;
  return jsonb_build_object('allowed',c<=40,'retryAt',extract(epoch from v_until)*1000);
 end if;
 if p_action='available' then
  return jsonb_build_object('available',not exists(select 1 from app_private.registration_requests
    where (p_input->>'kind'='username' and username=p_input->>'value') or(p_input->>'kind'='email' and email=p_input->>'value')));
 end if;
 if p_action='reserve' then
  if p_input->'consents'->>'ageConfirmed'<>'true' or p_input->'consents'->>'terms'<>'true'
    or p_input->'consents'->>'privacy'<>'true' or p_input->'consents'->>'personalization' not in ('true','false')
    or p_input->'consents'->>'ageConfirmed' is null or p_input->'consents'->>'terms' is null
    or p_input->'consents'->>'privacy' is null or p_input->'consents'->>'personalization' is null
    then return jsonb_build_object('error','INVALID_SIGNUP'); end if;
  begin
   insert into app_private.registration_requests(id,username,email,nickname,consents,status,operation_id,operation_until)
   values(p_id,p_input->>'username',p_input->>'email',p_input->>'nickname',p_input->'consents','creating',op,n+interval '2 minutes') returning * into r;
  exception when unique_violation then return jsonb_build_object('error','IDENTITY_EXISTS'); end;
  return to_jsonb(r);
 end if;
 if p_action='lookup' then
  select * into r from app_private.registration_requests where username=p_input->>'username' and status='completed';
  return case when found then to_jsonb(r) else 'null'::jsonb end;
 end if;
 if p_action='access' then
  uid:=(p_input->>'userId')::uuid;
  return jsonb_build_object('allowed',exists(select 1 from auth.users where id=uid)
    and not exists(select 1 from app_private.registration_deletions where user_id=uid)
    and (exists(select 1 from app_private.registration_legacy_users where user_id=uid)
      or exists(select 1 from app_private.registration_requests where user_id=uid and status='completed')));
 end if;
 if p_action='queue_withdrawal' then
  uid:=(p_input->>'userId')::uuid;
  -- Serialize all withdrawal requests for this owner, including legacy accounts without a request row.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select * into r from app_private.registration_requests where user_id=uid for update;
  if found and r.operation_until>n then return jsonb_build_object('error','BUSY'); end if;
  if r.id is not null then update app_private.registration_requests set status='cleanup',operation_id=null,operation_until=null where id=r.id; end if;
  insert into app_private.registration_deletions(user_id,request_id,reason) values(uid,r.id,'withdrawal')
   on conflict(user_id) do update set user_id=excluded.user_id returning * into j;
  return to_jsonb(j);
 end if;
 if p_action='enqueue_expired' then
  for r in select * from app_private.registration_requests where status<>'completed' and status<>'cleanup'
    and expires_at<=n and(operation_until is null or operation_until<=n)
    order by expires_at for update skip locked limit 100 loop
   update app_private.registration_requests set status='cleanup',operation_id=null,operation_until=null where id=r.id;
   insert into app_private.registration_deletions(user_id,request_id,reason) values(r.user_id,r.id,'abandoned') on conflict do nothing;
  end loop;
  delete from app_private.registration_rate_limits where expires_at<n-interval '1 hour';
  return '{}'::jsonb;
 end if;
 if p_action='claim_cleanup' then
  select * into j from app_private.registration_deletions
   where next_attempt_at<=n and(operation_until is null or operation_until<=n)
   and(p_id is null or id=p_id) order by created_at for update skip locked limit 1;
  if not found then return 'null'::jsonb; end if;
  update app_private.registration_deletions set operation_id=op,operation_until=n+interval '2 minutes',attempts=attempts+1 where id=j.id returning * into j;
  select * into r from app_private.registration_requests where id=j.request_id;
  return to_jsonb(j)||jsonb_build_object('request',case when r.id is null then null else to_jsonb(r) end);
 end if;
 if p_action in ('ack_cleanup','fail_cleanup') then
  select * into j from app_private.registration_deletions where id=p_id for update;
  if not found then return '{}'::jsonb; end if;
  if j.operation_id is distinct from (p_input->>'operationId')::uuid or j.operation_until<=n then return jsonb_build_object('error','STALE_OPERATION'); end if;
  if p_action='fail_cleanup' then
   update app_private.registration_deletions set operation_id=null,operation_until=null,
    next_attempt_at=n+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::integer),last_error='CLEANUP_RETRY_REQUIRED' where id=j.id;
  else
   if j.user_id is not null and exists(select 1 from auth.users where id=j.user_id) then return jsonb_build_object('error','AUTH_USER_STILL_EXISTS'); end if;
   delete from app_private.registration_requests where id=j.request_id and status='cleanup';
   delete from app_private.registration_deletions where id=j.id;
  end if;
  return '{}'::jsonb;
 end if;
 if p_action='renew_cleanup' then
  update app_private.registration_deletions set operation_until=n+interval '2 minutes'
   where id=p_id and operation_id=(p_input->>'operationId')::uuid and operation_until>n returning * into j;
  if not found then return jsonb_build_object('error','STALE_OPERATION'); end if;
  return '{}'::jsonb;
 end if;
 select * into r from app_private.registration_requests where id=p_id for update;
 if not found then return jsonb_build_object('error','INVALID_CHALLENGE'); end if;
 if p_action='get' then return to_jsonb(r); end if;
 if p_action='queue_cancel' then
  if r.status='completed' then return jsonb_build_object('error','ALREADY_COMPLETED'); end if;
  if r.operation_until>n then return jsonb_build_object('error','BUSY'); end if;
  update app_private.registration_requests set status='cleanup',operation_id=null,operation_until=null where id=r.id;
  insert into app_private.registration_deletions(user_id,request_id,reason) values(r.user_id,r.id,'cancel')
   on conflict(request_id) do update set request_id=excluded.request_id returning * into j;
  return to_jsonb(j);
 end if;
 if p_action='attach' then
  if r.status<>'creating' or r.operation_id is distinct from(p_input->>'operationId')::uuid or r.operation_until<=n then return jsonb_build_object('error','STALE_OPERATION'); end if;
  uid:=(p_input->>'userId')::uuid;
  if not exists(select 1 from auth.users where id=uid and lower(email)=r.email and raw_app_meta_data->>'registration_request_id'=r.id::text
     and raw_app_meta_data->>'registration_pending'='true') then return jsonb_build_object('error','USER_MISMATCH'); end if;
  update app_private.registration_requests set user_id=uid,status='pending',operation_id=null,operation_until=null where id=r.id returning * into r;
  return to_jsonb(r);
 end if;
 if p_action like 'finish_%' then
  if r.operation_id is distinct from(p_input->>'operationId')::uuid or r.operation_until<=n then return jsonb_build_object('error','STALE_OPERATION'); end if;
  if p_action='finish_send' and r.status='sending' then
   update app_private.registration_requests set status='pending',operation_id=null,operation_until=null,
    sent_at=case when(p_input->>'success')::boolean then n else sent_at end,
    otp_expires_at=case when(p_input->>'success')::boolean then n+interval '5 minutes' else otp_expires_at end,
    attempts=case when(p_input->>'success')::boolean then 0 else attempts end,
    generation=generation+case when(p_input->>'success')::boolean then 1 else 0 end where id=r.id returning * into r;
  elsif p_action='finish_verify' and r.status='verifying' then
   if(p_input->>'success')::boolean and(p_input->>'userId')::uuid is distinct from r.user_id then return jsonb_build_object('error','USER_MISMATCH'); end if;
   update app_private.registration_requests set status=case when(p_input->>'success')::boolean then 'verified' else 'pending' end,operation_id=null,operation_until=null where id=r.id returning * into r;
  elsif p_action='finish_complete' and r.status='completing' then
   update app_private.registration_requests set status=case when(p_input->>'success')::boolean then 'completed' else 'verified' end,operation_id=null,operation_until=null where id=r.id returning * into r;
  else return jsonb_build_object('error','INVALID_STATE'); end if;
  return to_jsonb(r);
 end if;
 if r.status='cleanup' or(r.status<>'completed' and r.expires_at<=n) then return jsonb_build_object('error','EXPIRED_REQUEST'); end if;
 if r.operation_until>n then return jsonb_build_object('error','BUSY'); end if;
 -- An abandoned in-flight call may finish later; the new operation UUID fences its stale reply.
 if r.status='sending' then r.status:='pending'; end if;
 if r.status='verifying' then r.status:='pending'; end if;
 if r.status='completing' then r.status:='verified'; end if;
 if p_action='begin_send' then
  if r.status<>'pending' then return jsonb_build_object('error','INVALID_STATE'); end if;
  if r.last_send_attempt_at>n-interval '60 seconds' then return jsonb_build_object('error','COOLDOWN'); end if;
  update app_private.registration_requests set status='sending',last_send_attempt_at=n,operation_id=op,operation_until=n+interval '2 minutes' where id=r.id returning * into r;
 elsif p_action='begin_verify' then
  if r.status<>'pending' then return jsonb_build_object('error','INVALID_STATE'); end if;
  if r.otp_expires_at is null or r.otp_expires_at<=n then return jsonb_build_object('error','EXPIRED'); end if;
  if r.attempts>=5 then return jsonb_build_object('error','ATTEMPTS'); end if;
  update app_private.registration_requests set status='verifying',attempts=attempts+1,operation_id=op,operation_until=n+interval '2 minutes' where id=r.id returning * into r;
 elsif p_action='begin_complete' then
  if r.user_id is distinct from(p_input->>'userId')::uuid then return jsonb_build_object('error','USER_MISMATCH'); end if;
  if r.status='completed' then return to_jsonb(r); end if;
  if r.status<>'verified' then return jsonb_build_object('error','NOT_VERIFIED'); end if;
  update app_private.registration_requests set status='completing',operation_id=op,operation_until=n+interval '2 minutes' where id=r.id returning * into r;
 else return jsonb_build_object('error','INVALID_ACTION'); end if;
 return to_jsonb(r);
end; $$;
revoke all on function public.registration_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.registration_command(text,uuid,jsonb) to service_role;

create or replace function public.registration_access_allowed()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=(select auth.uid()))
 and not exists(select 1 from app_private.registration_deletions where user_id=(select auth.uid()))
 and(exists(select 1 from app_private.registration_legacy_users where user_id=(select auth.uid()))
   or exists(select 1 from app_private.registration_requests where user_id=(select auth.uid()) and status='completed'));
$$;
revoke all on function public.registration_access_allowed() from public,anon;
grant execute on function public.registration_access_allowed() to authenticated;
-- Explicit scope only: do not change map/culture/catalog or other team tables.
-- Existing ownership policies remain required. Never silently enable RLS on a shared table.
do $$ declare t text; enabled boolean; begin
 foreach t in array array['user_profile','user_bookmark','user_recent_view','user_application','user_document_check','user_followup_task'] loop
  select rowsecurity into enabled from pg_tables where schemaname='public' and tablename=t;
  if not found then continue; end if;
  if not enabled then raise exception 'Existing table public.% must have reviewed RLS policies before registration hardening',t; end if;
  execute format('create policy registration_completed on public.%I as restrictive for all to authenticated using ((select public.registration_access_allowed())) with check ((select public.registration_access_allowed()))',t);
 end loop;
end; $$;
-- Only the two account/workspace buckets are gated. Posters and other buckets are unchanged.
create policy registration_completed on storage.objects as restrictive for all to authenticated
 using(bucket_id not in ('account-registration','user-workspaces') or (select public.registration_access_allowed()))
 with check(bucket_id not in ('account-registration','user-workspaces') or (select public.registration_access_allowed()));

-- Prepared only. Enabling the Auth hook is project-wide and requires review of every signup path.
-- Only Admin createUser can set app_metadata. Public signup's user_metadata is never trusted.
grant usage on schema app_private to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select(id,email,status,operation_until) on app_private.registration_requests to supabase_auth_admin;
create policy auth_registration_hook on app_private.registration_requests for select to supabase_auth_admin using(true);
create or replace function public.hook_registration_before_user_created(event jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if event->'user'->'app_metadata'->>'registration_pending'='true' and exists(
   select 1 from app_private.registration_requests where id::text=event->'user'->'app_metadata'->>'registration_request_id'
   and email=lower(event->'user'->>'email') and status='creating' and operation_until>clock_timestamp()) then return '{}'::jsonb; end if;
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Use the application registration process.'));
end; $$;
revoke all on function public.hook_registration_before_user_created(jsonb) from public,anon,authenticated;
grant execute on function public.hook_registration_before_user_created(jsonb) to supabase_auth_admin;
commit;
