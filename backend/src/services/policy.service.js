import * as policyRepo from '../repositories/policy.repository.js';
import * as userRepo from '../repositories/user.repository.js';
import { judge } from './eligibility.service.js';
import { policyStatus } from './policy-status.service.js';
import { AppError } from '../utils/response.js';

async function attachStatus(items) {
  const statuses = await policyRepo.findStatuses(items.map((p) => p.policy_id));
  const byId = new Map(statuses.map((s) => [s.policy_id, s]));
  return items.map((p) => ({ ...p, ...policyStatus(p, byId.get(p.policy_id)) }));
}

export async function listPolicies(params) {
  let categoryDetails = [];
  if (params.categoryDetails && params.categoryDetails.length < 4000) {
    try {
      const parsed = JSON.parse(params.categoryDetails);
      if (Array.isArray(parsed)) categoryDetails = parsed.filter((entry) =>
        typeof entry.categoryId === 'string' && Array.isArray(entry.details));
    } catch { /* Ignore malformed filter input. */ }
  }
  const savedProfile = params.userId ? await userRepo.findProfile(params.userId) : null;
  let temporaryConditions = null;
  if (!params.myConditionsOnly && params.conditions && params.conditions.length < 4000) {
    try {
      const parsed = JSON.parse(params.conditions);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) temporaryConditions = parsed;
    } catch { /* Ignore an invalid temporary filter. */ }
  }
  const conditionProfile = temporaryConditions ?? savedProfile;
  const assessments = new Map();
  const assess = (policy) => {
    if (!assessments.has(policy.policy_id)) assessments.set(policy.policy_id, judge(policy, conditionProfile));
    return assessments.get(policy.policy_id);
  };
  const { items, totalCount } = await policyRepo.findPolicies({ ...params, categoryDetails,
    assess, onlyEligible: params.myConditionsOnly,
    interests: Array.isArray(conditionProfile?.interest_categories) ? conditionProfile.interest_categories : [],
  });
  const hasAdvancedStatus = items.every((item) => item.recruitment_status);
  const withStatus = hasAdvancedStatus ? items : await attachStatus(items);
  const bookmarkedIds = params.userId
    ? await userRepo.findBookmarkedPolicyIds(params.userId, withStatus.map((item) => item.policy_id)) : new Set();
  return {
    items: withStatus.map((item) => ({ ...item,
      ...(params.includeEligibility ? { eligibility_result: item.eligibility_result ?? assess(item).result } : {}),
      is_bookmarked: bookmarkedIds.has(item.policy_id),
    })),
    page: params.page,
    size: params.size,
    totalCount,
  };
}

export async function getPolicy(policyId, userId) {
  const policy = await policyRepo.findPolicyById(policyId);
  if (!policy) throw new AppError(404, 'POLICY_NOT_FOUND', '정책을 찾을 수 없습니다.');
  const [withStatus] = await attachStatus([policy]);
  const bookmarkedIds = userId
    ? await userRepo.findBookmarkedPolicyIds(userId, [policyId]) : new Set();
  return {
    ...withStatus,
    is_bookmarked: bookmarkedIds.has(policyId),
    summary: {
      target: policy.target_summary ?? null,
      application_period: {
        start_date: policy.application_start_date,
        end_date: policy.application_end_date,
        is_always_open: policy.is_always_open,
      },
      application_method: policy.application_method ?? null,
      benefit: policy.support_summary ?? policy.support_content ?? policy.benefit_type ?? null,
    },
  };
}

export async function recordRecentView(policyId, userId) {
  if (!await policyRepo.policyExists(policyId))
    throw new AppError(404, 'POLICY_NOT_FOUND', '정책을 찾을 수 없습니다.');
  await userRepo.recordRecentView(userId, policyId);
}

export async function getEligibility(policyId, userId) {
  const policy = await policyRepo.findPolicyById(policyId);
  if (!policy) throw new AppError(404, 'POLICY_NOT_FOUND', '정책을 찾을 수 없습니다.');
  const profile = await userRepo.findProfile(userId);
  return judge(policy, profile);
}

export const listCategories = () => policyRepo.findCategories();
export const listSearchFilters = () => policyRepo.findSearchFilters();
export const listPopularSearchKeywords = () => policyRepo.findPopularSearchKeywords();
