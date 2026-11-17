import { getEligibility, getPolicy } from './policy.service.js';
import { POLICY_EXPLANATION_SYSTEM_PROMPT } from '../prompts/policy-explanation.prompt.js';
import { aiText as text, groundedAiText as grounded, verdictConsistent,
  requestStructuredAI } from './ai-common.service.js';

const RESPONSE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    benefits: { type: 'array', items: { type: 'string' } },
    eligibility_explanation: { type: 'string' },
    recommendation_reason: { type: 'string' },
    additional_checks: { type: 'array', items: { type: 'string' } },
    evidence_ids: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'benefits', 'eligibility_explanation', 'recommendation_reason', 'additional_checks', 'evidence_ids'],
};

function safeCondition(condition) {
  return {
    field: condition.field ?? null,
    status: condition.status,
    policy_condition: condition.text ?? condition.evidence?.policy_value ?? condition.value ?? null,
    reason: condition.reason,
    evidence_source: condition.evidence?.source ?? null,
    source_url: condition.evidence?.source_url ?? null,
    children: Array.isArray(condition.children) ? condition.children.map(safeCondition) : [],
  };
}

export function explanationInput(policy, eligibility) {
  const conditions = eligibility.conditions.map(safeCondition);
  const evidenceIds = [policy.policy_id, policy.source_id].filter(Boolean).map(String);
  return {
    policy: {
      policy_id: policy.policy_id, title: policy.title,
      target_summary: policy.target_summary ?? null,
      support_summary: policy.support_summary ?? null,
      support_content: policy.support_content ?? null,
      benefit_type: policy.benefit_type ?? null,
      application_start_date: policy.application_start_date ?? null,
      application_end_date: policy.application_end_date ?? null,
      is_always_open: policy.is_always_open === true,
      application_method: policy.application_method ?? null,
      recruitment_status: policy.recruitment_status ?? null,
      official_url: policy.official_url ?? null,
      source_name: policy.source_name ?? null,
      source_url: policy.source_url ?? null,
      source_id: policy.source_id ?? null,
    },
    eligibility: {
      result: eligibility.result, reason: eligibility.reason,
      conditions,
      additional_checks: conditions.filter((item) => item.status === 'UNKNOWN'),
    },
    evidence_ids: evidenceIds,
  };
}

function fallbackBenefits(policy) {
  return [policy.support_summary || policy.benefit_type || policy.support_content].filter(Boolean).map((item) => text(item));
}

const CONDITION_NAMES = {
  age: '나이', region: '거주 지역', income: '소득', current_status: '현재 상태',
  housing_type: '주거 형태', household_type: '가구 형태', final_education: '학력',
};

function conditionExplanation(eligibility) {
  const details = eligibility.conditions.slice(0, 4).map((item) => {
    const name = CONDITION_NAMES[item.field] || item.text || '신청 조건';
    return `${name}: ${item.reason}`;
  });
  return text([eligibility.reason, ...details].join(' '));
}

export function validateExplanation(raw, policy, eligibility) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
    typeof raw.summary !== 'string' || !Array.isArray(raw.benefits) ||
    typeof raw.eligibility_explanation !== 'string' || typeof raw.recommendation_reason !== 'string' ||
    !Array.isArray(raw.additional_checks) || !Array.isArray(raw.evidence_ids) ||
    [...raw.benefits, ...raw.additional_checks, ...raw.evidence_ids].some((item) => typeof item !== 'string')) {
    throw new Error('INVALID_AI_JSON');
  }
  const input = explanationInput(policy, eligibility);
  const valid = (value) => grounded(value, input) && verdictConsistent(value, eligibility.result);
  const checks = eligibility.conditions.filter((item) => item.status === 'UNKNOWN')
    .map((item) => item.text || item.evidence?.policy_value || item.reason)
    .filter((item) => typeof item === 'string' && item.trim()).map(text);
  const summary = valid(raw.summary) && raw.summary.includes(policy.title)
    ? text(raw.summary) : text(`${policy.title}: ${policy.support_summary || policy.support_content || policy.target_summary || '정책 내용 확인 필요'}`);
  const benefits = raw.benefits.filter((item) => valid(item) &&
    [policy.support_summary, policy.support_content, policy.benefit_type].some((source) =>
      source?.replace(/\s|[,.·]/gu, '').includes(item.trim().replace(/\s|[,.·]/gu, ''))))
    .map(text);
  const finalBenefits = benefits.length ? benefits : fallbackBenefits(policy);
  const eligibilityExplanation = conditionExplanation(eligibility);
  const recommendationReason = valid(raw.recommendation_reason) &&
    [policy.support_summary, policy.support_content, policy.benefit_type].some((source) =>
      source && source.split(/\s+/u).some((word) => word.length >= 2 && raw.recommendation_reason.includes(word)))
    ? text(raw.recommendation_reason) : '정책의 지원 내용과 내 조건을 함께 확인해 주세요.';
  const additionalChecks = raw.additional_checks.filter((item) => valid(item) && checks.some((check) => check.includes(item.trim())))
    .map(text);
  return {
    summary, benefits: [...new Set(finalBenefits)], eligibility_explanation: eligibilityExplanation,
    recommendation_reason: recommendationReason,
    additional_checks: [...new Set(additionalChecks.length ? additionalChecks : checks)],
    evidence_ids: [...new Set([policy.policy_id, ...raw.evidence_ids.filter((id) => input.evidence_ids.includes(id))])],
  };
}

export async function requestExplanation(input, { fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || 'gpt-4.1-mini', timeoutMs = 12000, userId } = {}) {
  return requestStructuredAI({ input, systemPrompt: POLICY_EXPLANATION_SYSTEM_PROMPT,
    schema: RESPONSE_SCHEMA, name: 'policy_explanation', maxOutputTokens: 700 },
  { fetchImpl, apiKey, model, timeoutMs, userId });
}

export async function getPolicyExplanation(policyId, userId) {
  const [policy, eligibility] = await Promise.all([
    getPolicy(policyId, userId), getEligibility(policyId, userId),
  ]);
  const input = explanationInput(policy, eligibility);
  try {
    const raw = await requestExplanation(input, { userId });
    return { status: 'ok', explanation: validateExplanation(raw, policy, eligibility) };
  } catch (error) {
    if (error.message === 'AI_NOT_CONFIGURED') return { status: 'unavailable', explanation: null };
    return { status: 'error', explanation: null };
  }
}
