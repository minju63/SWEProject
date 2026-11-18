// 저장된 필수 조건만 판정한다. 원문 및 검증되지 않은 규칙은 자동 판정하지 않는다.
import { kstDateParts } from './policy-status.service.js';

export const RESULT = { ELIGIBLE: 'ELIGIBLE', CHECK: 'CHECK', INELIGIBLE: 'INELIGIBLE' };
export const CONDITION_STATUS = {
  SATISFIED: 'SATISFIED', UNSATISFIED: 'UNSATISFIED',
  UNKNOWN: 'UNKNOWN', NOT_APPLICABLE: 'NOT_APPLICABLE',
};
const S = CONDITION_STATUS;
function birthParts(profile) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(profile?.birth_date ?? '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const birth = new Date(Date.UTC(year, month - 1, day));
  return birth.getUTCFullYear() === year && birth.getUTCMonth() === month - 1 &&
    birth.getUTCDate() === day ? { year, month, day } : null;
}

const PROFILE_FIELDS = {
  birth_year: (p) => birthParts(p)?.year ?? null,
  region: (p) => p.region_code,
  region_code: (p) => p.region_code,
  residence_months: (p) => p.residence_months,
  final_education: (p) => p.final_education,
  current_status: (p) => p.current_status,
  housing_type: (p) => p.housing_type,
  household_type: (p) => p.household_type,
  lives_separately: (p) => p.lives_separately,
  marital_status: (p) => p.marital_status,
  home_ownership: (p) => p.home_ownership,
  household_role: (p) => p.household_role,
  housing_benefit_status: (p) => p.housing_benefit_status,
  special_targets: (p) => p.special_targets,
};
const PRIVATE_VALUES = new Set(['marital_status', 'housing_benefit_status', 'special_targets']);

