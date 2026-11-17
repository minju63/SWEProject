import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { explanationInput, requestExplanation, validateExplanation } =
  await import('../src/services/policy-explanation.service.js');
const { POLICY_EXPLANATION_SYSTEM_PROMPT } =
  await import('../src/prompts/policy-explanation.prompt.js');

const id = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const policy = {
  policy_id: id, source_id: sourceId, title: '청년 취업 교육', target_summary: '부산 청년',
  support_summary: '취업 교육 지원', support_content: '취업 교육 지원',
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
  assert.ok(output.eligibility_explanation.startsWith(eligibility.reason));
  assert.ok(output.eligibility_explanation.includes('나이'));
  assert.deepEqual(output.benefits, ['취업 교육 지원']);
  assert.deepEqual(output.additional_checks, ['만 19~34세']);
  assert.deepEqual(output.evidence_ids, [id, sourceId]);
});

test('실제 정책 표현의 자연스러운 요약은 유지하고 근거 없는 혜택은 거른다', () => {
  const valid = validateExplanation({
    summary: '청년 취업 교육은 부산 청년 대상 취업 교육 지원 정책입니다.',
    benefits: ['취업 교육 지원', '무료 여행 제공'],
    eligibility_explanation: 'CHECK', recommendation_reason: '취업 교육 지원',
    additional_checks: [], evidence_ids: [id],
  }, policy, eligibility);
  assert.equal(valid.summary, '청년 취업 교육은 부산 청년 대상 취업 교육 지원 정책입니다.');
  assert.deepEqual(valid.benefits, ['취업 교육 지원']);
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
