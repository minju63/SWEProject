import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { explanationInput, requestExplanation, validateExplanation, fallbackExplanation } =
  await import('../src/services/policy-explanation.service.js');
const { POLICY_EXPLANATION_SYSTEM_PROMPT } =
  await import('../src/prompts/policy-explanation.prompt.js');

const id = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const policy = {
  policy_id: id, source_id: sourceId, title: '청년 취업 교육', target_summary: '부산 청년',
  support_summary: '취업 교육 지원', support_content: '취업 교육 지원', eligibility_verified: true,
  benefit_type: '교육', application_start_date: '2026-11-01', application_end_date: '2026-12-31',
  application_method: '온라인 신청', recruitment_status: '모집 중',
  official_url: 'https://example.org/policy', source_name: '공식 기관',
};
const eligibility = {
  result: 'CHECK', reason: '정책 조건 또는 사용자 정보를 추가로 확인해야 합니다.',
  conditions: [{ field: 'age', status: 'UNKNOWN', text: '만 19~34세',
    reason: '사용자 정보가 없어 확인할 수 없습니다.',
    evidence: { source: 'policy.eligibility_conditions.all[0]', policy_value: [19, 34],
      profile_value: '2001-01-01', source_url: 'https://example.org/policy' } }],
};

test('AI 입력에는 실제 정책·근거 ID와 판정만 포함하고 사용자 원값을 제외한다', () => {
  const input = explanationInput(policy, eligibility);
  const json = JSON.stringify(input);
  assert.deepEqual(input.evidence_ids, [id, sourceId]);
  assert.equal(input.eligibility.result, 'CHECK');
  assert.equal(input.policy.title, policy.title);
  assert.ok(!json.includes('2001-01-01'));
  assert.ok(!json.includes('profile_value'));
  assert.ok(!json.includes('user_id'));
  assert.equal(input.policy.support_summary, '취업 교육 지원');
  assert.ok(!json.includes('support_content'));
  assert.ok(!json.includes(eligibility.reason));
  assert.ok(!json.includes(eligibility.conditions[0].reason));
});

test('실제 시스템 프롬프트와 JSON 스키마를 서버 요청으로 보내고 응답을 파싱한다', async () => {
  let sent;
  const output = { summary: '청년 취업 교육은 취업 교육 지원 정책입니다.', benefits: ['취업 교육 지원'],
    eligibility_explanation: '확인 필요', recommendation_reason: '취업 교육 지원',
    additional_checks: ['만 19~34세'], evidence_ids: [id, sourceId] };
  const fetchImpl = async (_url, options) => {
    sent = options;
    return { ok: true, json: async () => ({ status: 'completed', output: [
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] },
    ] }) };
  };
  const result = await requestExplanation(explanationInput(policy, eligibility),
    { fetchImpl, apiKey: 'test-only-key', model: 'test-model' });
  assert.deepEqual(result, output);
  const body = JSON.parse(sent.body);
  assert.equal(body.input[0].role, 'system');
  assert.equal(body.input[0].content, POLICY_EXPLANATION_SYSTEM_PROMPT);
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.store, false);
});

test('DB에 없는 금액·날짜·조건·근거와 잘못된 판정을 제거한다', () => {
  const output = validateExplanation({
    summary: '청년 취업 교육은 2027-01-01부터 100만원을 지급합니다.',
    benefits: ['100만원 현금 지급', '취업 교육 지원'],
    eligibility_explanation: 'ELIGIBLE, 신청이 확정됩니다.',
    recommendation_reason: '무조건 신청 가능합니다.',
    additional_checks: ['미혼만 신청 가능'],
    evidence_ids: [sourceId, '33333333-3333-4333-8333-333333333333'],
  }, policy, eligibility);
  assert.ok(!JSON.stringify(output).includes('100만원'));
  assert.ok(!JSON.stringify(output).includes('2027-01-01'));
  assert.ok(!JSON.stringify(output).includes('미혼'));
  assert.ok(!output.summary.includes(eligibility.reason));
  assert.ok(output.summary.includes('나이'));
  assert.equal(output.eligibility_explanation, '');
  assert.deepEqual(output.benefits, ['취업 교육 지원']);
  assert.deepEqual(output.additional_checks, []);
  assert.deepEqual(output.evidence_ids, [id, sourceId]);
});

