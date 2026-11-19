import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { supabase } = await import('../src/lib/supabase.js');
const { findPolicies } = await import('../src/repositories/policy.repository.js');
const { listPolicies } = await import('../src/services/policy.service.js');
const { compareRecommendedPolicies } = await import('../src/services/policy-search-sort.service.js');

const rows = [
  ['p1', '관심 확인', 'c1', 'CHECK'],
  ['p2', '비관심 가능', 'c2', 'ELIGIBLE'],
  ['p3', '관심 가능', 'c1', 'ELIGIBLE'],
  ['p4', '비관심 확인', 'c2', 'CHECK'],
  ['p5', '관심 불가', 'c1', 'INELIGIBLE'],
  ['p6', '관심 마감', 'c1', 'ELIGIBLE'],
].map(([policy_id, title, category_id, result]) => ({
  policy_id, title, category_id, result, collection_domain: 'JOB', item_type: 'POLICY',
  is_always_open: policy_id !== 'p6', application_end_date: policy_id === 'p6' ? '2000-01-01' : null,
  created_at: '2026-01-01T00:00:00Z',
}));

const regionRows = [
  ['p1', 'KR'], ['p2', '26'], ['p3', '26380'],
  ['p4', '26230'], ['p5', '26380'], ['p6', 'KR'],
].map(([policy_id, region_code]) => ({ policy_id, region_code }));

function queryFor(table, overrides = {}) {
  const sources = {
    policy: rows,
    policy_category: [
      { category_id: 'c1', category_name: '취업·진로', is_search_enabled: true, sort_order: 1 },
      { category_id: 'c2', category_name: '주거·생활', is_search_enabled: true, sort_order: 2 },
    ],
    v_policy_status: [], policy_region: regionRows,
  };
  let selected = overrides[table] ?? sources[table] ?? [];
  return {
    select() { return this; },
    eq(field, value) { selected = selected.filter((row) => row[field] === value); return this; },
    in(field, values) { selected = selected.filter((row) => values.includes(row[field])); return this; },
    order() { return this; },
    range(start, end) { return Promise.resolve({ data: selected.slice(start, end + 1), error: null }); },
    maybeSingle() { return Promise.resolve({ data: selected[0] ?? null, error: null }); },
    then(resolve, reject) { return Promise.resolve({ data: selected, error: null }).then(resolve, reject); },
  };
}

test('사하구 프로필은 전국·부산·사하구를 포함하고 지역 칩은 선택한 구만 검색한다', async () => {
  const from = mock.method(supabase, 'from', queryFor);
  try {
    const params = { sort: 'latest', categoryIds: [], assess: (policy) => ({ result: policy.result }),
      page: 1, size: 10 };
    const mine = await findPolicies({ ...params, onlyEligible: true, profileRegionCode: '26380' });
    assert.deepEqual(mine.items.map((item) => item.policy_id), ['p1', 'p2', 'p3', 'p6']);
    const saha = await findPolicies({ ...params, regions: ['26380'] });
    assert.deepEqual(saha.items.map((item) => item.policy_id), ['p3', 'p5']);
    const busanjin = await findPolicies({ ...params, regions: ['26230'] });
    assert.deepEqual(busanjin.items.map((item) => item.policy_id), ['p4']);
    const combined = await findPolicies({ ...params, regions: ['26230'],
      onlyEligible: true, profileRegionCode: '26380' });
    assert.equal(combined.totalCount, 0);
  } finally {
    from.mock.restore();
  }
});

test('직접 설정도 저장 프로필과 같은 판정·지역 필터를 적용하고 CHECK는 남긴다', async () => {
  const conditions = (housingType) => ({ eligibility_verified: true,
    eligibility_conditions: { all: [{ field: 'housing_type', op: 'eq', value: housingType }] } });
  const policies = [
    { ...rows[0], ...conditions('월세') },
    { ...rows[1], ...conditions('자가') },
    { ...rows[2], eligibility_verified: false },
  ];
  const profile = { user_id: 'user-1', housing_type: '월세', region_code: '26380' };
  const from = mock.method(supabase, 'from', (table) => queryFor(table,
    { policy: policies, user_profile: [profile] }));
  try {
    const params = { userId: 'user-1', sort: 'recommended', page: 1, size: 10,
      includeEligibility: true };
    const mine = await listPolicies({ ...params, myConditionsOnly: true });
    assert.deepEqual(mine.items.map((item) => item.policy_id), ['p1', 'p3']);
    assert.equal(mine.totalCount, 2);

    const direct = await listPolicies({ ...params,
      conditions: JSON.stringify({ housing_type: '자가', region_code: '26380' }) });
    assert.deepEqual(direct.items.map((item) => item.policy_id), ['p2', 'p3']);
    assert.deepEqual(direct.items.map((item) => item.eligibility_result), ['ELIGIBLE', 'CHECK']);
    assert.equal(direct.totalCount, 2);

    const otherRegion = await listPolicies({ ...params,
      conditions: JSON.stringify({ housing_type: '자가', region_code: '26230' }) });
    assert.deepEqual(otherRegion.items.map((item) => item.policy_id), ['p2']);
    assert.equal(otherRegion.totalCount, 1);
  } finally {
    from.mock.restore();
  }
});

