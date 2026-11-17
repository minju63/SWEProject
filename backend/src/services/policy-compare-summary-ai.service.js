import { getPolicyComparison } from './policy-compare.service.js';
import { aiText, groundedAiText, requestStructuredAI } from './ai-common.service.js';
import { aiPolicyFacts, comparisonGroundingInput, verifiedComparison } from './policy-compare-ai-facts.service.js';
import { POLICY_COMPARE_SUMMARY_SYSTEM_PROMPT } from '../prompts/policy-compare-summary.prompt.js';

const RESPONSE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    common_points: { type: 'array', items: { type: 'string' } },
    differences: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        topic: { type: 'string' }, policy_a: { type: 'string' },
        policy_b: { type: 'string' }, explanation: { type: 'string' },
        evidence_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['topic', 'policy_a', 'policy_b', 'explanation', 'evidence_ids'],
    } },
    summary: { type: 'string' },
    additional_checks: { type: 'array', items: { type: 'string' } },
  },
  required: ['common_points', 'differences', 'summary', 'additional_checks'],
};

export function comparisonAiInput(result) {
  const base = aiPolicyFacts(result.base, result.eligibility.base.result);
  const comparison = aiPolicyFacts(result.comparison, result.eligibility.comparison.result);
  const verified = verifiedComparison(base, comparison);
  return {
    policy_a: base, policy_b: comparison,
    verified_common_points: verified.common,
    verified_differences: verified.differences,
    additional_checks: verified.additionalChecks,
    evidence_ids: [base.policy_id, comparison.policy_id, base.source_id, comparison.source_id].filter(Boolean),
  };
}

function safeSummary(input, verified) {
  const a = input.policy_a.title;
  const b = input.policy_b.title;
  if (verified.differences.length) return `${a}과 ${b}은 ${verified.differences[0].topic}에서 차이가 확인됩니다.`;
  if (verified.common.length) return `${a}과 ${b}은 ${verified.common[0].split(':')[0]}에서 공통점이 확인됩니다.`;
  return `${a}과 ${b}의 확인된 정책 정보를 비교했습니다.`;
}

function safeDifference(item, input, explanation = null, evidence = []) {
  const grounding = comparisonGroundingInput(input.policy_a, input.policy_b,
    [item.topic, item.policy_a, item.policy_b]);
  const allowed = new Set(input.evidence_ids);
  const validExplanation = typeof explanation === 'string' &&
    explanation.includes(item.policy_a) && explanation.includes(item.policy_b) &&
    groundedAiText(explanation, grounding) && !/(?:무조건|확정적으로|더 좋)/u.test(explanation);
  return {
    ...item,
    explanation: validExplanation ? aiText(explanation)
      : `${item.topic}은 기준 정책과 비교 정책의 확인된 내용이 다릅니다.`,
    evidence_ids: [...new Set([input.policy_a.policy_id, input.policy_b.policy_id,
      ...evidence.filter((id) => allowed.has(id))])],
  };
}

function verdictAndStatusSafe(value, input) {
  if (/(?:무조건|확정적으로|더 좋|반드시 선정)/u.test(value)) return false;
  const policies = [input.policy_a, input.policy_b];
  if (policies.some((p) => p.eligibility_result === 'CHECK') &&
    /(?:두 정책 모두 신청 가능|모두 신청 가능)/u.test(value)) return false;
  if (policies.some((p) => p.recruitment_status === '마감') &&
    /(?:두 정책 모두 모집 중|모두 현재 신청 가능)/u.test(value)) return false;
  const allowedResults = new Set(policies.map((p) => p.eligibility_result));
  if (['ELIGIBLE', 'CHECK', 'INELIGIBLE'].some((status) =>
    value.includes(status) && !allowedResults.has(status))) return false;
  return true;
}

export function validateComparisonSummary(raw, input) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.common_points) ||
    !Array.isArray(raw.differences) || typeof raw.summary !== 'string' ||
    !Array.isArray(raw.additional_checks)) throw new Error('INVALID_AI_JSON');
  const verified = {
    common: input.verified_common_points,
    differences: input.verified_differences,
    additionalChecks: input.additional_checks,
  };
  const grounding = comparisonGroundingInput(input.policy_a, input.policy_b,
    [...verified.common, ...verified.differences.flatMap((item) =>
      [item.topic, item.policy_a, item.policy_b])]);
  const common = raw.common_points.filter((item) => typeof item === 'string' &&
    verified.common.some((fact) => item.includes(fact)) &&
    groundedAiText(item, grounding) && verdictAndStatusSafe(item, input)).map(aiText).slice(0, 4);
  const byTopic = new Map(verified.differences.map((item) => [item.topic, item]));
  const differences = [];
  const seen = new Set();
  for (const item of raw.differences.slice(0, 20)) {
    if (!item || typeof item.topic !== 'string' || !Array.isArray(item.evidence_ids) ||
      item.evidence_ids.some((id) => typeof id !== 'string')) continue;
    const fact = byTopic.get(item.topic);
    if (!fact || seen.has(item.topic)) continue;
    seen.add(item.topic);
    differences.push(safeDifference(fact, input, item.explanation, item.evidence_ids));
    if (differences.length === 4) break;
  }
  if (!differences.length) differences.push(...verified.differences.slice(0, 4)
    .map((item) => safeDifference(item, input)));
  const summary = groundedAiText(raw.summary, grounding) &&
    verdictAndStatusSafe(raw.summary, input) &&
    [input.policy_a.title, input.policy_b.title].every((title) => raw.summary.includes(title))
    ? aiText(raw.summary) : safeSummary(input, verified);
  const checks = raw.additional_checks.filter((item) => typeof item === 'string' &&
    verified.additionalChecks.includes(item)).map(aiText).slice(0, 6);
  return {
    common_points: [...new Set(common.length ? common : verified.common.slice(0, 4))],
    differences,
    summary,
    additional_checks: [...new Set(checks.length ? checks : verified.additionalChecks.slice(0, 6))],
  };
}

export async function getAiComparisonSummary(baseId, comparisonId, userId) {
  const result = await getPolicyComparison(baseId, comparisonId, userId);
  const input = comparisonAiInput(result);
  try {
    const raw = await requestStructuredAI({ input, systemPrompt: POLICY_COMPARE_SUMMARY_SYSTEM_PROMPT,
      schema: RESPONSE_SCHEMA, name: 'policy_compare_summary', maxOutputTokens: 1300 },
    { userId, timeoutMs: 18000 });
    return { status: 'ok', summary: validateComparisonSummary(raw, input) };
  } catch {
    return { status: 'error', summary: null };
  }
}
