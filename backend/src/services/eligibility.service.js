// 저장된 신청 자격과 제외 조건만 비교한다. 검증 여부는 최종 판정에 반영한다.
import { kstDateParts } from './policy-status.service.js';

export const RESULT = { ELIGIBLE: 'ELIGIBLE', CHECK: 'CHECK', INELIGIBLE: 'INELIGIBLE' };
export const CONDITION_STATUS = {
  SATISFIED: 'SATISFIED', UNSATISFIED: 'UNSATISFIED',
  UNKNOWN: 'UNKNOWN', NOT_APPLICABLE: 'NOT_APPLICABLE', HIT: 'HIT', CLEAR: 'CLEAR',
};
const S = CONDITION_STATUS;
function dateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const birth = new Date(Date.UTC(year, month - 1, day));
  return birth.getUTCFullYear() === year && birth.getUTCMonth() === month - 1 &&
    birth.getUTCDate() === day ? { year, month, day } : null;
}
function birthParts(profile) { return dateParts(profile?.birth_date); }

const PROFILE_FIELDS = {
  birth_year: (p) => birthParts(p)?.year ?? null,
  birth_date: (p) => dateParts(p.birth_date) ? p.birth_date : null,
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
  if (typeof actual === 'string' && dateParts(actual)) {
    if (op === 'between' && Array.isArray(expected) && expected.length === 2 &&
      expected.some((value) => value != null) && expected.every((value) => value == null || dateParts(value)) &&
      (expected[0] == null || expected[1] == null || expected[0] <= expected[1]))
      return (expected[0] == null || actual >= expected[0]) && (expected[1] == null || actual <= expected[1]);
    if (['gte', 'lte'].includes(op) && dateParts(expected)) return op === 'gte' ? actual >= expected : actual <= expected;
  }
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
  if (op === 'contains_any' && Array.isArray(actual) && Array.isArray(expected) &&
    actual.length && expected.length && actual.every((value) => typeof value === 'string') &&
    expected.every((value) => typeof value === 'string'))
    return actual.some((value) => expected.includes(value));
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
    return expected === 'KR' || actual.startsWith(expected);
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

function hasAgeRule(nodes) {
  return nodes.some((node) => node && typeof node === 'object' &&
    (node.field === 'age' || node.field === 'birth_year' || ['all', 'any', 'conditions'].some((key) =>
      Array.isArray(node[key]) && hasAgeRule(node[key])) ||
      (node.condition && typeof node.condition === 'object' && hasAgeRule([node.condition]))));
}

function judgeCondition(node, profile, context, path) {
  const evidence = { source: path, source_url: context.sourceUrl };
  if (!node || typeof node !== 'object' || Array.isArray(node) || path.split('.').length > 25)
    return { status: S.UNKNOWN, reason: '정책 조건 형식을 확인할 수 없습니다.', evidence };
  if (node.applicable === false || node.status === S.NOT_APPLICABLE)
    return { ...node, status: S.UNKNOWN, reason: '조건 적용 여부를 확인해야 합니다.', evidence };

  const group = childrenOf(node);
  if (group) {
    const children = group.nodes.map((child, index) =>
      judgeCondition(child, profile, context, `${path}.${group.key}[${index}]`));
    const combined = combine(children.map((item) => item.status), group.kind);
    const status = combined === S.UNSATISFIED && node.exception_note ? S.UNKNOWN : combined;
    return { ...node, status, children, reason: status === S.UNKNOWN
      ? '일부 조건을 확인할 수 없습니다.' : '하위 조건을 비교했습니다.', evidence };
  }

  const op = String(node.op ?? node.operator ?? '').toLowerCase();
  // 개별 조건이 검토 전이라고 표시돼 있으면 정책 전체와 별개로 이 조건만 확인 필요로 둔다.
  if (node.verified === false || node.needs_review === true)
    return { ...node, status: S.UNKNOWN, reason: '이 조건은 공식 공고 확인이 필요합니다.', evidence };
  // NOT: 충족/미충족을 뒤집고, 확인 필요는 그대로 둔다.
  if (op === 'not') {
    const inner = node.condition ?? (Array.isArray(node.conditions) && node.conditions.length === 1 ? node.conditions[0] : null);
    if (!inner) return { ...node, status: S.UNKNOWN, reason: '자동 판정할 수 없는 정책 조건입니다.', evidence };
    const child = judgeCondition(inner, profile, context, `${path}.condition`);
    const status = child.status === S.SATISFIED ? S.UNSATISFIED : child.status === S.UNSATISFIED ? S.SATISFIED : S.UNKNOWN;
    return { ...node, status, children: [child], reason: status === S.UNKNOWN
      ? '일부 조건을 확인할 수 없습니다.' : '하위 조건을 비교했습니다.', evidence };
  }
  if (['raw', 'manual_review'].includes(op))
    return { ...node, status: S.UNKNOWN, reason: '자동 판정할 수 없는 정책 조건입니다.', evidence };
  // 다른 가족 구성원이나 신청일 기준 조건을 현재 사용자 값으로 대체하지 않는다.
  if ((node.subject && !['applicant', 'user'].includes(node.subject)) ||
    (node.anchor && !['today', 'current_date'].includes(node.anchor) && !dateParts(node.anchor)))
    return { ...node, status: S.UNKNOWN, reason: '신청 시점 또는 대상자의 추가 확인이 필요합니다.', evidence };
  // 공고일·기준일처럼 고정된 날짜가 기준인 경우만 확인 필요로 둔다. 신청 시점 기준은 오늘 날짜로 계산한다.
  if (node.field === 'age' && !node.anchor &&
    /(?:공고일|기준일|모집일|선발일|\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일)\s*(?:현재|기준)/u.test(`${node.text ?? ''} ${node.original_text ?? ''}`))
    return { ...node, status: S.UNKNOWN, reason: '연령 기준일을 확인해야 합니다.', evidence };
  if (!(node.field === 'age' || Object.hasOwn(PROFILE_FIELDS, node.field)) ||
    !['eq', 'in', 'between', 'gte', 'lte', 'contains', 'contains_any', 'starts_with'].includes(op))
    return { ...node, status: S.UNKNOWN, reason: '자동 판정할 수 없는 정책 조건입니다.', evidence };

  if (['region', 'region_code'].includes(node.field) &&
    (!['eq', 'in', 'starts_with'].includes(op) ||
      ![node.value].flat().every((value) => typeof value === 'string' && /^(KR|\d{2,5})$/u.test(value))))
    return { ...node, status: S.UNKNOWN, reason: '정책 지역 형식을 확인할 수 없습니다.', evidence };

  const referenceDate = node.field === 'age' && dateParts(node.anchor)
    ? new Date(`${node.anchor}T12:00:00+09:00`) : context.now;
  const actual = profile ? profileValue(node.field, profile, referenceDate) : null;
  if (actual == null || actual === '' || (Array.isArray(actual) && actual.length === 0))
    return { ...node, status: S.UNKNOWN, reason: '사용자 정보가 없어 확인할 수 없습니다.',
      evidence: { ...evidence, policy_value: node.value } };
  const matched = ['region', 'region_code'].includes(node.field)
    ? compareRegion(op, actual, node.value) : compare(op, actual, node.value);
  if (matched == null)
    return { ...node, status: S.UNKNOWN, reason: '정책 조건의 값 또는 형식을 확인할 수 없습니다.', evidence };
  if (!matched && node.exception_note)
    return { ...node, status: S.UNKNOWN, reason: '기본 조건은 충족하지 않지만 예외 적용 여부를 확인해야 합니다.', evidence };
  return { ...node, status: matched ? S.SATISFIED : S.UNSATISFIED,
    reason: matched ? '저장된 정책 조건을 충족합니다.' : '저장된 정책 조건을 충족하지 않습니다.',
    evidence: { ...evidence, policy_value: node.value,
      ...(!PRIVATE_VALUES.has(node.field) ? { profile_value: actual } : {}) } };
}

function judgeExclusion(node, profile, context, path) {
  // Legacy NOT wrappers already mean "excluded if inner condition matches".
  const condition = node?.operator === 'NOT' && node.condition ? node.condition : node;
  const group = childrenOf(condition);
  if (group) {
    const children = group.nodes.map((child, index) =>
      judgeExclusion(child, profile, context, `${path}.${group.key}[${index}]`));
    const combined = combine(children.map((child) => child.status === S.HIT ? S.SATISFIED
      : child.status === S.CLEAR ? S.UNSATISFIED : S.UNKNOWN), group.kind);
    const status = combined === S.SATISFIED ? condition.exception_note ? S.UNKNOWN : S.HIT
      : combined === S.UNSATISFIED ? S.CLEAR : S.UNKNOWN;
    return { ...condition, exclusion: true, children, status,
      reason: status === S.UNKNOWN ? '일부 제외 사항을 확인할 수 없습니다.'
        : status === S.HIT ? '정책의 제외 조건에 해당합니다.' : '정책의 제외 조건에 해당하지 않습니다.',
      evidence: { source: path, source_url: context.sourceUrl } };
  }
  const checked = judgeCondition(condition, profile, context, path);
  const exception = condition?.exception_note || node?.exception_note;
  const status = checked.status === S.SATISFIED
    ? exception ? S.UNKNOWN : S.HIT
    : checked.status === S.UNSATISFIED ? S.CLEAR : S.UNKNOWN;
  return { ...checked, exclusion: true, status, reason: exception && checked.status === S.SATISFIED
    ? '제외 조건에 해당하지만 예외 적용 여부를 확인해야 합니다.'
    : status === S.HIT ? '정책의 제외 조건에 해당합니다.'
      : status === S.CLEAR ? '정책의 제외 조건에 해당하지 않습니다.' : checked.reason };
}

export function judge(policy, profile, now = new Date()) {
  const stored = policy.eligibility_conditions;
  const verified = policy.eligibility_verified === true &&
    stored?.logic !== 'UNVERIFIED' && !['확인필요', 'UNVERIFIED'].includes(String(stored?.verification ?? '').replace(/\s+/gu, '')) &&
    stored?.engine_projection?.automatic_eligibility_ready !== false;
  const context = { sourceUrl: stored?.source_url ?? policy.official_url ?? policy.source_url ?? null, now };
  const requiredKey = stored && Object.hasOwn(stored, 'required') ? 'required' : 'all';
  const required = Array.isArray(stored?.[requiredKey]) ? stored[requiredKey] : [];
  const excludedKey = stored && Object.hasOwn(stored, 'exclusions') ? 'exclusions' : 'exclude';
  const excluded = Array.isArray(stored?.[excludedKey]) ? stored[excludedKey] : [];
  const conditions = required.map((node, index) =>
    judgeCondition(node, profile, context, `policy.eligibility_conditions.${requiredKey}[${index}]`));
  if (!verified && (policy.min_age != null || policy.max_age != null) && !hasAgeRule(required))
    conditions.push({ field: 'age', status: S.UNKNOWN,
      text: `만 ${policy.min_age ?? ''}${policy.max_age != null || policy.min_age != null ? '~' : ''}${policy.max_age ?? ''}세`,
      reason: '나이 조건이 검증되지 않아 확인이 필요합니다.',
      evidence: { source: 'policy.min_age,policy.max_age', source_url: context.sourceUrl,
        policy_value: [policy.min_age ?? null, policy.max_age ?? null] } });
  if (typeof policy.income_condition === 'string' && policy.income_condition.trim())
    conditions.push({ field: 'income', text: policy.income_condition.trim(), status: S.UNKNOWN,
      reason: '소득 조건 원문은 자동 판정하지 않습니다.',
      evidence: { source: 'policy.income_condition', source_url: context.sourceUrl } });
  const requiredCount = conditions.length;
  conditions.push(...excluded.map((node, index) =>
    judgeExclusion(node, profile, context, `policy.eligibility_conditions.${excludedKey}[${index}]`)));

  const baseRequiredStatus = combine(conditions.slice(0, required.length).map((item) => item.status),
    stored?.logic === 'OR' ? 'OR' : 'AND');
  const requiredStatus = combine([baseRequiredStatus,
    ...conditions.slice(required.length, requiredCount).map((item) => item.status)], 'AND');
  const exclusionStatuses = conditions.slice(requiredCount).map((item) => item.status);
  const validShape = Array.isArray(stored?.[requiredKey]) &&
    (stored?.[excludedKey] == null || Array.isArray(stored[excludedKey])) &&
    (stored?.logic == null || ['AND', 'OR', 'UNVERIFIED'].includes(stored.logic));
  const result = !verified || !validShape || !required.length ? RESULT.CHECK
    : requiredStatus === S.UNSATISFIED || exclusionStatuses.includes(S.HIT) ? RESULT.INELIGIBLE
      : requiredStatus === S.SATISFIED && exclusionStatuses.every((status) => status === S.CLEAR)
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
        : result === RESULT.INELIGIBLE ? '확인된 신청 자격 또는 제외 사항에 해당합니다.'
          : '확인된 필수 조건을 모두 충족합니다.';
  // 정책 전체 검증 여부와 개별 조건 판정은 따로 내려준다.
  return { result, reason, conditions, policy_verified: verified,
    profile_missing: !profile, missing_profile_fields: [...missingProfileFields] };
}
