import type { Profile, TemporaryPolicyConditions } from "../app/AppState";
import { subCategoryTree } from "./searchFilter";
import { interestDetailKey } from "./interestSelection";

// 「프로필 및 맞춤정보」와 검색 필터가 함께 쓰는 조건 항목·선택값
export const NONE = "선택하지 않음";
export const NONE_TARGET = "해당없음";

export const educationOptions = [
  "중학교 졸업 이하",
  "고등학교 졸업",
  "대학교 졸업",
  "대학원 졸업",
];
export const educationSub: Record<string, string[]> = {
  "대학교 졸업": ["2년제", "4년제"],
  "대학원 졸업": ["석사", "박사"],
};
export const statusOptions = [
  "고등학생",
  "대학생",
  "대학원생",
  "취업준비생",
  "직장인",
  "자영업자",
  "창업준비생",
  "기타",
];
export const statusSub: Record<string, string[]> = { 대학생: ["재학", "휴학"] };
export const employerOptions = [
  "중소·중견기업",
  "대기업",
  "공공기관",
  "기타",
  "해당 없음",
];
export const housingOptions = [
  "월세",
  "전세",
  "기숙사·생활관",
  "공공임대",
  "자가",
];
export const householdOptions = [
  "1인 거주",
  "배우자와 거주",
  "가족과 거주",
  "공동거주",
];
export const independentOptions = ["부모와 별도 거주", "부모와 함께 거주"];
export const maritalOptions = ["미혼", "기혼", "예비신혼부부", "신혼부부"];
export const ownershipOptions = ["무주택", "유주택"];
export const headOptions = ["세대주", "예비세대주", "세대원"];
export const housingBenefitOptions = ["수급 중", "수급하지 않음"];
export const specialOptions = [
  "다자녀가구",
  "중소·중견기업 재직자",
  "차상위계층",
  "기초생활수급자",
  "한부모가정",
  "장애인",
  "농업인",
  "군인",
  "지역인재",
  "신혼부부",
  "신생아·영유아 가구",
  "자립준비청년",
  "주거취약계층",
  "전세사기 피해자",
];
export const interestOptions = [
  "취업·진로",
  "주거·생활",
  "장학·금융",
  "문화",
  "공간·시설",
];

export const MIN_AGE = 18;
export const MAX_AGE = 39;

export type ConditionGroupKey = "basic" | "housing" | "special";

export const emptyConditions: TemporaryPolicyConditions = {
  age: "",
  education: "",
  educationDetail: "",
  currentStatus: "",
  statusDetail: "",
  housingType: "",
  householdType: "",
  homeOwnership: "",
  headOfHousehold: "",
  specialTargets: [],
  interests: [],
  interestDetails: [],
  employerType: "",
  maritalStatus: "",
  independentLiving: "",
  housingBenefit: "",
};

const withDetail = (value: string, detail: string) =>
  value && detail ? `${value}(${detail})` : value;

// 일부 세부분류만 고른 대분류는 세부분류명으로, 나머지는 대분류명으로 표시
export function interestLabels(c: TemporaryPolicyConditions) {
  const details = c.interestDetails ?? [];
  return (c.interests ?? []).flatMap((category) => {
    const subs = subCategoryTree[category] ?? [];
    const picked = subs.filter((item) => details.includes(item));
    return picked.length > 0 && picked.length < subs.length
      ? picked
      : [category];
  });
}

export function groupValues(c: TemporaryPolicyConditions) {
  return {
    basic: [
      c.age && `만 ${c.age}세`,
      withDetail(c.education, c.educationDetail),
      withDetail(c.currentStatus, c.statusDetail),
    ].filter(Boolean) as string[],
    housing: [
      c.housingType,
      c.householdType,
      c.independentLiving && `부모와 별도 거주 ${c.independentLiving}`,
      c.homeOwnership,
      c.headOfHousehold,
      c.housingBenefit,
    ].filter(Boolean) as string[],
    special: [
      c.maritalStatus,
      ...(c.specialTargets ?? []),
      ...interestLabels(c),
    ].filter(Boolean),
  } satisfies Record<ConditionGroupKey, string[]>;
}