test('전체 결과의 추천 그룹을 정렬한 뒤 페이지별로 자른다', async () => {
  const from = mock.method(supabase, 'from', queryFor);
  try {
    const params = { sort: 'recommended', categoryIds: [], interests: ['취업·진로'],
      assess: (policy) => ({ result: policy.result }), size: 2 };
    const pages = await Promise.all([1, 2, 3].map((page) => findPolicies({ ...params, page })));
    assert.deepEqual(pages.map((result) => result.totalCount), [6, 6, 6]);
    assert.deepEqual(pages.flatMap((result) => result.items.map((item) => item.policy_id)),
      ['p3', 'p1', 'p2', 'p4', 'p5', 'p6']);
    assert.deepEqual(pages[0].items.map((item) => item.eligibility_result), ['ELIGIBLE', 'CHECK']);
    const filtered = await findPolicies({ ...params, page: 1, size: 10, onlyEligible: true });
    assert.deepEqual(filtered.items.map((item) => item.policy_id), ['p3', 'p1', 'p2', 'p4', 'p6']);
  } finally {
    from.mock.restore();
  }
});

test('마감 제외는 전체 건수와 페이지를 자르기 전에 적용한다', async () => {
  const from = mock.method(supabase, 'from', queryFor);
  try {
    const params = { sort: 'recommended', categoryIds: [], assess: (policy) => ({ result: policy.result }),
      page: 1, size: 10 };
    const all = await findPolicies(params);
    const excluded = await findPolicies({ ...params, excludeClosed: true, size: 2 });
    assert.equal(all.totalCount, 6);
    assert.equal(excluded.totalCount, 5);
    assert.equal(excluded.items.length, 2);
    assert.ok(!excluded.items.some((item) => item.policy_id === 'p6'));
  } finally {
    from.mock.restore();
  }
});

test('신청 가능은 확정 판정만 건수와 페이지 계산 전에 남기고 마감 제외와 함께 적용된다', async () => {
  const from = mock.method(supabase, 'from', queryFor);
  try {
    const params = { sort: 'recommended', categoryIds: [], assess: (policy) => ({ result: policy.result }),
      page: 1, size: 2, eligibleOnly: true };
    const eligible = await findPolicies(params);
    assert.equal(eligible.totalCount, 3);
    assert.deepEqual(eligible.items.map((item) => item.policy_id), ['p3', 'p2']);
    assert.ok(eligible.items.every((item) => item.eligibility_result === 'ELIGIBLE'));
    const openEligible = await findPolicies({ ...params, excludeClosed: true });
    assert.equal(openEligible.totalCount, 2);
    assert.deepEqual(openEligible.items.map((item) => item.policy_id), ['p3', 'p2']);
  } finally {
    from.mock.restore();
  }
});

test('관심분야 미설정 시 같은 정렬 함수가 자격, 상태, 마감일, 이름, ID를 적용한다', () => {
  const base = { application_end_date: '2026-12-01', recruitment_status: '모집 중' };
  const policies = [
    { ...base, policy_id: 'b', title: '가나다', eligibility_result: 'CHECK' },
    { ...base, policy_id: 'a', title: '가나다', eligibility_result: 'CHECK' },
    { ...base, policy_id: 'c', title: '나나', eligibility_result: 'ELIGIBLE' },
    { ...base, policy_id: 'd', title: '다다', eligibility_result: 'ELIGIBLE', recruitment_status: '상시' },
    { ...base, policy_id: 'e', title: '라마', eligibility_result: 'ELIGIBLE', application_end_date: '2026-11-30' },
  ];
  assert.deepEqual(policies.sort(compareRecommendedPolicies).map((item) => item.policy_id),
    ['e', 'c', 'd', 'a', 'b']);
});
