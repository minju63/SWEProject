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
    recommendation: { type: 'object', additionalProperties: false,
      properties: { policy_id: { type: ['string', 'null'] }, reason: { type: 'string' } },
      required: ['policy_id', 'reason'] },
    additional_checks: { type: 'array', items: { type: 'string' } },
  },
  required: ['common_points', 'differences', 'summary', 'recommendation', 'additional_checks'],
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
    profile_interest_match: result.profile_interest_match ?? { base: false, comparison: false },
    profile_conditions: {
      base: matchedProfileConditions(result.eligibility.base),
      comparison: matchedProfileConditions(result.eligibility.comparison),
    },
    evidence_ids: [base.policy_id, comparison.policy_id, base.source_id, comparison.source_id].filter(Boolean),
  };
}

const PROFILE_CONDITION_LABELS = {
  age: '나이', region: '거주 지역', region_code: '거주 지역',
  residence_months: '거주 기간', final_education: '학력', current_status: '현재 상태',
  housing_type: '주거 형태', household_type: '가구 형태',
  home_ownership: '주택 소유', household_role: '가구 내 역할',
};

function matchedProfileConditions(eligibility) {
  const fields = new Set();
  const visit = (condition) => {
    if (condition.status === 'SATISFIED' && PROFILE_CONDITION_LABELS[condition.field])
      fields.add(PROFILE_CONDITION_LABELS[condition.field]);
    condition.children?.forEach(visit);
  };
  eligibility.conditions?.forEach(visit);
  return [...fields].slice(0, 3);
}

export function personalizedComparisonRecommendation(input) {
  const policies = [input.policy_a, input.policy_b];
  const rank = { ELIGIBLE: 2, CHECK: 1, INELIGIBLE: 0 };
  const scores = policies.map((policy) => rank[policy.eligibility_result] ?? 0);
  if (scores.every((score) => score === 0)) return {
    policy_id: null,
    reason: '내 프로필 기준으로 두 정책 모두 신청 조건에 맞지 않아 어느 쪽도 추천하기 어려워요.',
  };
  let chosen = scores[0] > scores[1] ? 0 : scores[1] > scores[0] ? 1 : -1;
  const interest = [input.profile_interest_match.base, input.profile_interest_match.comparison];
  if (chosen === -1 && interest[0] !== interest[1]) chosen = interest[0] ? 0 : 1;
  if (chosen === -1) return {
    policy_id: null,
    reason: '내 프로필의 자격 판정과 관심 분야만으로는 두 정책 중 하나를 더 추천할 근거가 부족해요. 지원 내용과 공식 신청 조건을 비교해 주세요.',
  };
  const selected = policies[chosen];
  const other = policies[1 - chosen];
  const fields = chosen === 0 ? input.profile_conditions.base : input.profile_conditions.comparison;
  const conditionText = fields.length ? `${fields.join('·')} 조건이 확인됐고, ` : '';
  const statusText = selected.eligibility_result === 'ELIGIBLE' ? '신청 가능' : '추가 확인 필요';
  const otherStatus = other.eligibility_result === 'INELIGIBLE' ? '신청 부적합'
    : other.eligibility_result === 'ELIGIBLE' ? '신청 가능' : '추가 확인 필요';
  const basis = scores[chosen] > scores[1 - chosen]
    ? `${conditionText}프로필 기준 자격 판정이 ${selected.title}은 ${statusText}, ${other.title}은 ${otherStatus}이기 때문이에요.`
    : `두 정책의 자격 판정은 같지만 ${selected.title}이 내 프로필의 관심 분야와 일치하기 때문이에요.`;
  return {
    policy_id: selected.policy_id,
    reason: `${selected.title}을 더 추천해요. ${basis}${selected.eligibility_result === 'CHECK' ? ' 신청 자격은 공식 공고에서 추가로 확인해 주세요.' : ''}`,
  };
}

function shortFact(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/^[\s*□※·•-]+/u, '').split(/[\r\n□※*]|;/u)[0]
    .replace(/https?:\/\/\S+/giu, '').replace(/\s+/gu, ' ').trim();
  return cleaned && cleaned.length <= 100 ? cleaned.replace(/[.!?]+$/u, '') : null;
}

function shortTarget(value) {
  const target = shortFact(value);
  return target && target.length <= 60 && !/[,:：·~\d]|소득|자격 조건|신청 조건|이상|이하/u.test(target)
    ? target : null;
}

