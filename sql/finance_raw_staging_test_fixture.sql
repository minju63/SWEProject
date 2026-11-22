-- TEST PROJECT ONLY. Apply only to a fresh, isolated Supabase project.
-- Minimal schema for read-only comparison tests; contains no production data.
-- Run before finance_raw_staging.sql. CREATE (without IF NOT EXISTS) fails if
-- any of these names already exist, preventing accidental fixture reuse.
begin;

create table public.policy (
    policy_id uuid primary key,
    collection_domain text not null,
    official_url text,
    target_summary text,
    eligibility_conditions jsonb,
    eligibility_verified boolean,
    application_method text,
    application_process jsonb,
    required_documents jsonb
);

create table public.finance_detail (
    policy_id uuid primary key references public.policy(policy_id)
);

create table public.policy_source (
    source_id bigint generated always as identity primary key,
    policy_id uuid not null references public.policy(policy_id),
    external_id text
);

alter table public.policy enable row level security;
alter table public.finance_detail enable row level security;
alter table public.policy_source enable row level security;
revoke all on public.policy, public.finance_detail, public.policy_source
    from public, anon, authenticated, service_role;
grant select on public.policy, public.policy_source to service_role;

insert into public.policy (policy_id, collection_domain, official_url,
    target_summary, eligibility_verified) values
    ('00000000-0000-0000-0000-000000000101', 'FINANCE',
     'https://example.invalid/same', '학생', false),
    ('00000000-0000-0000-0000-000000000102', 'FINANCE',
     'https://example.invalid/changed', '졸업생', false),
    ('00000000-0000-0000-0000-000000000103', 'FINANCE',
     'https://example.invalid/ambiguous-a', null, false),
    ('00000000-0000-0000-0000-000000000104', 'FINANCE',
     'https://example.invalid/ambiguous-b', null, false),
    ('00000000-0000-0000-0000-000000000105', 'OTHER',
     'https://example.invalid/other', null, false);

insert into public.policy_source (policy_id, external_id) values
    ('00000000-0000-0000-0000-000000000101', 'YOUTH-SAME'),
    ('00000000-0000-0000-0000-000000000102', 'YOUTH-CHANGED'),
    ('00000000-0000-0000-0000-000000000103', 'YOUTH-AMBIGUOUS'),
    ('00000000-0000-0000-0000-000000000104', 'YOUTH-AMBIGUOUS'),
    ('00000000-0000-0000-0000-000000000105', 'YOUTH-OTHER');

commit;
