const CLOSED = new Set(['마감', '종료']);
const STATUS_ORDER = new Map([['모집 중', 0], ['상시', 1], ['모집 예정', 2], ['기간 미정', 3]]);
const ko = new Intl.Collator('ko-KR');

function recommendationGroup(policy, interests) {
  if (CLOSED.has(policy.recruitment_status)) return 5;
  if (policy.eligibility_result === 'INELIGIBLE') return 4;
  const eligible = policy.eligibility_result === 'ELIGIBLE';
  if (!interests.size) return eligible ? 0 : 1;
  const matches = interests.has(policy.category_name) ||
    (policy.category_name === '문화' && interests.has('문화·예술'));
  return matches ? (eligible ? 0 : 1) : (eligible ? 2 : 3);
}

export function compareRecommendedPolicies(a, b, interests = []) {
  const interestSet = interests instanceof Set ? interests : new Set(interests);
  const group = recommendationGroup(a, interestSet) - recommendationGroup(b, interestSet);
  if (group) return group;
  const status = (STATUS_ORDER.get(a.recruitment_status) ?? 4) -
    (STATUS_ORDER.get(b.recruitment_status) ?? 4);
  if (status) return status;
  const deadline = (a.application_end_date ?? '9999-12-31')
    .localeCompare(b.application_end_date ?? '9999-12-31');
  if (deadline) return deadline;
  return ko.compare(a.title, b.title) || a.policy_id.localeCompare(b.policy_id);
}
