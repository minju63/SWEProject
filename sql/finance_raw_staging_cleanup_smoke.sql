-- Clean up ONLY the synthetic production smoke test run below.
-- Leave all four staging tables and their constraints, RLS, and grants intact.
-- Refuse cleanup if any unexpected staging rows exist or the smoke rows changed.
begin;

lock table public.finance_raw_run, public.finance_raw_response,
    public.finance_raw_error, public.finance_review_candidate in access exclusive mode;

do $$
declare
    smoke_run_id constant uuid := '7e023ff0-e452-480d-b42c-007d38f662b8';
begin
    if (select count(*) from public.finance_raw_run) <> 1
       or (select count(*) from public.finance_raw_response) <> 1
       or (select count(*) from public.finance_raw_error) <> 0
       or (select count(*) from public.finance_review_candidate) <> 1 then
        raise exception 'smoke cleanup refused: unexpected staging row counts';
    end if;

    if not exists (
        select 1 from public.finance_raw_run
        where run_id = smoke_run_id and status = 'SUCCESS' and review_enabled is true
          and response_count = 1 and review_count = 1 and discovered_count = 1
          and error_count = 0 and excluded_count = 0
    ) or not exists (
        select 1 from public.finance_raw_response
        where run_id = smoke_run_id and source_type = 'CRAWL'
          and source_identifier = 'SMOKE-ONLY' and external_id = 'SMOKE-ONLY'
          and request_url = 'https://example.invalid/smoke' and http_status = 200
          and request_fingerprint = '3013231719c6db4d6ee4d559e4650f7d893aed0d78cb56ec1ba56feb4b3f0b7b'
          and response_sha256 = '1ee53abd8e93b1a60d0cd698b615ce7d2f0357f7bbe96f7fc08f6350a2f06b0e'
          and body_size_bytes = 72 and raw_base64 is null
          and raw_json = '{"result":[{"plcyNo":"SMOKE-ONLY","plcyNm":"Synthetic finance policy"}]}'::jsonb
          and raw_text = '{"result":[{"plcyNo":"SMOKE-ONLY","plcyNm":"Synthetic finance policy"}]}'
    ) or not exists (
        select 1 from public.finance_review_candidate
        where run_id = smoke_run_id
          and source_identifier = 'SMOKE-ONLY' and external_id = 'SMOKE-ONLY'
          and candidate_fingerprint = '0af275c86439ff5c253c9392adc246db12fa15acd2aa56e4805c867febf6b1be'
          and normalized_sha256 = 'f3dbe914d1cc748264b6790013e93e8325e49c0720daf007fc27443d3e5048da'
          and comparison_status = 'LOOKUP_INCOMPLETE' and review_status = 'PENDING'
          and existing_policy_id is null and changed_fields = '{}'::text[]
          and normalized_data = '{"title":"Synthetic finance policy","eligibility_verified":false,"eligibility_conditions":{"required":[],"exclusions":[],"logic":"UNVERIFIED"},"application_process":null,"required_documents":null}'::jsonb
    ) then
        raise exception 'smoke cleanup refused: non-synthetic or altered rows';
    end if;
end;
$$;

delete from public.finance_review_candidate
where run_id = '7e023ff0-e452-480d-b42c-007d38f662b8';
delete from public.finance_raw_response
where run_id = '7e023ff0-e452-480d-b42c-007d38f662b8';
delete from public.finance_raw_run
where run_id = '7e023ff0-e452-480d-b42c-007d38f662b8';

commit;
