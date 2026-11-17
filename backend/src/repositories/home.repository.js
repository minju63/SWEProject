import { supabase } from '../lib/supabase.js';

// 홈·AI 비서가 후보로 쓰는 정책 전체. 모집 상태·D-day 는 v_policy_status 에서 가져와 합친다.
const POLICY_COLUMNS =
  'policy_id, title, category_id, item_type, target_summary, support_content, min_age, max_age, ' +
  'income_condition, application_start_date, application_end_date, is_always_open, ' +
  'application_method, application_url, official_url, eligibility_conditions, ' +
  'eligibility_verified, required_documents, last_collected_at';

export async function findCandidatePolicies() {
  const [policies, statuses, regions] = await Promise.all([
    supabase.from('policy').select(POLICY_COLUMNS).neq('item_type', 'EVENT'),
    supabase.from('v_policy_status').select('policy_id, recruitment_status, d_day'),
    supabase.from('policy_region').select('policy_id, region:region_code (region_name)'),
  ]);
  for (const r of [policies, statuses, regions]) if (r.error) throw r.error;

  const statusById = new Map(statuses.data.map((s) => [s.policy_id, s]));
  const regionsById = new Map();
  for (const row of regions.data) {
    const list = regionsById.get(row.policy_id) ?? [];
    if (row.region?.region_name) list.push(row.region.region_name);
    regionsById.set(row.policy_id, list);
  }
  return policies.data.map((p) => ({
    ...p,
    recruitment_status: statusById.get(p.policy_id)?.recruitment_status ?? null,
    d_day: statusById.get(p.policy_id)?.d_day ?? null,
    region_names: regionsById.get(p.policy_id) ?? [],
  }));
}

export async function findSources(policyIds) {
  if (policyIds.length === 0) return [];
  const { data, error } = await supabase
    .from('policy_source')
    .select('policy_id, source_name, source_url, last_checked_at')
    .in('policy_id', policyIds);
  if (error) throw error;
  return data;
}

export async function findBookmarkedIds(userId) {
  const { data, error } = await supabase
    .from('user_bookmark')
    .select('policy_id, created_at')
    .eq('user_id', userId);
  if (error) throw error;
  return data;
}

// 서류 체크 진행률용: 정책별 체크된 서류 수
export async function findCheckedDocCounts(userId) {
  const { data, error } = await supabase
    .from('user_document_check')
    .select('policy_id, doc_key')
    .eq('user_id', userId)
    .eq('is_checked', true);
  if (error) throw error;
  const counts = new Map();
  for (const row of data) counts.set(row.policy_id, (counts.get(row.policy_id) ?? 0) + 1);
  return counts;
}

export async function findRegions() {
  const { data, error } = await supabase
    .from('region')
    .select('region_code, region_name, region_level');
  if (error) throw error;
  return data;
}
