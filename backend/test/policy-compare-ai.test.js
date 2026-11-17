import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { candidateAiInput, validateCandidateRecommendations } =
  await import('../src/services/policy-compare-candidates-ai.service.js');
const { comparisonAiInput, validateComparisonSummary } =
  await import('../src/services/policy-compare-summary-ai.service.js');
const { requestStructuredAI } = await import('../src/services/ai-common.service.js');
const { POLICY_COMPARE_CANDIDATES_SYSTEM_PROMPT } =
  await import('../src/prompts/policy-compare-candidates.prompt.js');
const { POLICY_COMPARE_SUMMARY_SYSTEM_PROMPT } =
  await import('../src/prompts/policy-compare-summary.prompt.js');

const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
];
const base = {
  policy_id: ids[0], title: '청년 취업 교육', category_name: '취업·진로',
  subcategories: ['취업 지원'], target_summary: '부산 청년',
  support_summary: '취업 교육 지원', support_content: '직무교육 지원', benefit_type: '교육',
  application_start_date: '2026-11-01', application_end_date: '2026-12-01',
  application_method: '온라인 신청', recruitment_status: '모집 중', regions: ['부산광역시'],
  eligibility_verified: true, eligibility_conditions: { all: [{ text: '만 19~34세' }] },
  eligibility_result: 'CHECK', source_id: ids[3],
};
const candidates = [
  { ...base, policy_id: ids[1], title: '청년 직무 교육', target_summary: '부산 구직 청년',
    support_summary: '직무 교육 지원', support_content: '직무 교육 지원', benefit_type: '교육',
    application_end_date: '2026-12-15', eligibility_result: 'ELIGIBLE', source_id: null,
    similarity_score: 77, reasons: ['대분류 일치: 취업·진로', '지원 지역 일치'] },
  { ...base, policy_id: ids[2], title: '청년 취업 훈련', target_summary: '부산 청년',
    support_summary: '취업 훈련 지원', support_content: '취업 훈련 지원',
    recruitment_status: '마감', eligibility_result: 'INELIGIBLE', source_id: null,
    similarity_score: 65, reasons: ['대분류 일치: 취업·진로'] },
];

test('후보 AI 입력은 실제 DB 후보만 포함하며 사용자 원값이 없다', () => {
  const input = candidateAiInput(base, candidates);
  assert.equal(input.base_policy.policy_id, ids[0]);
  assert.deepEqual(input.candidates.map((item) => item.policy_id), [ids[1], ids[2]]);
  assert.equal(input.candidates[0].eligibility_result, 'ELIGIBLE');
  assert.ok(!JSON.stringify(input).includes('profile_value'));
  assert.ok(!JSON.stringify(input).includes('user_id'));
});

test('후보 추천은 가짜 ID·자기 자신·중복을 제거하고 근거 없는 이유를 DB 근거로 대체한다', () => {
  const result = validateCandidateRecommendations({ recommendations: [
    { policy_id: ids[0], reason: '기준 정책', similarities: [], comparison_points: [], evidence_ids: [] },
    { policy_id: '99999999-9999-4999-8999-999999999999', reason: '가짜',
      similarities: [], comparison_points: [], evidence_ids: [] },
    { policy_id: ids[1], reason: '100만원을 무조건 지급합니다.',
      similarities: ['가짜 유사점', '대분류 일치: 취업·진로'], comparison_points: ['가짜 차이'],
      evidence_ids: ['99999999-9999-4999-8999-999999999999'] },
    { policy_id: ids[1], reason: '중복', similarities: [], comparison_points: [], evidence_ids: [] },
  ] }, base, candidates);
  assert.deepEqual(result.map((item) => item.policy_id), [ids[1], ids[2]]);
  assert.ok(!JSON.stringify(result).includes('100만원'));
  assert.ok(!JSON.stringify(result).includes('가짜 유사점'));
  assert.deepEqual(result[0].evidence_ids, [ids[0], ids[1]]);
  assert.equal(result[0].recommendation_reason, '대분류 일치: 취업·진로 · 지원 지역 일치');
});