function narrativePolicy(policy) {
  return {
    policy_id: policy.policy_id, title: policy.title,
    target_summary: shortTarget(policy.target_summary),
    support_summary: shortFact(policy.support_summary) || shortFact(policy.support_content),
    eligibility_result: policy.eligibility_result,
    conditions_verified: policy.conditions_verified,
  };
}

export function comparisonNarrativeInput(input) {
  const a = narrativePolicy(input.policy_a);
  const b = narrativePolicy(input.policy_b);
  const topics = new Set(['지원 대상', '지원 내용', '주요 혜택', '신청 기간', '모집 상태', '신청 방법']);
  return {
    policy_a: a, policy_b: b,
    profile_context: {
      policy_a: { matched_conditions: input.profile_conditions.base,
        interest_category_match: input.profile_interest_match.base },
      policy_b: { matched_conditions: input.profile_conditions.comparison,
        interest_category_match: input.profile_interest_match.comparison },
    },
    verified_common_points: input.verified_common_points.filter((point) =>
      [...topics].some((topic) => point.startsWith(`${topic}: `)) &&
      (point.startsWith('지원 대상: ') ? shortTarget(point.slice(7)) : shortFact(point))),
    verified_differences: input.verified_differences.filter((item) =>
      topics.has(item.topic) &&
      (item.topic === '지원 대상' ? shortTarget(item.policy_a) && shortTarget(item.policy_b)
        : shortFact(item.policy_a) && shortFact(item.policy_b))),
    evidence_ids: input.evidence_ids,
  };
}

// 지원 내용·지원 대상은 비교표에 이미 있어서 차이 목록에서는 뺀다.
const POINT_TOPICS = ['신청 기간', '모집 상태', '신청 방법'];
const RESULT_TEXT = { ELIGIBLE: '신청 가능', CHECK: '확인 필요', INELIGIBLE: '대상 아님' };
const compact = (value, max = 42) => {
  const first = typeof value === 'string' ? value.split(/[\r\n□※*]/u)[0] : '';
  const text = first.replace(/^[\s·•-]+/u, '').replace(/https?:\/\/\S+/giu, '').replace(/\s+/gu, ' ').trim();
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
};

// 표에 이미 있는 값 중 서로 다른 것만 짧게 뽑는다(AI 없이 서버 데이터로 만든다).
export function differencePoints(input) {
  const points = [];
  for (const topic of POINT_TOPICS) {
    const item = input.verified_differences.find((row) => row.topic === topic);
    const a = compact(item?.policy_a);
    const b = compact(item?.policy_b);
    if (a && b && a !== b) points.push({ topic, a, b });
  }
  const ra = input.policy_a.eligibility_result;
  const rb = input.policy_b.eligibility_result;
  if (RESULT_TEXT[ra] && RESULT_TEXT[rb] && ra !== rb)
    points.push({ topic: '내 조건', a: RESULT_TEXT[ra], b: RESULT_TEXT[rb] });
  return points.slice(0, 4);
}

