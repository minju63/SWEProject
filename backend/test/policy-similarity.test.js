import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { scorePolicySimilarity, similarityThreshold, compareSimilarPolicies } =
  await import('../src/services/policy-similarity.service.js');
const { selectSimilarPolicies } = await import('../src/services/policy-similar.service.js');

const base = {
  policy_id: 'base', title: '청년 월세 지원', category_id: 'housing', category_name: '주거·생활',
  subcategories: ['월세 지원'], support_content: '실제 납부 월세 지원',
  target_summary: '무주택 청년 임차인', region_codes: ['26'],
  eligibility_verified: false, item_type: 'POLICY', is_always_open: true,
};
const candidate = (overrides = {}) => ({ ...base, policy_id: 'other', title: '청년 월세 지원 확대', ...overrides });

test('실제 저장 필드의 25·20·20·15·15·5 가중치와 누락 근거를 분리한다', () => {
  const same = scorePolicySimilarity(base, candidate());
  assert.equal(same.score_breakdown.category, 25);
  assert.equal(same.score_breakdown.subcategory, 20);
  assert.ok(same.score_breakdown.benefit > 0 && same.score_breakdown.benefit <= 20);
  assert.ok(same.score_breakdown.target > 0 && same.score_breakdown.target <= 15);
  assert.equal(same.score_breakdown.conditions, 0);
  assert.equal(same.score_breakdown.region, 5);
  assert.ok(same.data_gaps.includes('검증된 신청 조건'));
  const missing = scorePolicySimilarity(base, candidate({ support_content: null, target_summary: null,
    subcategories: [], region_codes: [] }));
  assert.equal(missing.score_breakdown.benefit, 0);
  assert.equal(missing.score_breakdown.target, 0);
  assert.equal(missing.score_breakdown.region, 0);
  assert.ok(missing.data_gaps.includes('지원 대상'));
  assert.equal(similarityThreshold('55'), 55);
  assert.equal(similarityThreshold('not-a-score'), 38);
});

test('같은 분야를 우선하고 정책 자신·중복 수집 제목·무관 정책을 제외한다', () => {
  const same = candidate({ policy_id: 'same', title: '청년 월세 특별 지원' });
  const duplicate = candidate({ policy_id: 'duplicate', title: '청년-월세 지원' });
  const cross = candidate({ policy_id: 'cross', title: '월세 주거비 금융 지원', category_id: 'finance',
    category_name: '장학·금융', subcategories: [], target_summary: '무주택 청년 임차인' });
  const unrelated = candidate({ policy_id: 'unrelated', title: '예술 전시', category_id: 'culture',
    category_name: '문화', subcategories: [], support_content: '공연 관람',
    target_summary: '예술인', region_codes: ['11'] });
  const selected = selectSimilarPolicies(base, [base, same, duplicate, cross, unrelated], null, { threshold: 38, limit: 2 });
  assert.equal(selected[0].policy_id, 'same');
  assert.equal(selected[1].policy_id, 'cross');
  assert.ok(!selected.some((item) => ['base', 'duplicate', 'unrelated'].includes(item.policy_id)));
  assert.ok(selected.length <= 2);
  assert.deepEqual(selectSimilarPolicies(base, [base, unrelated], null, { threshold: 38, limit: 2 }), []);
});

test('유사도 5점 구간 내에서는 미마감·자격·상태·마감일·이름·ID 순으로 정렬한다', () => {
  const a = { similarity_score: 71, recruitment_status: '마감', eligibility_result: 'ELIGIBLE',
    application_end_date: '2026-01-01', title: '가', policy_id: 'a' };
  const b = { ...a, similarity_score: 70, recruitment_status: '모집 중', eligibility_result: 'CHECK', policy_id: 'b' };
  assert.ok(compareSimilarPolicies(b, a) < 0);
  const c = { ...b, similarity_score: 75, eligibility_result: 'INELIGIBLE', policy_id: 'c' };
  assert.ok(compareSimilarPolicies(c, b) < 0);
  assert.ok(compareSimilarPolicies({ ...b, eligibility_result: 'ELIGIBLE' }, b) < 0);
  assert.ok(compareSimilarPolicies({ ...b, policy_id: 'a' }, b) < 0);
});
