import type { PolicyCatalogItem } from "./policies";
import type { TemporaryPolicyConditions } from "../app/AppState";
import { regionCode } from "./regions";
import { evaluateConditions } from '../../../shared/eligibility-engine.mjs';
type State = "신청 가능" | "신청 불가" | "확인 필요";
type Item = { label: string; status: State };
export function databaseEligibility(
  policy: PolicyCatalogItem,
  user: TemporaryPolicyConditions,
  region: string,
): { overall: State; items: Item[] } {
  const unknown = (
    label = "공식 공고의 전체 자격·증빙·예외 조건 확인 필요",
  ): Item => ({ label, status: "확인 필요" });
  const values: Record<string, unknown> = {
    age: user.age ? Number(user.age) : null,
    birth_year: /^\d{4}-\d{2}-\d{2}$/.test(user.birthDate || "")
      ? Number(user.birthDate!.slice(0, 4)) : null,
    region: regionCode(region),
    region_code: regionCode(region),
    final_education: user.education,
    current_status: user.currentStatus ? [user.currentStatus] : [],
    housing_type: user.housingType,
    household_type: user.householdType,
    lives_separately:
      user.independentLiving === "예"
        ? true
        : user.independentLiving === "아니요"
          ? false
          : null,
    marital_status: user.maritalStatus,
    home_ownership: user.homeOwnership,
    household_role: user.headOfHousehold,
    housing_benefit_status: user.housingBenefit,
    special_targets: user.specialTargets,
  };
  const labels: Record<string, string> = {
    age: "나이 조건",
    birth_year: "신청 대상 출생연도",
    region: "거주지역",
    region_code: "거주지역",
    final_education: "학력",
    current_status: "현재 상태",
    housing_type: "주거 형태",
    household_type: "가구 형태",
    lives_separately: "부모와 별도 거주",
    marital_status: "혼인 상태",
    home_ownership: "주택 소유",
    household_role: "세대주 여부",
    housing_benefit_status: "주거급여 수급",
    special_targets: "특화대상",
  };
  function check(c: any, depth = 0): Item {
    if (!c || typeof c !== "object" || depth > 12) return unknown();
    if (Array.isArray(c.any)) {
      const children = c.any.map((x: any) => check(x, depth + 1));
      return {
        label: "대체 조건 중 하나 충족",
        status: children.some((x: Item) => x.status === "신청 가능")
          ? "신청 가능"
          : children.some((x: Item) => x.status === "확인 필요") ||
              !children.length
            ? "확인 필요"
            : "신청 불가",
      };
    }
    const label = c.label || labels[c.field] || c.text || "공식 공고조건",
      value = values[c.field],
      expected = c.value;
    if (
      value == null ||
      value === "" ||
      (Array.isArray(value) && !value.length)
    )
      return unknown(label);
    let valid = false,
      passes = false;
    if (
      c.op === "eq" &&
      typeof value === typeof expected &&
      !Array.isArray(value) &&
      !Array.isArray(expected)
    ) {
      valid = true;
      passes = value === expected;
    }
    if (c.op === "in" && Array.isArray(expected) && !Array.isArray(value)) {
      valid = true;
      passes = expected.includes(value);
    }
    if (c.op === "contains" && Array.isArray(value)) {
      valid = true;
      passes = value.includes(expected);
    }
    if (
      c.op === "starts_with" &&
      typeof value === "string" &&
      typeof expected === "string"
    ) {
      valid = true;
      passes = value.startsWith(expected);
    }
    if (
      c.op === "between" &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      Array.isArray(expected) &&
      expected.length === 2 &&
      expected.every(
        (x) => x == null || (typeof x === "number" && Number.isFinite(x)),
      )
    ) {
      valid = true;
      passes =
        (expected[0] == null || value >= expected[0]) &&
        (expected[1] == null || value <= expected[1]);
    }
    if (
      ["gte", "lte"].includes(c.op) &&
      typeof value === "number" &&
      typeof expected === "number" &&
      Number.isFinite(value) &&
      Number.isFinite(expected)
    ) {
      valid = true;
      passes = c.op === "gte" ? value >= expected : value <= expected;
    }
    return valid
      ? { label, status: passes ? "신청 가능" : "신청 불가" }
      : unknown(label);
  }
  const rules = policy.eligibilityRules ?? {};
  if (!policy.eligibilityVerified || rules.logic === "UNVERIFIED") {
    // Housing has source-confirmed individual checks, not a verified full verdict.
    // Keep alternatives/household facts in the review tree; never infer them from
    // a personal age, interest selection, or a personal housing answer.
    const contract = rules.profile_contract;
    if (contract?.version === "housing-profile/1" && contract.mode === "PARTIAL_REVIEW") {
      const checks: Item[] = (Array.isArray(contract.checks) ? contract.checks : [])
        .filter((c: any) => c.subject === "applicant" && c.verification === "SOURCE_CONFIRMED"
          && c.evidence?.source_url && c.evidence?.quote && c.evidence?.body_sha256)
        .map((c: any) => check(c));
      const sections: Item[] = (Array.isArray(rules.condition_sections) ? rules.condition_sections : [])
        .filter((s: any) => typeof s.label === "string" && typeof s.text === "string")
        .map((s: any) => unknown(`${s.label}: ${s.text}`));
      return { overall: "확인 필요", items: [...checks, ...sections, unknown("전체 자격은 소득·가구·증빙·예외를 함께 확인해 주세요.")] };
    }
    return { overall: "확인 필요", items: [unknown()] };
  }
  const evaluated=evaluateConditions({eligibility_conditions:rules,eligibility_verified:policy.eligibilityVerified},values);
  const describe=(c:any):string=>c.label||c.text||labels[c.field]||
    (c.operator==='OR'?'대체 조건 중 하나 충족':c.operator==='AND'?'필수 조건 모두 충족':'공식 공고조건');
  return {overall:evaluated.result==='ELIGIBLE'?'신청 가능':evaluated.result==='INELIGIBLE'?'신청 불가':'확인 필요',
    items:evaluated.conditions.map(c=>({label:(c.exclusion?'제외 대상 확인: ':'')+describe(c),status:c.status==='SATISFIED'?'신청 가능':c.status==='UNSATISFIED'?'신청 불가':'확인 필요'}))};
}
