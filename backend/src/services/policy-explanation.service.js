import { getEligibility, getPolicy } from './policy.service.js';
import { POLICY_EXPLANATION_SYSTEM_PROMPT } from '../prompts/policy-explanation.prompt.js';
import { aiText as text, groundedAiText as grounded, verdictConsistent,
  requestStructuredAI, AI_TIMEOUT_MS } from './ai-common.service.js';
import { logAi, aiErrorCode } from '../lib/opsLog.js';

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

const CONDITION_NAMES = {
  age: '나이', region: '거주 지역', region_code: '거주 지역', city_code: '거주 지역',
  residence_months: '거주 기간', income: '소득', annual_income: '연 소득', current_status: '현재 상태',
  housing_type: '주거 형태', household_type: '가구 형태', final_education: '학력',
  marital_status: '혼인 여부', is_married: '혼인 여부', home_ownership: '주택 소유',
  all_members_homeless: '세대원 무주택', rental_contract_signed: '임대차계약 체결',
  deposit_paid_ratio: '계약금 납부 비율', marriage_duration: '혼인 기간',
  special_targets: '특별 대상', household_role: '가구 내 지위',
};

function clean(value) {
  return text(value?.replace(/https?:\/\/\S+/giu, ' ').replace(/[□■▪●○※]/gu, ' ')
    .replace(/\(\s*\)/gu, ' ').replace(/\s+/gu, ' ')
    .replace(/^[\s\-•·]+/u, '').trim());
}

function brief(value) {
  const source = clean(value?.replace(/^[\s□■▪●○※]+/u, '')
    .split(/[□■▪●○※]|\r?\n|;|[.!?](?=\s|$)/u)[0]);
  return source.length <= 140 ? source.replace(/^(?:지원 내용|주요 혜택|혜택)\s*[:：]\s*/u, '') : '';
}

function safeCondition(condition) {
  return {
    field: condition.field ?? null,
    label: CONDITION_NAMES[condition.field] ?? null,
    status: condition.status,
    exclusion: condition.exclusion === true,
    policy_condition: brief(condition.text) ||
      (condition.evidence?.policy_value ?? condition.value ?? null),
    children: Array.isArray(condition.children) ? condition.children.map(safeCondition) : [],
  };
}

export function explanationInput(policy, eligibility) {
  const conditions = eligibility.conditions.map(safeCondition);
  const conditionFacts = [];
  const collectLabels = (item) => {
    if (item.label) conditionFacts.push(item.label);
    item.children.forEach(collectLabels);
  };
  conditions.forEach(collectLabels);
  const benefit = brief(policy.support_summary) || brief(policy.support_content) || clean(policy.benefit_type);
  const evidenceIds = [policy.policy_id, policy.source_id].filter(Boolean).map(String);
  return {
    policy: {
      policy_id: policy.policy_id, title: clean(policy.title),
      target_summary: brief(policy.target_summary) || null,
      support_summary: benefit || null,
      benefit_type: clean(policy.benefit_type) || null,
      recruitment_status: policy.recruitment_status ?? null,
      policy_conditions_verified: policy.eligibility_verified === true &&
        policy.eligibility_conditions?.logic !== 'UNVERIFIED' &&
        !['확인필요', 'UNVERIFIED'].includes(policy.eligibility_conditions?.verification),
    },
    eligibility: { result: eligibility.result, conditions },
    evidence_ids: evidenceIds,
    facts: [clean(policy.title), brief(policy.target_summary), benefit,
      '신청 조건 확인 필요 충족 대상 공식 공고',
      ...conditionFacts].filter(Boolean),
  };
}

function conditionLabels(conditions, status) {
  const labels = [];
  const visit = (item) => {
    if (item.status === status && item.label && !labels.includes(item.label)) labels.push(item.label);
    item.children?.forEach(visit);
  };
  conditions.forEach(visit);
  return labels.slice(0, 2);
}

function hasConflictingVerification(policy) {
  return policy.eligibility_verified === true &&
    (policy.eligibility_conditions?.logic === 'UNVERIFIED' ||
      ['확인필요', 'UNVERIFIED'].includes(policy.eligibility_conditions?.verification));
}

export function fallbackExplanation(policy, eligibility) {
  const benefit = brief(policy.support_summary) || brief(policy.support_content) || clean(policy.benefit_type);
  const title = clean(policy.title);
  const first = benefit ? /(?:합니다|입니다|됩니다|있습니다)[.!?]?$/u.test(benefit)
    ? benefit.replace(/[.!?]*$/u, '.')
    : `${title}의 주요 지원 내용은 ${benefit.replace(/[.!?]+$/u, '')}입니다.`
    : `${title}의 지원 내용은 공식 공고에서 확인해 주세요.`;
  const conditions = eligibility.conditions.map(safeCondition);
  const labels = conditionLabels(conditions, eligibility.result === 'INELIGIBLE' ? 'UNSATISFIED' : 'UNKNOWN');
  const hits = conditionLabels(conditions, 'HIT');
  let second;
  if (hasConflictingVerification(policy))
    second = '정책의 자격 정보 표기가 서로 달라 공식 공고 확인이 필요합니다.';
  else if (eligibility.result === 'ELIGIBLE')
    second = `${conditionLabels(conditions, 'SATISFIED')[0] ?? '확인된 신청'} 조건은 충족하지만 최종 신청 자격은 공고에서 확인해 주세요.`;
  else if (eligibility.result === 'INELIGIBLE')
    second = hits.length ? `${hits[0]} 제외 사항에 해당해 현재 대상이 아닙니다.`
      : `${labels[0] ?? '확인된 신청'} 조건에 맞지 않아 현재 대상이 아닙니다.`;
  else if (policy.eligibility_verified !== true)
    second = '신청 자격은 공식 공고에서 확인해 주세요.';
  else
    second = labels.length ? `${labels.join('·')} 조건은 추가 확인이 필요합니다.`
      : '신청 자격은 공식 공고에서 확인해 주세요.';
  // 내 정보로 확인된 조건이 있으면 먼저 알려 준다.
  const met = eligibility.result === 'CHECK' ? conditionLabels(conditions, 'SATISFIED') : [];
  if (met.length && second.includes('추가 확인이 필요')) second = `${met.join('·')} 조건은 충족하지만 ${second}`;
  return `${first} ${second}`;
}