export function summarize(values: string[], visible = 2) {
  if (!values.length) return "설정 없음";
  const head = values.slice(0, visible).join(" · ");
  return values.length > visible
    ? `${head} 외 ${values.length - visible}`
    : head;
}

export function conditionCount(c: TemporaryPolicyConditions) {
  const g = groupValues(c);
  return g.basic.length + g.housing.length + g.special.length;
}

// 요약용 순서: 현재 상태 · 주거 형태 · 소유 여부 · 나머지
export function orderedConditions(c: TemporaryPolicyConditions) {
  return [
    c.age && `만 ${c.age}세`,
    c.currentStatus && withDetail(c.currentStatus, c.statusDetail),
    c.housingType,
    c.homeOwnership,
    withDetail(c.education, c.educationDetail),
    c.householdType,
    c.headOfHousehold,
    c.maritalStatus,
    c.independentLiving && `부모와 별도 거주 ${c.independentLiving}`,
    c.housingBenefit,
    ...(c.specialTargets ?? []),
    ...interestLabels(c),
  ].filter(Boolean) as string[];
}

export function sameConditions(
  a: TemporaryPolicyConditions,
  b: TemporaryPolicyConditions,
) {
  const norm = (c: TemporaryPolicyConditions) => ({
    ...c,
    specialTargets: [...(c.specialTargets ?? [])].sort(),
    interests: [...(c.interests ?? [])].sort(),
    interestDetails: [...(c.interestDetails ?? [])].sort(),
  });
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

const householdFromProfile = (value?: string) =>
  !value
    ? ""
    : value === "1인 거주"
      ? "1인가구"
      : value === "가족과 거주" || value === "배우자와 거주"
        ? "가족가구"
        : "기타";

// 프로필에 저장된 값을 검색 필터의 선택값으로 변환 (프로필 데이터는 변경하지 않음)
export function profileToConditions(p: Profile): TemporaryPolicyConditions {
  const age = (p.age ?? "").replace(/\D/g, "");
  const knownDetails = [
    ...new Set(
      (p.interests ?? []).flatMap((category) =>
        (subCategoryTree[category] ?? []).filter((detail) =>
          (p.interestDetails ?? []).some(
            (item) =>
              item === detail || item === interestDetailKey(category, detail),
          ),
        ),
      ),
    ),
  ];
  return {
    birthDate: p.birthDate,
    age,
    education: p.education ?? "",
    educationDetail: p.educationDetail ?? "",
    currentStatus: p.status ?? "",
    statusDetail: p.statusDetail ?? "",
    housingType: p.housingType ?? "",
    householdType: householdFromProfile(p.householdType),
    homeOwnership: p.homeOwnership ?? "",
    headOfHousehold: p.headOfHousehold ?? "",
    specialTargets: (p.specialTargets ?? []).filter(
      (t) => t !== NONE_TARGET && t !== "신혼부부" && t !== "전세사기 피해자",
    ),
    interests: p.interests ?? [],
    interestDetails: knownDetails,
    employerType: "",
    maritalStatus:
      p.maritalStatus === "미혼" || p.maritalStatus === "예비신혼부부"
        ? "미혼"
        : p.maritalStatus
          ? "기혼"
          : "",
    independentLiving:
      p.independentLiving === "부모와 별도 거주"
        ? "예"
        : p.independentLiving === "부모와 함께 거주"
          ? "아니요"
          : "",
    housingBenefit: p.housingBenefit ?? "",
  };
}

// 정책 상세·비교에서 쓰는 사용자 조건: 이번 검색의 직접 설정이 있으면 그 값, 없으면 프로필 값
export function resolveConditions(
  profile: Profile,
  temporary: TemporaryPolicyConditions,
  myConditionsOnly: boolean,
) {
  const base = profileToConditions(profile);
  if (
    myConditionsOnly ||
    sameConditions(temporary, base) ||
    conditionCount(temporary) === 0
  )
    return base;
  return temporary;
}
