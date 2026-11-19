import { databaseEligibility } from './databaseEligibility'
export function evaluateEligibility(policy, user, userRegion) {
  if (policy.fromDatabase) return databaseEligibility(policy, user, userRegion)
  const items = []
  const req = policy.requirements ?? {}
  const range = policy.ageCondition.match(/(\d+)\s*~\s*(\d+)/)
  if (range) {
    const age = Number(user.age)
    items.push({
      label: '나이 조건',
      status: !user.age
        ? '확인 필요'
        : age >= Number(range[1]) && age <= Number(range[2])
          ? '신청 가능'
          : '대상 아님',
    })
  }
  const district = ['사하구', '부산진구'].includes(policy.region) ? policy.region : ''
  let residence
  if (policy.region === '전국') residence = '신청 가능'
  else if (!userRegion) residence = '확인 필요'
  else if (district) residence = userRegion.endsWith(district) ? '신청 가능' : '대상 아님'
  else residence = userRegion.startsWith('부산') ? '신청 가능' : '대상 아님'
  items.push({ label: '거주지역', status: residence })
  if (req.statuses) {
    items.push({
      label: '학적·취업 조건',
      status: !user.currentStatus
        ? '확인 필요'
        : req.statuses.includes(user.currentStatus)
          ? '신청 가능'
          : '대상 아님',
    })
  }
  if (req.noHome) {
    items.push({
      label: '무주택 조건',
      status: !user.homeOwnership
        ? '확인 필요'
        : user.homeOwnership === '무주택'
          ? '신청 가능'
          : '대상 아님',
    })
  }
  if (req.independent) {
    items.push({
      label: '부모와 별도 거주',
      status: !user.independentLiving
        ? '확인 필요'
        : user.independentLiving === '예'
          ? '신청 가능'
          : '대상 아님',
    })
  }
  if (req.marital) {
    items.push({
      label: '혼인 상태',
      status: !user.maritalStatus
        ? '확인 필요'
        : user.maritalStatus === req.marital
          ? '신청 가능'
          : '대상 아님',
    })
  }
  if (req.marriageDuration) items.push({ label: '혼인 기간', status: '확인 필요' })
  // 소득 정보는 조건 입력 항목에 없으므로 제한이 있는 정책은 항상 확인 필요
  if (policy.incomeCondition && !policy.incomeCondition.includes('제한 없음')) {
    items.push({ label: '소득 조건', status: '확인 필요' })
  }
  const overall = items.some((item) => item.status === '대상 아님')
    ? '대상 아님'
    : items.some((item) => item.status === '확인 필요')
      ? '확인 필요'
      : '신청 가능'
  return { overall, items }
}
export const verdictStyle = {
  '신청 가능': 'bg-[#e7f6ec] text-[#1f8f4e]',
  '대상 아님': 'bg-[#fdeaea] text-[#d33a3a]',
  '확인 필요': 'bg-[#fff4d9] text-[#b7791f]',
  해당없음: 'bg-[#f3f4f6] text-black/45',
}
export const verdictTextStyle = {
  '신청 가능': 'text-[#1f8f4e]',
  '대상 아님': 'text-[#d33a3a]',
  '확인 필요': 'text-[#b7791f]',
  해당없음: 'text-black/45',
}
const statusRank = (policy) =>
  policy.recruitmentStatus === '모집 중' || policy.recruitmentStatus === '7일 내 마감'
    ? 0
    : policy.recruitmentStatus === '상시'
      ? 1
      : policy.recruitmentStatus === '모집 예정'
        ? 2
        : 3
const dday = (policy) =>
  policy.deadline.startsWith('D-') ? Number(policy.deadline.slice(2)) : 9999
// 추천순: 마감 → 대상 아님 → (관심분야 일치 × 신청 가능/확인 필요) 그룹, 그룹 내 모집 상태 → 마감일 → 가나다
export function recommendedSort(policies, user, userRegion) {
  const interests = user.interests ?? []
  const rankOf = (policy) => {
    if (policy.recruitmentStatus === '마감됨') return 6
    const { overall } = evaluateEligibility(policy, user, userRegion)
    if (overall === '대상 아님') return 5
    const matched = interests.length === 0 || interests.includes(policy.category)
    return (matched ? 0 : 2) + (overall === '신청 가능' ? 1 : 2)
  }
  return policies
    .map((policy) => ({ policy, rank: rankOf(policy) }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        statusRank(a.policy) - statusRank(b.policy) ||
        dday(a.policy) - dday(b.policy) ||
        a.policy.title.localeCompare(b.policy.title, 'ko')
    )
    .map((entry) => entry.policy)
}
