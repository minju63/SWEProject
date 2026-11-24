import { getEligibility, getPolicy } from './policy.service.js';
import { POLICY_FOLLOWUP_SYSTEM_PROMPT } from '../prompts/policy-followup.prompt.js';
import { groundedAiText as grounded, verdictConsistent, requestStructuredAI } from './ai-common.service.js';
import { explanationInput } from './policy-explanation.service.js';

export const FOLLOWUP_KINDS = ['detail', 'reason'];
const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { answer: { type: 'string' } }, required: ['answer'],
};
const FIELD_NAMES = {
  age: '나이', region: '거주 지역', region_code: '거주 지역', residence_months: '거주 기간',
  final_education: '학력', current_status: '현재 상태', housing_type: '주거 형태',
  household_type: '가구 형태', marital_status: '혼인 여부', home_ownership: '주택 소유',
  household_role: '가구 내 지위', housing_benefit_status: '주거급여', special_targets: '특별 대상',
  lives_separately: '독립 거주', birth_date: '생년월일', income: '소득',
};

const clean = (value, max = 500) => typeof value === 'string'
  ? value.replace(/https?:\/\/\S+/giu, ' ').replace(/[□■▪●○※]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, max) : '';

function period(policy) {
  if (policy.is_always_open) return '상시 모집';
  const { application_start_date: from, application_end_date: to } = policy;
  return from || to ? `${from ?? '시작일 미정'} ~ ${to ?? '종료일 미정'}` : '';
}

// 내 정보로 비교한 조건 이름과 판정(실제 값은 넘기지 않는다).
function myConditions(conditions) {
  const rows = [];
  const visit = (item) => {
    if (item.exclusion) return;
    if (item.children?.length) return item.children.forEach(visit);
    const name = FIELD_NAMES[item.field];
    if (name && ['SATISFIED', 'UNSATISFIED'].includes(item.status) &&
      !rows.some((row) => row.name === name)) rows.push({ name, status: item.status });
  };
  conditions.forEach(visit);
  return rows.slice(0, 6);
}

function pendingLabels(conditions) {
  const labels = [];
  const visit = (item) => {
    if (item.children?.length) return item.children.forEach(visit);
    if (item.status !== 'UNKNOWN') return;
    const label = clean(item.text, 80) || FIELD_NAMES[item.field];
    if (label && !labels.includes(label)) labels.push(label);
  };
  conditions.forEach(visit);
  return labels.slice(0, 6);
}

export function followupInput(policy, eligibility, kind) {
  const base = explanationInput(policy, eligibility);
  const extra = kind === 'detail'
    ? { detail: { target: clean(policy.target_summary), support: clean(policy.support_content || policy.support_summary, 600),
      period: period(policy), method: clean(policy.application_method, 200) } }
    : { reason: { pending_conditions: pendingLabels(eligibility.conditions),
      missing_profile: [...new Set(eligibility.missing_profile_fields.map((f) => FIELD_NAMES[f]).filter(Boolean))] } };
  const mine = myConditions(eligibility.conditions);
  const values = [...Object.values(Object.values(extra)[0]).flat().filter(Boolean), ...mine.map((row) => row.name)];
  return { ...base, kind, ...extra, my_conditions: mine, facts: [...base.facts, ...values] };
}

export function fallbackFollowup(input, kind) {
  if (kind === 'detail') {
    const d = input.detail;
    const end = (text) => text.replace(/[.!?。\s]+$/u, '');
    return [d.target && `신청 대상은 ${end(d.target)}입니다.`, d.support && `지원 내용은 ${end(d.support)}.`,
      d.period && `신청 기간은 ${d.period}입니다.`].filter(Boolean).join(' ')
      || '자세한 내용은 공식 공고에서 확인해 주세요.';
  }
  const r = input.reason;
  const parts = [];
  const met = input.my_conditions.filter((row) => row.status === 'SATISFIED').map((row) => row.name);
  if (met.length) parts.push(`내 정보 기준으로 ${met.join(', ')} 조건은 충족해요.`);
  if (!input.policy.policy_conditions_verified) parts.push('이 정책은 신청 자격 정보를 아직 검증하지 못해 공식 공고 확인이 필요해요.');
  if (r.pending_conditions.length) parts.push(`확인이 필요한 조건은 ${r.pending_conditions.join(', ')}이에요.`);
  if (r.missing_profile.length) parts.push(`내 정보에서 ${r.missing_profile.join(', ')}을 입력하면 더 정확해져요.`);
  return parts.join(' ') || '지금 추가로 확인이 필요한 조건은 없어요.';
}

export async function getPolicyFollowup(policyId, userId, kind, { request = requestStructuredAI } = {}) {
  const [policy, eligibility] = await Promise.all([getPolicy(policyId, userId), getEligibility(policyId, userId)]);
  const input = followupInput(policy, eligibility, kind);
  try {
    const raw = await request({ input, systemPrompt: POLICY_FOLLOWUP_SYSTEM_PROMPT, schema: SCHEMA,
      name: 'policy_followup', maxOutputTokens: 500 }, { userId });
    const answer = clean(raw?.answer, 600);
    if (answer && grounded(answer, input) && verdictConsistent(answer, eligibility.result))
      return { status: 'ok', kind, answer };
  } catch { /* AI 실패 시 서버 데이터로 만든 답을 쓴다 */ }
  return { status: 'fallback', kind, answer: fallbackFollowup(input, kind) };
}
