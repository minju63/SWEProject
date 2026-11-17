import { supabase } from '../lib/supabase.js';
import { SEARCH_SUBCATEGORIES, searchSubcategories } from '../constants/policySubcategories.js';

const DETAIL_TABLE = {
  JOB: 'job_detail',
  HOUSING: 'housing_detail',
  FINANCE: 'finance_detail',
  CULTURE: 'culture_detail',
};

function originalLinkFromText(text) {
  const match = text?.match(/원문\s*URL\s*링크\s*\[?(https?:\/\/[^\s<>"']+)/iu);
  if (!match) return null;
  const candidate = match[1].replace(/[\]),.;!?]+$/u, '');
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}

async function allRows(table, columns, configure = (query) => query) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await configure(supabase.from(table).select(columns)).range(start, start + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

export async function findPolicies({ categoryId, categoryIds = [], details = [], categoryDetails = [], regions = [], statuses = [],
  dateStart, dateEnd, includeAlways, keyword, sort, page, size, profile }) {
  const advanced = sort === 'recommended' || Boolean(keyword) || categoryIds.length || details.length || categoryDetails.length ||
    regions.length || statuses.length || dateStart || dateEnd || profile;
  if (advanced) {
    const ids = categoryIds.length ? categoryIds : categoryId ? [categoryId] : [];
    const items = await allRows('policy',
      'policy_id,title,category_id,collection_domain,item_type,target_summary,support_content,application_start_date,application_end_date,is_always_open,created_at,min_age,max_age,eligibility_conditions,eligibility_verified',
      (query) => {
        if (ids.length) query = query.in('category_id', ids);
        return query.order('policy_id');
      });
    const policyIds = items.map((item) => item.policy_id);
    if (!policyIds.length) return { items: [], totalCount: 0 };
    const hasDetailFilter = details.length || categoryDetails.length;
    const domains = new Set(items.map((item) => item.collection_domain));
    const [statusRows, regionRows, detailRows, housingRows, financeRows, cultureRows] = await Promise.all([
      allRows('v_policy_status', 'policy_id,recruitment_status,d_day', (query) => query.order('policy_id')),
      allRows('policy_region', 'policy_id,region_code', (query) => query.order('policy_id').order('region_code')),
      hasDetailFilter && (domains.has('JOB') || domains.has('HOUSING'))
        ? allRows('policy_subcategory_map', 'policy_id,policy_subcategory(subcategory_name)',
        (query) => query.order('policy_id').order('subcategory_id')) : Promise.resolve([]),
      hasDetailFilter && domains.has('HOUSING') ? allRows('housing_detail', 'policy_id,housing_support_type') : Promise.resolve([]),
      hasDetailFilter && domains.has('FINANCE') ? allRows('finance_detail', 'policy_id,finance_type') : Promise.resolve([]),
      hasDetailFilter && domains.has('CULTURE') ? allRows('culture_detail', 'policy_id,culture_type') : Promise.resolve([]),
    ]);
    const statusById = new Map(statusRows.map((row) => [row.policy_id, row]));
    const regionsById = new Map();
    for (const row of regionRows) {
      if (!regionsById.has(row.policy_id)) regionsById.set(row.policy_id, []);
      regionsById.get(row.policy_id).push(row.region_code);
    }
    const detailsById = new Map();
    for (const row of detailRows) {
      if (!detailsById.has(row.policy_id)) detailsById.set(row.policy_id, []);
      detailsById.get(row.policy_id).push(row.policy_subcategory?.subcategory_name);
    }
    const domainDetails = new Map([...housingRows, ...financeRows, ...cultureRows].map((row) => [row.policy_id, row]));
    const filtered = items.filter((item) => {
      const status = statusById.get(item.policy_id);
      const itemRegions = regionsById.get(item.policy_id) ?? [];
      const itemDetails = hasDetailFilter
        ? searchSubcategories(item, detailsById.get(item.policy_id) ?? [], domainDetails.get(item.policy_id))
        : [];
      const searchText = `${item.title} ${item.target_summary ?? ''} ${item.support_content ?? ''} ${itemDetails.join(' ')}`.toLocaleLowerCase();
      if (keyword && !keyword.toLocaleLowerCase().trim().split(/\s+/).some((word) => searchText.includes(word))) return false;
      if (regions.length && !itemRegions.some((code) => code === 'KR' || code === '26' || regions.includes(code))) return false;
      if (statuses.length && !statuses.some((value) => {
        if (value === '7일 내 마감') return status?.recruitment_status === '모집 중' && status.d_day >= 0 && status.d_day <= 7;
        if (value === '모집 예정') return status?.recruitment_status === '모집 예정' || status?.recruitment_status === '예정';
        if (value === '마감') return status?.recruitment_status === '마감' || status?.recruitment_status === '종료';
        return status?.recruitment_status === value;
      })) return false;
      if (dateStart || dateEnd) {
        if (item.is_always_open) { if (!includeAlways) return false; }
        else if ((dateStart && (!item.application_end_date || item.application_end_date < dateStart)) ||
          (dateEnd && (!item.application_start_date || item.application_start_date > dateEnd))) return false;
      }
      if (details.length) {
        if (!details.some((value) => itemDetails.includes(value))) return false;
      }
      const selectedDetails = categoryDetails.find((entry) => entry.categoryId === item.category_id)?.details ?? [];
      if (selectedDetails.length) {
        if (!selectedDetails.some((value) => itemDetails.includes(value))) return false;
      }
      if (profile && profile.judge(item).result === 'INELIGIBLE') return false;
      return true;
    }).map((item) => ({ ...item, ...statusById.get(item.policy_id),
      region_codes: regionsById.get(item.policy_id) ?? [] }));
    const rank = (item) => ['모집 중', '진행 중'].includes(item.recruitment_status) ? 0
      : item.recruitment_status === '상시' ? 1 : ['모집 예정', '예정'].includes(item.recruitment_status) ? 2 : 3;
    filtered.sort((a, b) => sort === 'latest'
      ? b.created_at.localeCompare(a.created_at) || a.policy_id.localeCompare(b.policy_id)
      : sort === 'recommended'
        ? rank(a) - rank(b) || (a.d_day ?? 9999) - (b.d_day ?? 9999) || a.policy_id.localeCompare(b.policy_id)
        : (a.application_end_date ?? '9999').localeCompare(b.application_end_date ?? '9999') || a.policy_id.localeCompare(b.policy_id));
    return { items: filtered.slice((page - 1) * size, page * size), totalCount: filtered.length };
  }
  let query = supabase
    .from('policy')
    .select(
      'policy_id, title, category_id, item_type, target_summary, support_content, application_start_date, application_end_date, is_always_open',
      { count: 'exact' }
    );

  query = sort === 'latest'
    ? query.order('created_at', { ascending: false })
    : query.order('application_end_date', { ascending: true, nullsFirst: false });
  query = query.order('policy_id').range((page - 1) * size, page * size - 1);

  if (categoryId) query = query.eq('category_id', categoryId);
  if (keyword) query = query.ilike('title', `%${keyword}%`);

  const { data, count, error } = await query;
  if (error) throw error;
  const regionRows = data.length ? await allRows('policy_region', 'policy_id,region_code',
    (regionQuery) => regionQuery.in('policy_id', data.map((item) => item.policy_id))) : [];
  return { items: data.map((item) => ({ ...item,
    region_codes: regionRows.filter((row) => row.policy_id === item.policy_id).map((row) => row.region_code),
  })), totalCount: count };
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
  const [detailResult, categoryResult, regionsResult, sourceResult, relatedResult] = await Promise.all([
    supabase.from(detailTable).select('*').eq('policy_id', policyId).maybeSingle(),
    data.category_id
      ? supabase.from('policy_category').select('category_name').eq('category_id', data.category_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('policy_region').select('region_code, region:region_code(region_name)').eq('policy_id', policyId),
    data.collection_domain === 'CULTURE' && data.item_type === 'POLICY'
      ? supabase.from('policy_source').select('last_checked_at, source_url')
        .eq('policy_id', policyId).eq('source_type', 'CRAWL').like('external_id', 'WEB-%')
        .order('last_checked_at', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    data.category_id
      ? supabase.from('policy').select('policy_id, title, target_summary, support_content, application_end_date, category_id')
        .eq('category_id', data.category_id).eq('item_type', 'POLICY').neq('policy_id', policyId)
        .order('created_at', { ascending: false }).limit(2)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [detailResult, categoryResult, regionsResult, sourceResult, relatedResult]) {
    if (result.error) throw result.error;
  }

  return {
    ...data,
    original_link_url: originalLinkFromText(data.support_content),
    detail: detailResult.data ?? null,
    category_name: categoryResult.data?.category_name ?? null,
    regions: regionsResult.data.map((row) => row.region?.region_name ?? row.region_code),
    source_checked_at: sourceResult.data?.last_checked_at ?? null,
    source_url: sourceResult.data?.source_url ?? null,
    related_policies: relatedResult.data,
  };
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

export async function findSearchFilters() {
  const [categories, regions] = await Promise.all([
    findCategories(),
    allRows('region', 'region_code,region_name,region_level', (query) => query.eq('region_level', 'GU').order('region_code')),
  ]);
  return {
    categories: categories.filter((category) => category.is_search_enabled).map((category) => ({
      ...category,
      display_name: category.category_name,
      subcategories: (SEARCH_SUBCATEGORIES[category.category_name] ?? []).map((subcategory_name) => ({ subcategory_name })),
    })),
    regions,
  };
}
