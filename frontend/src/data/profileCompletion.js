export function getCompletion(profile) {
  const items = [
    { label: '기본 정보', section: 'basic', complete: Boolean(profile.birthDate && profile.region) },
    { label: '학력 및 현재 상태', section: 'education', complete: Boolean(profile.education && profile.status) },
    { label: '주거 및 가구 정보', section: 'housing', complete: Boolean(profile.housingType && profile.householdType && profile.independentLiving && profile.homeOwnership && profile.headOfHousehold && profile.housingBenefit) },
    { label: '직업 및 기업 정보', section: 'employment', complete: Boolean(profile.employerType) },
    { label: '혼인 상태', section: 'marital', complete: Boolean(profile.maritalStatus) },
    { label: '특화대상', section: 'special', complete: (profile.specialTargets?.length ?? 0) > 0 },
  ]
  return {
    items,
    percent: Math.round((items.filter((item) => item.complete).length / items.length) * 100),
  }
}