test('실제 정책 표현의 자연스러운 요약은 유지하고 근거 없는 혜택은 거른다', () => {
  const valid = validateExplanation({
    summary: '청년 취업 교육은 부산 청년 대상 취업 교육 지원 정책입니다. 나이 조건은 추가 확인이 필요합니다.',
    benefits: ['취업 교육 지원', '무료 여행 제공'],
    eligibility_explanation: 'CHECK', recommendation_reason: '취업 교육 지원',
    additional_checks: [], evidence_ids: [id],
  }, policy, eligibility);
  assert.equal(valid.summary, '청년 취업 교육은 부산 청년 대상 취업 교육 지원 정책입니다. 나이 조건은 추가 확인이 필요합니다.');
  assert.deepEqual(valid.benefits, ['취업 교육 지원']);
});

test('원본 기호와 반복된 검증 문구를 설명에 노출하지 않고 미검증 자격을 확정하지 않는다', () => {
  const unverified = { ...policy, support_summary: '□ 취업 교육 지원', eligibility_verified: false };
  const repeated = { ...eligibility, reason: '정책 신청 조건이 검증되지 않았습니다.',
    conditions: Array.from({ length: 4 }, () => ({ field: 'age', status: 'UNKNOWN',
      text: '□ 만 19~34세', reason: '정책 신청 조건이 검증되지 않았습니다.' })) };
  const result = fallbackExplanation(unverified, repeated);
  assert.equal(result, '청년 취업 교육의 주요 지원 내용은 취업 교육 지원입니다. 신청 자격은 공식 공고에서 확인해 주세요.');
  assert.ok(!result.includes('□'));
  assert.ok(!result.includes('검증되지 않았습니다'));
  assert.ok(!explanationInput(unverified, repeated).eligibility.reason);
});

test('AI 결과가 2~3문장이 아니거나 확인되지 않은 혜택을 담으면 DB 기반 설명을 사용한다', () => {
  const result = validateExplanation({ summary: '무료 여행도 지원합니다.', benefits: [],
    eligibility_explanation: '', recommendation_reason: '', additional_checks: [], evidence_ids: [] },
  policy, eligibility);
  assert.equal(result.summary, fallbackExplanation(policy, eligibility));
  assert.ok(!result.summary.includes('여행'));
});

test('CHECK를 신청 가능으로 단정한 문장과 상충된 원본 표기는 대체 설명으로 분리한다', () => {
  const raw = { summary: '청년 취업 교육은 취업 교육을 지원합니다. 신청할 수 있습니다.',
    benefits: [], eligibility_explanation: '', recommendation_reason: '',
    additional_checks: [], evidence_ids: [] };
  assert.equal(validateExplanation(raw, policy, eligibility).summary, fallbackExplanation(policy, eligibility));
  const conflict = { ...policy, eligibility_conditions: { logic: 'UNVERIFIED' } };
  const result = validateExplanation(raw, conflict, eligibility).summary;
  assert.ok(result.includes('표기가 서로 달라'));
  assert.ok(!result.includes('신청할 수 있습니다'));
});

test('API 오류·형식 오류·타임아웃은 설명 요청에서만 실패한다', async () => {
  const input = explanationInput(policy, eligibility);
  await assert.rejects(requestExplanation(input, { apiKey: '', fetchImpl: async () => {} }),
    /AI_NOT_CONFIGURED/);
  await assert.rejects(requestExplanation(input, { apiKey: 'x', fetchImpl: async () => ({ ok: false }) }),
    /AI_REQUEST_FAILED/);
  await assert.rejects(requestExplanation(input, { apiKey: 'x', fetchImpl: async () => ({ ok: true,
    json: async () => ({ status: 'completed', output: [{ type: 'message',
      content: [{ type: 'output_text', text: '{broken' }] }] }) }) }), /INVALID_AI_JSON/);
  await assert.rejects(requestExplanation(input, { apiKey: 'x', fetchImpl: async () => {
    throw new DOMException('Timed out', 'TimeoutError');
  } }), /Timed out/);
  assert.throws(() => validateExplanation({ summary: 'bad' }, policy, eligibility), /INVALID_AI_JSON/);
});
