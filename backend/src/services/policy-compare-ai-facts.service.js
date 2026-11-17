import { aiText } from './ai-common.service.js';

const TOPICS = [
  ['분야', (p) => p.category_name],
  ['세부분류', (p) => p.subcategories?.length ? p.subcategories.join(' · ') : null],
  ['지원 대상', (p) => p.target_summary],
  ['지원 내용', (p) => p.support_summary || p.support_content],
  ['주요 혜택', (p) => p.benefit_type],
  ['신청 조건', (p) => p.policy_conditions ?? verifiedConditions(p)],
  ['신청 기간', (p) => p.is_always_open ? '상시' :
    p.application_start_date && p.application_end_date
      ? `${p.application_start_date} ~ ${p.application_end_date}` : null],
  ['모집 상태', (p) => p.recruitment_status],
  ['신청 방법', (p) => p.application_method],
  ['지원 지역', (p) => p.regions?.length ? p.regions.join(' · ') : null],
];

function verifiedConditions(policy) {
  if (policy.eligibility_verified !== true) return null;
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object' || found.length >= 8) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node.text === 'string' && node.text.trim()) found.push(aiText(node.text));
    else if (node.field && node.value != null) found.push(`${node.field}: ${JSON.stringify(node.value)}`);
    for (const key of ['all', 'any', 'required', 'conditions', 'exclude', 'exclusions']) visit(node[key]);
  };
  visit(policy.eligibility_conditions?.all);
  visit(policy.eligibility_conditions?.required);
  visit(policy.eligibility_conditions?.exclude);
  visit(policy.eligibility_conditions?.exclusions);
  if (!found.length && (policy.min_age != null || policy.max_age != null))
    found.push(`만 ${policy.min_age ?? '제한 없음'}~${policy.max_age ?? '제한 없음'}세`);
  if (policy.income_condition) found.push(`소득: ${aiText(policy.income_condition)}`);
  return found.length ? [...new Set(found)].join(' · ').slice(0, 600) : null;
}

export function aiPolicyFacts(policy, eligibilityResult = null) {
  return {
    policy_id: policy.policy_id, title: policy.title,
    category_name: policy.category_name ?? null,
    subcategories: policy.subcategories ?? [],
    target_summary: policy.target_summary ?? null,
    support_summary: policy.support_summary ?? null,
    support_content: policy.support_content ? aiText(policy.support_content) : null,
    benefit_type: policy.benefit_type ?? null,
    application_start_date: policy.application_start_date ?? null,
    application_end_date: policy.application_end_date ?? null,
    is_always_open: policy.is_always_open === true,
    application_method: policy.application_method ?? null,
    recruitment_status: policy.recruitment_status ?? null,
    regions: policy.regions ?? [],
    conditions_verified: policy.eligibility_verified === true,
    policy_conditions: verifiedConditions(policy),
    eligibility_result: eligibilityResult,
    official_url: policy.official_url ?? null,
    source_url: policy.source_url ?? null,
    source_id: policy.source_id ?? null,
  };
}

export function verifiedComparison(base, comparison) {
  const common = [];
  const differences = [];
  const additionalChecks = [];
  for (const [topic, valueOf] of TOPICS) {
    const a = valueOf(base);
    const b = valueOf(comparison);
    if (!a || !b) {
      additionalChecks.push(`${topic}: ${!a && !b ? '두 정책 모두' : !a ? '기준 정책' : '비교 정책'} 확인 필요`);
      continue;
    }
    const valueA = aiText(String(a));
    const valueB = aiText(String(b));
    if (String(a) !== String(b) && valueA === valueB) {
      additionalChecks.push(`${topic}: 전체 내용 확인 필요`);
      continue;
    }
    if (valueA === valueB) common.push(`${topic}: ${valueA}`);
    else differences.push({ topic, policy_a: valueA, policy_b: valueB });
  }
  if (base.eligibility_result === 'CHECK') additionalChecks.push('기준 정책: 신청 자격 추가 확인 필요');
  if (comparison.eligibility_result === 'CHECK') additionalChecks.push('비교 정책: 신청 자격 추가 확인 필요');
  return { common, differences, additionalChecks };
}

export function comparisonGroundingInput(base, comparison, extraFacts = []) {
  const fields = [base, comparison].flatMap((p) => [p.title, p.category_name,
    ...(p.subcategories ?? []), p.target_summary, p.support_summary, p.support_content,
    p.benefit_type, p.application_method, p.policy_conditions, ...(p.regions ?? []),
    p.recruitment_status]);
  return {
    policy_titles: [base.title, comparison.title],
    evidence_ids: [base.policy_id, comparison.policy_id, base.source_id, comparison.source_id].filter(Boolean),
    facts: [...fields, ...extraFacts].filter(Boolean),
    dates: [base.application_start_date, base.application_end_date,
      comparison.application_start_date, comparison.application_end_date].filter(Boolean),
  };
}
