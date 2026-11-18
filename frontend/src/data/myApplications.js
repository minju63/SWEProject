import { findPolicyByTitle } from './policies'
import { profileToConditions } from './conditions'
import { evaluateEligibility } from './eligibility'
// A personal checklist never turns an unverified policy into an eligible one.
export function applicationForProfile(application, profile) {
  const policy = findPolicyByTitle(application.policyId)
  if (!policy?.fromDatabase) return application
  const result = evaluateEligibility(policy, profileToConditions(profile), profile.region)
  const checks = result.items.map((item) => ({
    label: item.label,
    status:
      item.status === '신청 가능' || item.status === '해당없음'
        ? 'matched'
        : item.status === '신청 불가'
          ? 'unmatched'
          : 'needs_check',
  }))
  if (!policy.eligibilityVerified && !policy.eligibilityRules?.condition_sections?.length) {
    for (const [label, value] of [
      ['나이', policy.ageCondition],
      ['거주지역', policy.residenceCondition],
      ['소득', policy.incomeCondition],
    ]) {
      if (value && !value.includes('확인 필요'))
        checks.push({ label: `${label}: ${value}`, status: 'needs_check' })
    }
  }
  return { ...application, eligibilityChecks: checks, eligibilityOverall: result.overall }
}