test('비교 AI 입력은 두 정책의 실제 필드·판정만 포함하고 누락 항목은 차이로 만들지 않는다', () => {
  const comparison = { ...candidates[0], application_method: null };
  const input = comparisonAiInput({ base, comparison,
    eligibility: { base: { result: 'CHECK', conditions: [] },
      comparison: { result: 'ELIGIBLE', conditions: [] } } });
  assert.ok(input.verified_common_points.includes('분야: 취업·진로'));
  assert.ok(input.verified_differences.some((item) => item.topic === '지원 대상'));
  assert.ok(!input.verified_differences.some((item) => item.topic === '신청 방법'));
  assert.ok(input.additional_checks.some((item) => item.includes('신청 방법')));
  assert.equal(input.policy_a.eligibility_result, 'CHECK');
  assert.ok(!JSON.stringify(input).includes('profile_value'));
});

test('비교 요약의 가짜 금액·날짜·판정·근거를 제거하고 검증된 비교값만 반환한다', () => {
  const input = comparisonAiInput({ base, comparison: candidates[0],
    eligibility: { base: { result: 'CHECK' }, comparison: { result: 'ELIGIBLE' } } });
  const result = validateComparisonSummary({
    common_points: ['두 정책 모두 100만원 지급', '분야: 취업·진로'],
    differences: [{ topic: '지원 대상', policy_a: '가짜 대상', policy_b: '가짜 대상',
      explanation: '2027-01-01부터 100만원 지급',
      evidence_ids: ['99999999-9999-4999-8999-999999999999'] },
    { topic: '없는 항목', policy_a: '가짜', policy_b: '가짜', explanation: '가짜', evidence_ids: [] }],
    summary: '청년 취업 교육과 청년 직무 교육은 두 정책 모두 신청 가능합니다. 100만원 지급',
    additional_checks: ['없는 서류 확인', '기준 정책: 신청 자격 추가 확인 필요'],
  }, input);
  assert.ok(!JSON.stringify(result).includes('100만원'));
  assert.ok(!JSON.stringify(result).includes('2027-01-01'));
  assert.ok(!JSON.stringify(result).includes('가짜'));
  assert.equal(result.differences[0].policy_a, '부산 청년');
  assert.equal(result.differences[0].policy_b, '부산 구직 청년');
  assert.deepEqual(result.differences[0].evidence_ids.slice(0, 2), [ids[0], ids[1]]);
  assert.ok(result.additional_checks.includes('기준 정책: 신청 자격 추가 확인 필요'));
});

test('두 AI 기능은 실제 시스템 프롬프트와 JSON 스키마로 호출하고 사용자별 호출 수를 제한한다', async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ status: 'completed', output: [
      { type: 'message', content: [{ type: 'output_text', text: '{"recommendations":[]}' }] },
    ] }) };
  };
  const schema = { type: 'object', additionalProperties: false,
    properties: { recommendations: { type: 'array', items: { type: 'string' } } },
    required: ['recommendations'] };
  const userId = `rate-test-${Date.now()}`;
  for (let i = 0; i < 6; i++) {
    await requestStructuredAI({ input: { index: i }, systemPrompt: POLICY_COMPARE_CANDIDATES_SYSTEM_PROMPT,
      schema, name: 'compare_candidates_test' }, { fetchImpl, apiKey: 'test-key', userId });
  }
  await requestStructuredAI({ input: { index: 0 }, systemPrompt: POLICY_COMPARE_CANDIDATES_SYSTEM_PROMPT,
    schema, name: 'compare_candidates_test' }, { fetchImpl, apiKey: 'test-key', userId });
  assert.equal(calls.length, 6);
  assert.equal(calls[0].input[0].content, POLICY_COMPARE_CANDIDATES_SYSTEM_PROMPT);
  assert.equal(calls[0].text.format.type, 'json_schema');
  await assert.rejects(requestStructuredAI({ input: { index: 6 },
    systemPrompt: POLICY_COMPARE_SUMMARY_SYSTEM_PROMPT, schema, name: 'compare_summary_test' },
  { fetchImpl, apiKey: 'test-key', userId }), /AI_RATE_LIMIT/);
  await requestStructuredAI({ input: { comparison: true },
    systemPrompt: POLICY_COMPARE_SUMMARY_SYSTEM_PROMPT, schema, name: 'compare_summary_test' },
  { fetchImpl, apiKey: 'test-key', userId: `${userId}-other` });
  assert.equal(calls.at(-1).input[0].content, POLICY_COMPARE_SUMMARY_SYSTEM_PROMPT);
});