function ageFrom(profile, now) {
  if (Number.isInteger(profile?.age) && profile.age >= 0 && profile.age <= 120) return profile.age;
  const parts = birthParts(profile);
  if (!parts) return null;
  const { year, month, day } = parts;
  const today = kstDateParts(now);
  let age = today.year - year;
  if (today.month < month || (today.month === month && today.day < day)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function profileValue(field, profile, now) {
  if (field === 'age') return ageFrom(profile, now);
  return PROFILE_FIELDS[field]?.(profile) ?? null;
}

function compare(op, actual, expected) {
  if (expected == null) return null;
  if (Array.isArray(expected) && expected.length === 0) return null;
  if (op === 'between' && Array.isArray(expected) && expected.every((value) => value == null)) return null;
  if (op === 'starts_with' && expected === '') return null;
  if (op === 'eq' && (Array.isArray(expected) || typeof expected === 'object')) return null;
  if (op === 'eq') return Array.isArray(actual)
    ? actual.every((value) => typeof value === typeof expected) ? actual.includes(expected) : null
    : typeof actual === typeof expected ? actual === expected : null;
  if (op === 'in' && Array.isArray(expected)) return Array.isArray(actual)
    ? actual.every((value) => expected.every((candidate) => typeof candidate === typeof value))
      ? actual.some((value) => expected.includes(value)) : null
    : expected.every((value) => typeof value === typeof actual) ? expected.includes(actual) : null;
  if (op === 'between' && typeof actual === 'number' && Array.isArray(expected) && expected.length === 2 &&
    expected.every((value) => value == null || typeof value === 'number'))
    return (expected[0] == null || actual >= expected[0]) && (expected[1] == null || actual <= expected[1]);
  if (op === 'gte' && typeof actual === 'number' && typeof expected === 'number') return actual >= expected;
  if (op === 'lte' && typeof actual === 'number' && typeof expected === 'number') return actual <= expected;
  if (op === 'contains' && Array.isArray(actual)) return actual.every((value) => typeof value === typeof expected)
    ? actual.includes(expected) : null;
  if (op === 'starts_with' && typeof actual === 'string' && typeof expected === 'string')
    return actual.startsWith(expected);
  return null;
}

function compareRegion(op, actual, expected) {
  if (typeof actual !== 'string' || !/^(KR|\d{2,5})$/u.test(actual)) return null;
  if (actual === 'KR' && (op === 'in' ? !expected.includes('KR') : expected !== 'KR')) return null;
  const matches = (code) => code === 'KR' || actual === code ||
    (code.length === 2 && actual.startsWith(code));
  if (op === 'eq') return expected === 'KR' || actual === expected;
  if (op === 'starts_with') {
    if (actual.length === 2 && expected.length > 2 && actual.startsWith(expected.slice(0, 2))) return null;
    return matches(expected);
  }
  if (op === 'in') {
    if (expected.some(matches)) return true;
    if (actual.length === 2 && expected.some((code) => code.startsWith(actual))) return null;
    return false;
  }
  return null;
}

function combine(statuses, kind) {
  if (statuses.length === 0) return S.UNKNOWN;
  if (kind === 'OR') {
    if (statuses.includes(S.SATISFIED)) return S.SATISFIED;
    if (statuses.includes(S.UNKNOWN)) return S.UNKNOWN;
    if (statuses.includes(S.UNSATISFIED)) return S.UNSATISFIED;
    return S.NOT_APPLICABLE;
  }
  if (statuses.includes(S.UNSATISFIED)) return S.UNSATISFIED;
  if (statuses.includes(S.UNKNOWN)) return S.UNKNOWN;
  if (statuses.includes(S.SATISFIED)) return S.SATISFIED;
  return S.UNKNOWN;
}

function childrenOf(node) {
  if (Array.isArray(node?.any)) return { kind: 'OR', key: 'any', nodes: node.any };
  if (Array.isArray(node?.all)) return { kind: 'AND', key: 'all', nodes: node.all };
  const op = String(node?.op ?? node?.operator ?? '').toUpperCase();
  if (['AND', 'OR'].includes(op) && Array.isArray(node.conditions))
    return { kind: op, key: 'conditions', nodes: node.conditions };
  return null;
}

function judgeCondition(node, profile, context, path) {
  const evidence = { source: path, source_url: context.sourceUrl };
  if (!node || typeof node !== 'object')
    return { status: S.UNKNOWN, reason: '정책 조건 형식을 확인할 수 없습니다.', evidence };
  if (node.applicable === false || node.status === S.NOT_APPLICABLE)
    return { ...node, status: S.NOT_APPLICABLE, reason: '해당하지 않는 조건입니다.', evidence };

  const group = childrenOf(node);
  if (group) {
    const children = group.nodes.map((child, index) =>
      judgeCondition(child, profile, context, `${path}.${group.key}[${index}]`));
    const status = context.verified ? combine(children.map((item) => item.status), group.kind) : S.UNKNOWN;
    return { ...node, status, children, reason: !context.verified ? '정책 신청 조건이 검증되지 않았습니다.'
      : status === S.UNKNOWN ? '일부 조건을 확인할 수 없습니다.' : '하위 조건을 비교했습니다.', evidence };
  }
  if (!context.verified)
    return { ...node, status: S.UNKNOWN, reason: '정책 신청 조건이 검증되지 않았습니다.', evidence };

  const op = String(node.op ?? node.operator ?? '').toLowerCase();
  // 다른 가족 구성원이나 신청일 기준 조건을 현재 사용자 값으로 대체하지 않는다.
  if ((node.subject && !['applicant', 'user'].includes(node.subject)) ||
    (node.anchor && !['today', 'current_date'].includes(node.anchor)))
    return { ...node, status: S.UNKNOWN, reason: '신청 시점 또는 대상자의 추가 확인이 필요합니다.', evidence };
  if (!(node.field === 'age' || Object.hasOwn(PROFILE_FIELDS, node.field)) ||
    !['eq', 'in', 'between', 'gte', 'lte', 'contains', 'starts_with'].includes(op))
    return { ...node, status: S.UNKNOWN, reason: '자동 판정할 수 없는 정책 조건입니다.', evidence };

  if (['region', 'region_code'].includes(node.field) &&
    (!['eq', 'in', 'starts_with'].includes(op) ||
      ![node.value].flat().every((value) => typeof value === 'string' && /^(KR|\d{2,5})$/u.test(value))))
    return { ...node, status: S.UNKNOWN, reason: '정책 지역 형식을 확인할 수 없습니다.', evidence };

  const actual = profile ? profileValue(node.field, profile, context.now) : null;
  if (actual == null || actual === '' || (Array.isArray(actual) && actual.length === 0))
    return { ...node, status: S.UNKNOWN, reason: '사용자 정보가 없어 확인할 수 없습니다.',
      evidence: { ...evidence, policy_value: node.value } };
  const matched = ['region', 'region_code'].includes(node.field)
    ? compareRegion(op, actual, node.value) : compare(op, actual, node.value);
  if (matched == null)
    return { ...node, status: S.UNKNOWN, reason: '정책 조건의 값 또는 형식을 확인할 수 없습니다.', evidence };
  return { ...node, status: matched ? S.SATISFIED : S.UNSATISFIED,
    reason: matched ? '저장된 정책 조건을 충족합니다.' : '저장된 정책 조건을 충족하지 않습니다.',
    evidence: { ...evidence, policy_value: node.value,
      ...(!PRIVATE_VALUES.has(node.field) ? { profile_value: actual } : {}) } };
}

function judgeExclusion(node, profile, context, path) {
  const condition = node?.operator === 'NOT' && node.condition ? node.condition : node;
  const checked = judgeCondition(condition, profile, context, path);
  const status = checked.status === S.SATISFIED ? S.UNSATISFIED
    : checked.status === S.UNSATISFIED ? S.NOT_APPLICABLE : checked.status;
  return { ...checked, status, reason: status === S.UNSATISFIED ? '정책의 제외 조건에 해당합니다.'
    : status === S.NOT_APPLICABLE ? '정책의 제외 조건에 해당하지 않습니다.' : checked.reason };
}

function hasAgeRule(nodes) {
  return nodes.some((node) => node && typeof node === 'object' &&
    (node.field === 'age' || ['all', 'any', 'conditions'].some((key) =>
      Array.isArray(node[key]) && hasAgeRule(node[key]))));
}

export function judge(policy, profile, now = new Date()) {
  const stored = policy.eligibility_conditions;
  const verified = policy.eligibility_verified === true &&
    stored?.logic !== 'UNVERIFIED' && !['확인필요', 'UNVERIFIED'].includes(stored?.verification) &&
    stored?.engine_projection?.automatic_eligibility_ready !== false;
  const context = { verified, sourceUrl: stored?.source_url ?? policy.official_url ?? policy.source_url ?? null, now };
  // 수집 데이터의 all은 짧은 안내 문구일 수 있다. 상세 required가 있으면 이를 우선한다.
  const requiredKey = Array.isArray(stored?.required) && stored.required.length ? 'required' : 'all';
  const required = Array.isArray(stored?.[requiredKey]) ? stored[requiredKey] : [];
  const excludedKey = requiredKey === 'required' && Array.isArray(stored?.exclusions)
    ? 'exclusions' : 'exclude';
  const excluded = Array.isArray(stored?.[excludedKey]) ? stored[excludedKey] : [];
  const conditions = required.map((node, index) =>
    judgeCondition(node, profile, context, `policy.eligibility_conditions.${requiredKey}[${index}]`));
  conditions.push(...excluded.map((node, index) =>
    judgeExclusion(node, profile, context, `policy.eligibility_conditions.${excludedKey}[${index}]`)));

  if (!verified && (policy.min_age != null || policy.max_age != null) &&
    !hasAgeRule(required))
    conditions.push({ field: 'age', status: S.UNKNOWN,
      reason: '나이 조건이 검증되지 않아 확인이 필요합니다.',
      evidence: { source: 'policy.min_age,policy.max_age', source_url: context.sourceUrl,
        policy_value: [policy.min_age ?? null, policy.max_age ?? null] } });
  if (typeof policy.income_condition === 'string' && policy.income_condition.trim())
    conditions.push({ field: 'income', text: policy.income_condition.trim(), status: S.UNKNOWN,
      reason: '소득 조건 원문은 자동 판정하지 않습니다.',
      evidence: { source: 'policy.income_condition', source_url: context.sourceUrl } });

  const statuses = conditions.map((item) => item.status);
  const result = !verified || required.length === 0 ? RESULT.CHECK
    : statuses.includes(S.UNSATISFIED) ? RESULT.INELIGIBLE
      : required.some((_, index) => conditions[index].status === S.SATISFIED) &&
        required.every((_, index) => [S.SATISFIED, S.NOT_APPLICABLE].includes(conditions[index].status)) &&
        excluded.every((_, index) => conditions[required.length + index].status === S.NOT_APPLICABLE) &&
        !conditions.some((item) => item.field === 'income' && item.status === S.UNKNOWN)
        ? RESULT.ELIGIBLE : RESULT.CHECK;
  const missingProfileFields = new Set();
  const collectMissing = (item) => {
    if (item.reason === '사용자 정보가 없어 확인할 수 없습니다.' && item.field)
      missingProfileFields.add(item.field);
    item.children?.forEach(collectMissing);
  };
  conditions.forEach(collectMissing);
  const reason = !required.length ? '저장된 신청 자격 정보가 없어 공식 공고 확인이 필요합니다.'
    : !verified ? '신청 자격 정보가 검증되지 않아 공식 공고 확인이 필요합니다.'
      : result === RESULT.CHECK ? '정책 조건 또는 사용자 정보를 추가로 확인해야 합니다.'
        : result === RESULT.INELIGIBLE ? '확인된 필수 조건을 충족하지 않습니다.'
          : '확인된 필수 조건을 모두 충족합니다.';
  return { result, reason, conditions,
    profile_missing: !profile, missing_profile_fields: [...missingProfileFields] };
}
