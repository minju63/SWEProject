import { supabase } from '../lib/supabase.js';

const DETAIL_TABLE = {
  JOB: 'job_detail',
  HOUSING: 'housing_detail',
  FINANCE: 'finance_detail',
  CULTURE: 'culture_detail',
};

export async function findPolicies({ categoryId, keyword, page, size }) {
  let query = supabase
    .from('policy')
    .select(
      'policy_id, title, category_id, item_type, support_content, application_start_date, application_end_date, is_always_open',
      { count: 'exact' }
    )
    .order('application_end_date', { ascending: true, nullsFirst: false })
    .range((page - 1) * size, page * size - 1);

  if (categoryId) query = query.eq('category_id', categoryId);
  if (keyword) query = query.ilike('title', `%${keyword}%`);

  const { data, count, error } = await query;
  if (error) throw error;
  return { items: data, totalCount: count };
}

export async function findPolicyById(policyId) {
  const { data, error } = await supabase
    .from('policy')
    .select('*')
    .eq('policy_id', policyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const detailTable = DETAIL_TABLE[data.collection_domain];
  const { data: detail } = await supabase
    .from(detailTable)
    .select('*')
    .eq('policy_id', policyId)
    .maybeSingle();

  return { ...data, detail: detail ?? null };
}

export async function findStatuses(policyIds) {
  if (policyIds.length === 0) return [];
  const { data, error } = await supabase
    .from('v_policy_status')
    .select('policy_id, recruitment_status, d_day')
    .in('policy_id', policyIds);
  if (error) throw error;
  return data;
}

export async function findCategories() {
  const { data, error } = await supabase
    .from('policy_category')
    .select('category_id, category_name, is_search_enabled, sort_order')
    .order('sort_order');
  if (error) throw error;
  return data;
}
