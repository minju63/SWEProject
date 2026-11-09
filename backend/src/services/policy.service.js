import * as policyRepo from '../repositories/policy.repository.js';
import * as userRepo from '../repositories/user.repository.js';
import { judge } from './eligibility.service.js';
import { AppError } from '../utils/response.js';

async function attachStatus(items) {
  const statuses = await policyRepo.findStatuses(items.map((p) => p.policy_id));
  const byId = new Map(statuses.map((s) => [s.policy_id, s]));
  return items.map((p) => ({ ...p, ...byId.get(p.policy_id) }));
}

export async function listPolicies(params) {
  const { items, totalCount } = await policyRepo.findPolicies(params);
  return {
    items: await attachStatus(items),
    page: params.page,
    size: params.size,
    totalCount,
  };
}

export async function getPolicy(policyId) {
  const policy = await policyRepo.findPolicyById(policyId);
  if (!policy) throw new AppError(404, 'POLICY_NOT_FOUND', '정책을 찾을 수 없습니다.');
  const [withStatus] = await attachStatus([policy]);
  return withStatus;
}

export async function getEligibility(policyId, userId) {
  const policy = await policyRepo.findPolicyById(policyId);
  if (!policy) throw new AppError(404, 'POLICY_NOT_FOUND', '정책을 찾을 수 없습니다.');
  const profile = await userRepo.findProfile(userId);
  return judge(policy, profile);
}

export const listCategories = () => policyRepo.findCategories();
