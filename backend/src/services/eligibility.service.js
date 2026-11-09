// 신청 자격 판정 (규칙 기반, AI 사용 안 함)
//
// 조건 하나하나를 SATISFIED / UNSATISFIED / UNKNOWN 으로 판정한 뒤 합친다.
//   - 하나라도 UNSATISFIED → INELIGIBLE (대상 아님)
//   - UNSATISFIED 없이 UNKNOWN 이 있으면 → CHECK (확인 필요)
//   - 모두 SATISFIED → ELIGIBLE (신청 가능)
// 정책 조건이 검증되지 않았거나(eligibility_verified = false) 비어 있으면 CHECK.
//
// policy.eligibility_conditions 형식
// {
//   "all": [ 조건 | { "any": [조건, ...] } ],
//   "exclude": [ { "text": "기존 수혜자 제외" } ]   // 문장형 제외 조건은 UNKNOWN 처리
// }
// 조건 = { "field": "age", "op": "between", "value": [19, 34] }
//        field 는 아래 PROFILE_FIELDS 키, op 는 OPERATORS 키

export const RESULT = { ELIGIBLE: 'ELIGIBLE', CHECK: 'CHECK', INELIGIBLE: 'INELIGIBLE' };
const S = { OK: 'SATISFIED', NO: 'UNSATISFIED', UNKNOWN: 'UNKNOWN' };

function ageFrom(birthDate, today = new Date()) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  let age = today.getFullYear() - b.getFullYear();
  const beforeBirthday =
    today.getMonth() < b.getMonth() ||
    (today.getMonth() === b.getMonth() && today.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// 조건 field 이름 → 사용자 프로필 값
const PROFILE_FIELDS = {
  age: (p) => ageFrom(p.birth_date),
  region: (p) => p.region_code,
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

const OPERATORS = {
  eq: (v, x) => v === x,
  in: (v, xs) => xs.includes(v),
  between: (v, [min, max]) => (min == null || v >= min) && (max == null || v <= max),
  gte: (v, x) => v >= x,
  lte: (v, x) => v <= x,
  contains: (arr, x) => Array.isArray(arr) && arr.includes(x),
};

function judgeCondition(cond, profile) {
  if (cond.any) {
    const results = cond.any.map((c) => judgeCondition(c, profile));
    if (results.some((r) => r.status === S.OK)) return { status: S.OK, children: results };
    if (results.some((r) => r.status === S.UNKNOWN))
      return { status: S.UNKNOWN, children: results };
    return { status: S.NO, children: results };
  }

  const getValue = PROFILE_FIELDS[cond.field];
  const operator = OPERATORS[cond.op];
  if (!getValue || !operator) return { ...cond, status: S.UNKNOWN, reason: '판정할 수 없는 조건' };

  const value = profile ? getValue(profile) : null;
  const empty = value == null || (Array.isArray(value) && value.length === 0);
  // contains 는 "해당 특화대상이 아님"도 판정할 수 있지만, 입력하지 않았으면 확인 필요
  if (empty) return { ...cond, status: S.UNKNOWN, reason: '사용자 정보 없음' };

  return { ...cond, status: operator(value, cond.value) ? S.OK : S.NO };
}

function combine(statuses) {
  if (statuses.includes(S.NO)) return RESULT.INELIGIBLE;
  if (statuses.includes(S.UNKNOWN)) return RESULT.CHECK;
  return RESULT.ELIGIBLE;
}

export function judge(policy, profile) {
  const conditions = policy.eligibility_conditions;
  const all = [...(conditions?.all ?? [])];

  // JSON 조건이 비어 있으면 기본 나이 컬럼이라도 쓴다
  if (all.length === 0 && (policy.min_age != null || policy.max_age != null)) {
    all.push({ field: 'age', op: 'between', value: [policy.min_age, policy.max_age] });
  }

  const results = all.map((c) => judgeCondition(c, profile));
  const excludes = (conditions?.exclude ?? []).map((e) => ({
    ...e,
    status: S.UNKNOWN,
    reason: '제외 조건 확인 필요',
  }));

  const statuses = [...results, ...excludes].map((r) => r.status);
  let result = combine(statuses);
  if (result === RESULT.ELIGIBLE && (!policy.eligibility_verified || all.length === 0)) {
    result = RESULT.CHECK;
  }

  return { result, conditions: [...results, ...excludes] };
}
