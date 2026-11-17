import { getPolicy } from './policy.service.js';
import { findProfile } from '../repositories/user.repository.js';
import { judge } from './eligibility.service.js';
import { normalizedPolicyTitle } from './policy-similarity.service.js';
import { AppError } from '../utils/response.js';

export function buildPolicyComparison(base, comparison, profile) {
  if (base.policy_id === comparison.policy_id ||
    normalizedPolicyTitle(base.title) === normalizedPolicyTitle(comparison.title))
    throw new AppError(400, 'SAME_POLICY', '같은 정책은 비교할 수 없습니다.');
  return {
    base,
    comparison,
    eligibility: {
      base: judge(base, profile),
      comparison: judge(comparison, profile),
    },
  };
}

export async function getPolicyComparison(baseId, comparisonId, userId) {
  if (baseId === comparisonId)
    throw new AppError(400, 'SAME_POLICY', '같은 정책은 비교할 수 없습니다.');
  const [base, comparison, profile] = await Promise.all([
    getPolicy(baseId, userId),
    getPolicy(comparisonId, userId),
    findProfile(userId),
  ]);
  return buildPolicyComparison(base, comparison, profile);
}
