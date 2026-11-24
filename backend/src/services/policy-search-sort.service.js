const CLOSED = new Set(['마감', '종료']);
const STATUS_ORDER = new Map([['모집 중', 0], ['상시', 1], ['모집 예정', 2], ['기간 미정', 3]]);
const ko = new Intl.Collator('ko-KR');

// 개별 조건 중 충족/미충족 개수. OR·NOT 묶음은 하나의 조건으로 센다. 제외 사항은 세지 않는다.
export function tallyConditions(conditions = []) {
  const tally = { met: 0, unmet: 0 };
  const visit = (node) => {
    if (!node || node.exclusion) return;
    const op = String(node.op ?? node.operator ?? '').toUpperCase();
    if (node.children?.length && op !== 'OR' && op !== 'NOT' && !Array.isArray(node.any)) return node.children.forEach(visit);
    if (node.status === 'SATISFIED') tally.met += 1;
    else if (node.status === 'UNSATISFIED') tally.unmet += 1;
  };
  conditions.forEach(visit);
  return tally;
}

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
  // 같은 '확인 필요' 그룹 안에서는 미충족이 적고 충족된 개별 조건이 많은 정책을 먼저 보여준다.
  const level = recommendationGroup(a, interestSet);
  if (level === 1 || level === 3) {
    const unmet = (a.unmet_conditions ?? 0) - (b.unmet_conditions ?? 0);
    if (unmet) return unmet;
    const met = (b.met_conditions ?? 0) - (a.met_conditions ?? 0);
    if (met) return met;
  }
  const status = (STATUS_ORDER.get(a.recruitment_status) ?? 4) -
    (STATUS_ORDER.get(b.recruitment_status) ?? 4);
  if (status) return status;
  const deadline = (a.application_end_date ?? '9999-12-31')
    .localeCompare(b.application_end_date ?? '9999-12-31');
  if (deadline) return deadline;
  return ko.compare(a.title, b.title) || a.policy_id.localeCompare(b.policy_id);
}
