-- Production staging DDL: apply only after separate approval and a fresh read-only baseline.
-- No full-row backup is included; counts and hashes are change detectors, not backups.
-- These tables are independent of policy and finance_detail.
-- One-time migration: fail on any pre-existing object instead of silently accepting a mismatched schema.
begin;

create table public.finance_raw_run (
    run_id uuid primary key,
    scheduled_date date not null,
    started_at timestamptz not null,
    finished_at timestamptz,
    status text not null check (status in ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED')),
    review_enabled boolean not null default false,
    response_count integer not null default 0 check (response_count >= 0),
    error_count integer not null default 0 check (error_count >= 0),
    discovered_count integer not null default 0 check (discovered_count >= 0),
    excluded_count integer not null default 0 check (excluded_count >= 0),
    review_count integer not null default 0 check (review_count >= 0)
);

create table public.finance_raw_response (
    response_id bigint generated always as identity primary key,
    run_id uuid not null references public.finance_raw_run(run_id),
    fetched_at timestamptz not null,
    source_type text not null check (source_type in ('API', 'CRAWL')),
    source_identifier text not null,
    external_id text,
    request_url text not null,
    request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
    http_status integer not null check (http_status between 100 and 599),
    content_type text,
    body_encoding text,
    body_size_bytes bigint not null check (body_size_bytes >= 0),
    response_sha256 text not null check (response_sha256 ~ '^[0-9a-f]{64}$'),
    raw_json jsonb,
    raw_text text,
    raw_base64 text,
    unique (run_id, request_fingerprint, response_sha256, http_status)
);
create index finance_raw_response_source_idx
    on public.finance_raw_response(source_type, source_identifier, fetched_at desc);
create index finance_raw_response_hash_idx
    on public.finance_raw_response(source_identifier, response_sha256);

create table public.finance_raw_error (
    error_id bigint generated always as identity primary key,
    run_id uuid not null references public.finance_raw_run(run_id),
    occurred_at timestamptz not null,
    stage text not null,
    source_url text,
    error_message text not null
);
create index finance_raw_error_run_idx on public.finance_raw_error(run_id);

-- This is a private, review-only projection. It is never consumed by the app.
-- existing_policy_id is deliberately not an FK so a later policy deletion cannot erase history.
create table public.finance_review_candidate (
    review_id bigint generated always as identity primary key,
    run_id uuid not null references public.finance_raw_run(run_id),
    candidate_fingerprint text not null check (candidate_fingerprint ~ '^[0-9a-f]{64}$'),
    source_identifier text not null,
    external_id text,
    normalized_data jsonb not null,
    normalized_sha256 text not null check (normalized_sha256 ~ '^[0-9a-f]{64}$'),
    existing_policy_id uuid,
    comparison_status text not null check (comparison_status in
        ('NO_EXACT_MATCH', 'AMBIGUOUS_MATCH', 'LOOKUP_INCOMPLETE', 'SAME', 'DIFFERENT')),
    changed_fields text[] not null default '{}',
    review_status text not null default 'PENDING' check (review_status = 'PENDING'),
    created_at timestamptz not null default now(),
    unique (run_id, candidate_fingerprint)
);
create index finance_review_candidate_source_idx
    on public.finance_review_candidate(source_identifier, created_at desc);

alter table public.finance_raw_run enable row level security;
alter table public.finance_raw_response enable row level security;
alter table public.finance_raw_error enable row level security;
alter table public.finance_review_candidate enable row level security;

-- No anon/authenticated policies are created. Only the server-side service role has access.
revoke all on public.finance_raw_run, public.finance_raw_response,
    public.finance_raw_error, public.finance_review_candidate from public, anon, authenticated, service_role;
revoke all on sequence public.finance_raw_response_response_id_seq,
    public.finance_raw_error_error_id_seq,
    public.finance_review_candidate_review_id_seq from public, anon, authenticated, service_role;
grant select, insert, update on public.finance_raw_run to service_role;
grant select, insert on public.finance_raw_response, public.finance_raw_error,
    public.finance_review_candidate to service_role;
grant usage on sequence public.finance_raw_response_response_id_seq,
    public.finance_raw_error_error_id_seq,
    public.finance_review_candidate_review_id_seq to service_role;

commit;
