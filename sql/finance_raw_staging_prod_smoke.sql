-- SYNTHETIC one-row storage smoke test, only AFTER approved DDL and permission checks.
-- Writes only three new staging tables as service_role. No external API request or policy DML.
-- Each run creates a new run_id. Keep the resulting rows as identifiable test history.
begin;
set local role service_role;

with run as (
    insert into public.finance_raw_run (
        run_id, scheduled_date, started_at, finished_at, status, review_enabled,
        response_count, review_count, discovered_count
    ) values (
        gen_random_uuid(), (now() at time zone 'Asia/Seoul')::date,
        now(), now(), 'SUCCESS', true, 1, 1, 1
    ) returning run_id
), response as (
    insert into public.finance_raw_response (
        run_id, fetched_at, source_type, source_identifier, external_id,
        request_url, request_fingerprint, http_status, content_type,
        body_encoding, body_size_bytes, response_sha256, raw_json, raw_text
    )
    select run_id, now(), 'CRAWL', 'SMOKE-ONLY', 'SMOKE-ONLY',
           'https://example.invalid/smoke',
           '3013231719c6db4d6ee4d559e4650f7d893aed0d78cb56ec1ba56feb4b3f0b7b',
           200, 'application/json', 'utf-8', 72,
           '1ee53abd8e93b1a60d0cd698b615ce7d2f0357f7bbe96f7fc08f6350a2f06b0e',
           $$ {"result":[{"plcyNo":"SMOKE-ONLY","plcyNm":"Synthetic finance policy"}]} $$::jsonb,
           '{"result":[{"plcyNo":"SMOKE-ONLY","plcyNm":"Synthetic finance policy"}]}'
    from run
    returning run_id, response_id
), review as (
    insert into public.finance_review_candidate (
        run_id, candidate_fingerprint, source_identifier, external_id,
        normalized_data, normalized_sha256, comparison_status, review_status
    )
    select run_id,
           '0af275c86439ff5c253c9392adc246db12fa15acd2aa56e4805c867febf6b1be',
           'SMOKE-ONLY', 'SMOKE-ONLY',
           '{"title":"Synthetic finance policy","eligibility_verified":false,"eligibility_conditions":{"required":[],"exclusions":[],"logic":"UNVERIFIED"},"application_process":null,"required_documents":null}'::jsonb,
           'f3dbe914d1cc748264b6790013e93e8325e49c0720daf007fc27443d3e5048da',
           'LOOKUP_INCOMPLETE', 'PENDING'
    from response
    returning run_id, review_id
)
select response.run_id, response.response_id, review.review_id
from response join review using (run_id);

commit;