export function fallbackComparisonSummary(input) {
  const a = narrativePolicy(input.policy_a);
  const b = narrativePolicy(input.policy_b);
  const sentences = [];
  if (a.support_summary && a.support_summary === b.support_summary)
    sentences.push(/(?:합니다|입니다|됩니다|있습니다)$/u.test(a.support_summary)
      ? `${a.title}과 ${b.title}은 모두 ${a.support_summary}.`
      : `${a.title}과 ${b.title}의 주요 지원 내용은 모두 ${a.support_summary}입니다.`);
  else if (a.target_summary && a.target_summary === b.target_summary)
    sentences.push(`${a.title}과 ${b.title}은 모두 ${a.target_summary}을 대상으로 합니다.`);
  if (a.target_summary && b.target_summary && a.target_summary !== b.target_summary)
    sentences.push(`${a.title}은 ${a.target_summary}, ${b.title}은 ${b.target_summary}을 지원 대상으로 안내합니다.`);
  if (a.support_summary && b.support_summary && a.support_summary !== b.support_summary) {
    sentences.push(/(?:합니다|입니다|됩니다|있습니다)$/u.test(a.support_summary)
      ? `${a.title}에서는 ${a.support_summary}.`
      : `${a.title}의 주요 지원 내용은 ${a.support_summary}입니다.`);
    sentences.push(/(?:합니다|입니다|됩니다|있습니다)$/u.test(b.support_summary)
      ? `${b.title}에서는 ${b.support_summary}.`
      : `${b.title}의 주요 지원 내용은 ${b.support_summary}입니다.`);
  }
  const status = input.verified_differences.find((row) => row.topic === '모집 상태');
  if (status && compact(status.policy_a) && compact(status.policy_b))
    sentences.push(`모집 상태는 ${a.title}이 ${compact(status.policy_a)}, ${b.title}이 ${compact(status.policy_b)}이에요.`);
  const mine = differencePoints(input).find((row) => row.topic === '내 조건');
  if (mine) sentences.push(`내 조건 기준으로는 ${a.title}이 ${mine.a}, ${b.title}이 ${mine.b} 상태예요.`);
  if (!sentences.length)
    return `${a.title}과 ${b.title}의 핵심 지원 내용을 확인할 정보가 충분하지 않습니다. 지원 대상과 혜택은 각 정책의 공식 공고에서 확인해 주세요.`;
  if (a.eligibility_result === 'CHECK' || b.eligibility_result === 'CHECK')
    sentences.push('신청 자격은 각 정책의 공식 공고에서 추가로 확인해 주세요.');
  return sentences.slice(0, 5).join(' ');
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
    explanation: validExplanation ? aiText(explanation) : '',
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
      [item.topic, item.policy_a, item.policy_b]),
    '모두 공통 차이 다릅니다 대상으로 주요 혜택 지원 내용 확인 공식 공고']);
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
  const summaryText = aiText(raw.summary.replace(/[□※*]/gu, ' ').replace(/\s+/gu, ' '));
  const sentences = summaryText.split(/[.!?]+(?:\s|$)/u).map((item) => item.trim()).filter(Boolean);
  const summary = sentences.length >= 2 && sentences.length <= 4 &&
    new Set(sentences).size === sentences.length && summaryText.length <= 560 &&
    !/(?:분야|세부분류|지원 대상|신청 조건)\s*[:：]|기준 정책|비교 정책|차이가 확인됩니다|공통점이 확인됩니다/u.test(summaryText) &&
    ![input.policy_a, input.policy_b].some((policy) =>
      [policy.target_summary, policy.policy_conditions].some((value) =>
        typeof value === 'string' && value.length > 30 &&
        (!shortTarget(value) || value.length > 100) && summaryText.includes(value.slice(0, 30)))) &&
    groundedAiText(summaryText, grounding) && verdictAndStatusSafe(summaryText, input) &&
    [input.policy_a.title, input.policy_b.title].every((title) => summaryText.includes(title))
    ? summaryText : fallbackComparisonSummary(input);
  const checks = raw.additional_checks.filter((item) => typeof item === 'string' &&
    verified.additionalChecks.includes(item)).map(aiText).slice(0, 6);
  const recommendation = personalizedComparisonRecommendation(input);
  recommendation.ai_confirmed = Boolean(recommendation.policy_id &&
    raw.recommendation?.policy_id === recommendation.policy_id);
  return {
    common_points: [...new Set(common.length ? common : verified.common.slice(0, 4))],
    differences,
    summary,
    difference_points: differencePoints(input),
    recommendation,
    additional_checks: [...new Set(checks.length ? checks : verified.additionalChecks.slice(0, 6))],
  };
}

export async function getAiComparisonSummary(baseId, comparisonId, userId) {
  const result = await getPolicyComparison(baseId, comparisonId, userId);
  const input = comparisonAiInput(result);
  try {
    const raw = await requestStructuredAI({ input: comparisonNarrativeInput(input),
      systemPrompt: `${POLICY_COMPARE_SUMMARY_SYSTEM_PROMPT}\nprofile_context는 저장된 내 프로필로 판정한 조건과 관심 분야 일치 여부입니다. recommendation에는 둘 중 더 추천할 정책의 실제 policy_id와 프로필 조건에 근거한 이유를 적으세요. 근거가 부족하거나 둘 다 부적합하면 policy_id는 null로 두고 이유를 설명하세요. 자격 판정을 변경하거나 확인되지 않은 프로필 값을 추측하지 마세요.`,
      schema: RESPONSE_SCHEMA, name: 'policy_compare_summary', maxOutputTokens: 1300 },
    { userId, timeoutMs: 18000 });
    return { status: 'ok', summary: validateComparisonSummary(raw, input) };
  } catch {
    return { status: 'fallback', summary: { common_points: [], differences: [],
      summary: fallbackComparisonSummary(input), difference_points: differencePoints(input),
      recommendation: personalizedComparisonRecommendation(input), additional_checks: [] } };
  }
}