export function validateExplanation(raw, policy, eligibility) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
    typeof raw.summary !== 'string' || !Array.isArray(raw.benefits) ||
    typeof raw.eligibility_explanation !== 'string' || typeof raw.recommendation_reason !== 'string' ||
    !Array.isArray(raw.additional_checks) || !Array.isArray(raw.evidence_ids) ||
    [...raw.benefits, ...raw.additional_checks, ...raw.evidence_ids].some((item) => typeof item !== 'string'))
    throw new Error('INVALID_AI_JSON');

  const input = explanationInput(policy, eligibility);
  const valid = (value) => grounded(value, input) && verdictConsistent(value, eligibility.result);
  const summary = clean(raw.summary);
  const sentences = summary.split(/[.!?]+(?:\s|$)/u).map((item) => item.trim()).filter(Boolean);
  const benefit = input.policy.support_summary;
  const hasBenefit = !benefit || benefit.split(/\s+/u).some((word) =>
    word.length >= 2 && summary.includes(word));
  const hasVerdictReason = eligibility.result === 'CHECK' ? /확인|공고|필요/u.test(summary)
    : eligibility.result === 'ELIGIBLE' ? /조건|충족|부합/u.test(summary)
      : /조건|대상|해당/u.test(summary);
  const usable = sentences.length >= 2 && sentences.length <= 3 &&
    new Set(sentences).size === sentences.length && hasBenefit && hasVerdictReason && valid(summary) &&
    !hasConflictingVerification(policy) &&
    !/정책 신청 조건이 검증되지 않았습니다|정책의 지원 내용과 내 조건을 함께 확인|[□■]/u.test(summary) &&
    !(eligibility.result === 'CHECK' &&
      /(?:신청\s*(?:가능|불가|할 수 있|하실 수 있)|자격\s*(?:충족|확정)|대상(?:자)?(?:입니다|이 아닙니다)|모두 충족)/u.test(summary));
  const benefits = raw.benefits.map(clean).filter((item) => valid(item) &&
    [policy.support_summary, policy.support_content, policy.benefit_type].some((source) =>
      source?.replace(/\s|[,.·□]/gu, '').includes(item.replace(/\s|[,.·]/gu, ''))));
  const checks = raw.additional_checks.map(clean).filter((item) => valid(item) &&
    eligibility.conditions.some((condition) => condition.status === 'UNKNOWN' &&
      [condition.text, CONDITION_NAMES[condition.field]].some((source) => source?.includes(item))));
  return {
    summary: usable ? summary : fallbackExplanation(policy, eligibility),
    benefits: [...new Set(benefits)],
    eligibility_explanation: valid(raw.eligibility_explanation) ? clean(raw.eligibility_explanation) : '',
    recommendation_reason: valid(raw.recommendation_reason) ? clean(raw.recommendation_reason) : '',
    additional_checks: [...new Set(checks)].slice(0, 2),
    evidence_ids: [...new Set([policy.policy_id, ...raw.evidence_ids.filter((id) => input.evidence_ids.includes(id))])],
  };
}

export async function requestExplanation(input, { fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || 'gpt-4.1-mini', timeoutMs = AI_TIMEOUT_MS, userId } = {}) {
  return requestStructuredAI({ input, systemPrompt: POLICY_EXPLANATION_SYSTEM_PROMPT,
    schema: RESPONSE_SCHEMA, name: 'policy_explanation', maxOutputTokens: 700 },
  { fetchImpl, apiKey, model, timeoutMs, userId });
}

export async function getPolicyExplanation(policyId, userId) {
  const [policy, eligibility] = await Promise.all([
    getPolicy(policyId, userId), getEligibility(policyId, userId),
  ]);
  const startedAt = Date.now();
  try {
    const raw = await requestExplanation(explanationInput(policy, eligibility), { userId });
    const explanation = validateExplanation(raw, policy, eligibility);
    // 검증을 통과하지 못해 기본 설명으로 바뀐 것도 '대체'로 기록한다
    logAi({ feature: 'POLICY_EXPLANATION', policyId, durationMs: Date.now() - startedAt,
      fallback: explanation.summary === fallbackExplanation(policy, eligibility) });
    return { status: 'ok', explanation };
  } catch (error) {
    logAi({ feature: 'POLICY_EXPLANATION', ok: false, errorCode: aiErrorCode(error), policyId,
      durationMs: Date.now() - startedAt, fallback: true });
    return { status: 'fallback', explanation: { summary: fallbackExplanation(policy, eligibility),
      benefits: [], eligibility_explanation: '', recommendation_reason: '',
      additional_checks: [], evidence_ids: [policy.policy_id] } };
  }
}
