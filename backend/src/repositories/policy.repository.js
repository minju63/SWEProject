import { supabase } from '../lib/supabase.js';
import { SEARCH_SUBCATEGORIES, searchSubcategories } from '../constants/policySubcategories.js';
import { policyStatus } from '../services/policy-status.service.js';
import { compareRecommendedPolicies } from '../services/policy-search-sort.service.js';

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
  dateStart, dateEnd, includeAlways, excludeClosed = false, keyword, sort, page, size, assess, onlyEligible,
  profileRegionCode, interests = [], includeEligibility }) {
  const advanced = sort === 'recommended' || Boolean(keyword) || categoryIds.length || details.length || categoryDetails.length ||
    regions.length || statuses.length || dateStart || dateEnd || onlyEligible || excludeClosed;
  if (advanced) {
    const ids = categoryIds.length ? categoryIds : categoryId ? [categoryId] : [];
    const items = await allRows('policy',
      'policy_id,title,category_id,collection_domain,item_type,target_summary,support_summary,support_content,benefit_type,application_start_date,application_end_date,is_always_open,created_at,min_age,max_age,income_condition,eligibility_conditions,eligibility_verified',
      (query) => {
        if (ids.length) query = query.in('category_id', ids);
        return query.eq('item_type', 'POLICY').order('policy_id');
      });
    const policyIds = items.map((item) => item.policy_id);
    if (!policyIds.length) return { items: [], totalCount: 0 };
    const hasDetailFilter = details.length || categoryDetails.length || Boolean(keyword);
    const domains = new Set(items.map((item) => item.collection_domain));
    const [statusRows, regionRows, detailRows, housingRows, financeRows, cultureRows, categoryRows] = await Promise.all([
      allRows('v_policy_status', 'policy_id,recruitment_status,d_day', (query) => query.order('policy_id')),
      allRows('policy_region', 'policy_id,region_code', (query) => query.order('policy_id').order('region_code')),
      hasDetailFilter && (domains.has('JOB') || domains.has('HOUSING'))
        ? allRows('policy_subcategory_map', 'policy_id,policy_subcategory(subcategory_name)',
        (query) => query.order('policy_id').order('subcategory_id')) : Promise.resolve([]),
      hasDetailFilter && domains.has('HOUSING') ? allRows('housing_detail', 'policy_id,housing_support_type') : Promise.resolve([]),
      hasDetailFilter && domains.has('FINANCE') ? allRows('finance_detail', 'policy_id,finance_type') : Promise.resolve([]),
      hasDetailFilter && domains.has('CULTURE') ? allRows('culture_detail', 'policy_id,culture_type') : Promise.resolve([]),
      findCategories(),
    ]);
    const categoryById = new Map(categoryRows.map((row) => [row.category_id, row.category_name]));
    const viewStatusById = new Map(statusRows.map((row) => [row.policy_id, row]));
    const statusById = new Map(items.map((item) => [item.policy_id,
      policyStatus(item, viewStatusById.get(item.policy_id))]));
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
      const searchText = `${item.title} ${item.target_summary ?? ''} ${item.support_content ?? ''} ${item.benefit_type ?? ''} ${categoryById.get(item.category_id) ?? ''} ${itemDetails.join(' ')}`.toLocaleLowerCase();
      if (keyword && !keyword.toLocaleLowerCase().trim().split(/\s+/).every((word) => searchText.includes(word))) return false;
      if (excludeClosed && ['마감', '종료'].includes(status?.recruitment_status)) return false;
      if (regions.length && !itemRegions.some((code) => regions.includes(code))) return false;
      if (onlyEligible && profileRegionCode && profileRegionCode !== 'KR' &&
        !itemRegions.some((code) => code === 'KR' || code === profileRegionCode ||
          (profileRegionCode.startsWith('26') && code === '26'))) return false;
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
      if (onlyEligible && assess(item).result === 'INELIGIBLE') return false;
      return true;
    }).map((item) => ({ ...item, ...statusById.get(item.policy_id),
      category_name: categoryById.get(item.category_id) ?? null,
      region_codes: regionsById.get(item.policy_id) ?? [],
      eligibility_result: assess(item).result }));
    filtered.sort((a, b) => sort === 'latest'
      ? b.created_at.localeCompare(a.created_at) || a.policy_id.localeCompare(b.policy_id)
      : sort === 'recommended'
        ? compareRecommendedPolicies(a, b, interests)
        : (a.application_end_date ?? '9999').localeCompare(b.application_end_date ?? '9999') || a.policy_id.localeCompare(b.policy_id));
    return { items: filtered.slice((page - 1) * size, page * size), totalCount: filtered.length };
  }
  const columns = 'policy_id, title, category_id, item_type, target_summary, support_summary, support_content, benefit_type, application_start_date, application_end_date, is_always_open';
  let query = supabase
    .from('policy')
    .select(
      includeEligibility ? `${columns}, min_age, max_age, income_condition, eligibility_conditions, eligibility_verified` : columns,
      { count: 'exact' }
    );

  query = sort === 'latest'
    ? query.order('created_at', { ascending: false })
    : query.order('application_end_date', { ascending: true, nullsFirst: false });
  query = query.order('policy_id').range((page - 1) * size, page * size - 1);

  if (categoryId) query = query.eq('category_id', categoryId);
  query = query.eq('item_type', 'POLICY');
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
  const [detailResult, categoryResult, regionsResult, subcategoryResult, sourceResult] = await Promise.all([
    detailTable
      ? supabase.from(detailTable).select('*').eq('policy_id', policyId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    data.category_id
      ? supabase.from('policy_category').select('category_name').eq('category_id', data.category_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('policy_region').select('region_code, region:region_code(region_name)').eq('policy_id', policyId),
    supabase.from('policy_subcategory_map')
      .select('policy_subcategory(subcategory_name)').eq('policy_id', policyId),
    supabase.from('policy_source').select('source_id, source_name, last_checked_at, source_url')
      .eq('policy_id', policyId).order('last_checked_at', { ascending: false, nullsFirst: false })
      .limit(1).maybeSingle(),
  ]);
  for (const result of [detailResult, categoryResult, regionsResult, subcategoryResult, sourceResult]) {
    if (result.error) throw result.error;
  }

  const storedSubcategories = subcategoryResult.data
    .map((row) => row.policy_subcategory?.subcategory_name).filter(Boolean);
  const subcategories = searchSubcategories(data, storedSubcategories, detailResult.data ?? {});

  return {
    ...data,
    original_link_url: originalLinkFromText(data.support_content),
    detail: detailResult.data ?? null,
    category_name: categoryResult.data?.category_name ?? null,
    subcategories: subcategories.length ? subcategories : storedSubcategories,
    regions: regionsResult.data.map((row) => row.region?.region_name ?? row.region_code),
    source_checked_at: sourceResult.data?.last_checked_at ?? null,
    source_url: sourceResult.data?.source_url ?? null,
    source_name: sourceResult.data?.source_name ?? null,
    source_id: sourceResult.data?.source_id ?? null,
  };
}

export async function findPolicyEligibility(policyId) {
  const { data, error } = await supabase.from('policy')
    .select('policy_id,eligibility_conditions,eligibility_verified,official_url')
    .eq('policy_id', policyId).maybeSingle();
  if (error) throw error;
  return data;
}

let similarityIndex;
let similarityIndexExpiresAt = 0;
let similarityIndexRequest;

export async function findSimilarityIndex() {
  if (similarityIndex && Date.now() < similarityIndexExpiresAt) return similarityIndex;
  if (similarityIndexRequest) return similarityIndexRequest;
  similarityIndexRequest = (async () => {
    const [policies, categories, mapped, regions, housing, finance, culture] = await Promise.all([
      allRows('policy', 'policy_id,title,category_id,collection_domain,item_type,target_summary,support_summary,support_content,benefit_type,min_age,max_age,income_condition,eligibility_conditions,eligibility_verified,application_start_date,application_end_date,is_always_open',
        (query) => query.eq('item_type', 'POLICY').order('policy_id')),
      findCategories(),
      allRows('policy_subcategory_map', 'policy_id,policy_subcategory(subcategory_name)'),
      allRows('policy_region', 'policy_id,region_code,region:region_code(region_name)'),
      allRows('housing_detail', 'policy_id,housing_support_type'),
      allRows('finance_detail', 'policy_id,finance_type'),
      allRows('culture_detail', 'policy_id,culture_type'),
    ]);
    const categoryById = new Map(categories.filter((item) => item.is_search_enabled)
      .map((item) => [item.category_id, item.category_name]));
    const namesById = new Map();
    for (const row of mapped) {
      if (!namesById.has(row.policy_id)) namesById.set(row.policy_id, []);
      if (row.policy_subcategory?.subcategory_name)
        namesById.get(row.policy_id).push(row.policy_subcategory.subcategory_name);
    }
    const regionsById = new Map();
    for (const row of regions) {
      if (!regionsById.has(row.policy_id)) regionsById.set(row.policy_id, []);
      regionsById.get(row.policy_id).push(row);
    }
    const detailById = new Map([...housing, ...finance, ...culture].map((row) => [row.policy_id, row]));
    return policies.filter((policy) => categoryById.has(policy.category_id)).map((policy) => ({
      ...policy,
      category_name: categoryById.get(policy.category_id),
      subcategories: searchSubcategories(policy, namesById.get(policy.policy_id) ?? [], detailById.get(policy.policy_id)),
      region_codes: (regionsById.get(policy.policy_id) ?? []).map((row) => row.region_code),
      regions: (regionsById.get(policy.policy_id) ?? []).map((row) => row.region?.region_name ?? row.region_code),
    }));
  })();
  try {
    similarityIndex = await similarityIndexRequest;
    similarityIndexExpiresAt = Date.now() + 30_000;
    return similarityIndex;
  } finally {
    similarityIndexRequest = null;
  }
}

export async function policyExists(policyId) {
  const { data, error } = await supabase.from('policy')
    .select('policy_id').eq('policy_id', policyId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
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

export async function findPopularSearchKeywords() {
  const { data, error } = await supabase.from('popular_search_keyword')
    .select('keyword').order('search_count', { ascending: false })
    .order('last_searched_at', { ascending: false }).limit(10);
  if (error) throw error;
  return data.map((row) => row.keyword);
}

export async function incrementPopularSearchKeyword(keyword) {
  const { error } = await supabase.rpc('record_popular_search_keyword', { p_keyword: keyword });
  if (error) throw error;
}

let suggestionIndex;
let suggestionIndexExpiresAt = 0;
let suggestionIndexRequest;

export async function findSuggestionIndex() {
  if (suggestionIndex && Date.now() < suggestionIndexExpiresAt) return suggestionIndex;
  if (suggestionIndexRequest) return suggestionIndexRequest;
  suggestionIndexRequest = (async () => {
    const [policies, categories, mapped, housing, finance, culture] = await Promise.all([
      allRows('policy', 'policy_id,title,category_id,collection_domain,item_type,target_summary,support_content,benefit_type',
        (query) => query.eq('item_type', 'POLICY').order('policy_id')),
      findCategories(),
      allRows('policy_subcategory_map', 'policy_id,policy_subcategory(subcategory_name)'),
      allRows('housing_detail', 'policy_id,housing_support_type'),
      allRows('finance_detail', 'policy_id,finance_type'),
      allRows('culture_detail', 'policy_id,culture_type'),
    ]);
    const categoryById = new Map(categories.filter((item) => item.is_search_enabled)
      .map((item) => [item.category_id, item.category_name]));
    const namesById = new Map();
    for (const row of mapped) {
      if (!namesById.has(row.policy_id)) namesById.set(row.policy_id, []);
      if (row.policy_subcategory?.subcategory_name)
        namesById.get(row.policy_id).push(row.policy_subcategory.subcategory_name);
    }
    const domainDetailById = new Map([...housing, ...finance, ...culture]
      .map((row) => [row.policy_id, row]));
    return policies.filter((policy) => categoryById.has(policy.category_id)).map((policy) => ({
      policy_id: policy.policy_id,
      title: policy.title,
      category_name: categoryById.get(policy.category_id),
      keywords: [policy.target_summary, policy.support_content, policy.benefit_type].filter(Boolean),
      subcategories: searchSubcategories(policy, namesById.get(policy.policy_id) ?? [],
        domainDetailById.get(policy.policy_id)),
    }));
  })();
  try {
    suggestionIndex = await suggestionIndexRequest;
    suggestionIndexExpiresAt = Date.now() + 30_000;
    return suggestionIndex;
  } finally {
    suggestionIndexRequest = null;
  }
}
