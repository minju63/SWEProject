// 홈·AI 비서가 같이 쓰는 후보 선정과 추천 정렬 (SRS FR-COM-02, FR-COM-03, FR-H04, FR-A08)
import * as homeRepo from '../repositories/home.repository.js';
import * as policyRepo from '../repositories/policy.repository.js';
import * as userRepo from '../repositories/user.repository.js';
import { judge, RESULT } from './eligibility.service.js';

export const OPEN_STATUSES = ['모집 중', '상시'];
const STATUS_ORDER = ['모집 중', '상시', '모집 예정', '기간 미정'];
const RESULT_ORDER = { [RESULT.ELIGIBLE]: 0, [RESULT.CHECK]: 1, [RESULT.INELIGIBLE]: 2 };

export function ageOf(birthDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate()))
    age -= 1;
  return age;
}

// 사용자 맞춤정보와 정책 분야 목록을 한 번에 읽는다. 로그인하지 않았으면 profile 은 null
export async function loadContext(userId) {
  const [profile, categories, policies, regions] = await Promise.all([
    userId ? userRepo.findProfile(userId) : null,
    policyRepo.findCategories(),
    homeRepo.findCandidatePolicies(),
    homeRepo.findRegions(),
  ]);
  return { profile: profile ?? null, categories, policies, regions };
}

// 관심분야(category_name 또는 category_id 로 저장된 값)에 정책이 속하는지
export function isInterest(policy, profile, categories) {
  const interests = profile?.interest_categories ?? [];
  if (interests.length === 0) return false;
  const cat = categories.find((c) => c.category_id === policy.category_id);
  return interests.includes(policy.category_id) || (cat && interests.includes(cat.category_name));
}

export function judged(policies, profile) {
  return policies.map((p) => ({ ...p, eligibility: judge(p, profile) }));
}

// 거주 구가 정해져 있으면, 다른 구만 대상인 정책은 대상 아님으로 처리한다 (FR-A10, FR-H04)
// 정책 지역(policy_region)에 구 이름이 있고 내 구가 거기 없으면 제외. 부산 전체·전국 정책은 그대로 둔다.
// 홈 추천과 AI 비서 추천이 같은 판단을 쓰도록 여기에 둔다.
// fit: 사용자 조건에 얼마나 잘 맞는지(추천 순서에 쓴다). 충족으로 판정된 조건 수 + 내 구가 정책 지역에 명시돼 있으면 +2
export function judgedWithRegion(policies, profile, regions) {
  const list = judged(policies, profile);
  const myGu = (regions ?? []).find(
    (r) => r.region_code === profile?.region_code && r.region_level === 'GU'
  );
  const guNames = new Set(
    (regions ?? []).filter((r) => r.region_level === 'GU').map((r) => r.region_name)
  );
  const satisfied = (p) => p.eligibility.conditions.filter((c) => c.status === 'SATISFIED').length;
  return list.map((p) => {
    if (!myGu) return { ...p, fit: satisfied(p) };
    const guList = (p.region_names ?? []).filter((n) => guNames.has(n));
    if (guList.length === 0) return { ...p, fit: satisfied(p) };
    if (guList.includes(myGu.region_name)) return { ...p, fit: satisfied(p) + 2 };
    return {
      ...p,
      fit: 0,
      eligibility: {
        result: RESULT.INELIGIBLE,
        conditions: [
          ...p.eligibility.conditions,
          { field: 'region', status: 'UNSATISFIED', value: guList },
        ],
      },
    };
  });
}

export function isOpen(policy) {
  return OPEN_STATUSES.includes(policy.recruitment_status);
}

// FR-COM-03: ①관심분야 일치 → ②그 밖 → ③대상 아님 → ④마감
export function sortRecommended(items, profile, categories) {
  const hasInterest = (profile?.interest_categories ?? []).length > 0;
  const tier = (p) => {
    if (p.recruitment_status === '마감') return 4;
    if (p.eligibility.result === RESULT.INELIGIBLE) return 3;
    return hasInterest && !isInterest(p, profile, categories) ? 2 : 1;
  };
  const statusRank = (p) => {
    const i = STATUS_ORDER.indexOf(p.recruitment_status);
    return i === -1 ? STATUS_ORDER.length : i;
  };
  const endKey = (p) =>
    p.is_always_open || !p.application_end_date ? '9999-12-31' : p.application_end_date;

  return [...items].sort(
    (a, b) =>
      tier(a) - tier(b) ||
      RESULT_ORDER[a.eligibility.result] - RESULT_ORDER[b.eligibility.result] ||
      (b.fit ?? 0) - (a.fit ?? 0) || // 내 조건(나이·거주지·상태 등)에 더 많이 맞는 정책 먼저
      statusRank(a) - statusRank(b) ||
      endKey(a).localeCompare(endKey(b)) ||
      a.title.localeCompare(b.title, 'ko')
  );
}

// 카드에 내려주는 형태 (조건별 판정 전체는 상세에서만 보여주므로 여기서는 결과만)
export function toCard(policy, extra = {}) {
  return {
    policy_id: policy.policy_id,
    title: policy.title,
    category_id: policy.category_id,
    support_content: policy.support_content,
    recruitment_status: policy.recruitment_status,
    d_day: policy.d_day,
    application_end_date: policy.application_end_date,
    is_always_open: policy.is_always_open,
    region_names: policy.region_names,
    eligibility: policy.eligibility.result,
    ...extra,
  };
}
