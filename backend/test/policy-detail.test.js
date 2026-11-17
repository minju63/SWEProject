import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { supabase } = await import('../src/lib/supabase.js');
const { getPolicy, recordRecentView } = await import('../src/services/policy.service.js');

test('상세 조회는 분야별 관계, JSONB 순서, 출처, 개인 찜과 DB 기반 요약을 반환한다', async () => {
  const policyId = '11111111-1111-4111-8111-111111111111';
  const documents = [{ key: 'd2', name: '두 번째' }, { key: 'd1', name: '첫 번째' }];
  const steps = ['1단계', '2단계'];
  const policy = {
    policy_id: policyId, collection_domain: 'JOB', item_type: 'POLICY',
    title: '청년 취업 지원', category_id: 'category-1', target_summary: '부산 청년',
    support_content: '취업 교육 지원', benefit_type: '교육',
    application_start_date: '2026-11-01', application_end_date: '2026-12-31',
    is_always_open: false, application_method: '온라인 접수',
    application_process: steps, required_documents: documents,
  };
  const rows = {
    policy,
    job_detail: { policy_id: policyId, job_type: '취업지원' },
    policy_category: { category_name: '취업·진로' },
    policy_region: [{ region_code: '26', region: { region_name: '부산광역시' } }],
    policy_subcategory_map: [{ policy_subcategory: { subcategory_name: '취업지원' } }],
    policy_source: { source_name: '공식 기관', source_url: 'https://example.org/policy', last_checked_at: '2026-11-17T00:00:00Z' },
    v_policy_status: [{ policy_id: policyId, recruitment_status: '모집 중', d_day: 44 }],
    user_bookmark: [{ policy_id: policyId }],
  };
  const touched = [];
  const from = mock.method(supabase, 'from', (table) => {
    touched.push(table);
    return {
      select() { return this; }, eq() { return this; }, neq() { return this; },
      in() { return this; }, order() { return this; }, limit() { return this; },
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      then(resolve, reject) {
        const data = Array.isArray(rows[table]) ? rows[table] : [];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
  });
  try {
    const result = await getPolicy(policyId, 'trusted-user');
    assert.ok(touched.includes('job_detail'));
    assert.deepEqual(result.detail, rows.job_detail);
    assert.deepEqual(result.subcategories, ['취업지원']);
    assert.deepEqual(result.regions, ['부산광역시']);
    assert.deepEqual(result.application_process, steps);
    assert.deepEqual(result.required_documents, documents);
    assert.equal(result.source_checked_at, rows.policy_source.last_checked_at);
    assert.equal(result.is_bookmarked, true);
    assert.deepEqual(result.summary.application_period, {
      start_date: '2026-11-01', end_date: '2026-12-31', is_always_open: false,
    });
    assert.equal(result.summary.application_method, '온라인 접수');
    assert.equal(result.summary.benefit, '취업 교육 지원');
  } finally {
    from.mock.restore();
  }
});

test('최근 본 정책은 검증된 사용자 ID로만 저장하고 없는 정책은 기록하지 않는다', async () => {
  const saved = [];
  let exists = true;
  const from = mock.method(supabase, 'from', (table) => ({
    select() { return this; }, eq() { return this; },
    maybeSingle: async () => ({ data: exists ? { policy_id: 'policy-1' } : null, error: null }),
    upsert(value, options) { saved.push({ table, value, options }); return this; },
    then(resolve, reject) { return Promise.resolve({ data: null, error: null }).then(resolve, reject); },
  }));
  try {
    await recordRecentView('policy-1', 'trusted-user');
    assert.equal(saved[0].table, 'user_recent_view');
    assert.equal(saved[0].value.user_id, 'trusted-user');
    assert.equal(saved[0].value.policy_id, 'policy-1');
    assert.equal(saved[0].options.onConflict, 'user_id,policy_id');
    exists = false;
    await assert.rejects(recordRecentView('missing', 'trusted-user'),
      (error) => error.status === 404 && error.code === 'POLICY_NOT_FOUND');
    assert.equal(saved.length, 1);
  } finally {
    from.mock.restore();
  }
});
