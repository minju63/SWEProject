import * as policyRepo from '../repositories/policy.repository.js';
import * as userRepo from '../repositories/user.repository.js';
import { judge } from './eligibility.service.js';
import { policyStatus } from './policy-status.service.js';
import { AppError } from '../utils/response.js';
import { compareSimilarPolicies, DEFAULT_SIMILARITY_LIMIT, normalizedPolicyTitle,
  scorePolicySimilarity, similarityThreshold } from './policy-similarity.service.js';

export async function getSimilarPolicies(policyId, userId, { limit = DEFAULT_SIMILARITY_LIMIT } = {}) {
  const policies = await policyRepo.findSimilarityIndex();
  const base = policies.find((item) => item.policy_id === policyId);
  if (!base) throw new AppError(404, 'POLICY_NOT_FOUND', '정책을 찾을 수 없습니다.');
  const profile = await userRepo.findProfile(userId);
  const threshold = similarityThreshold();
  const selected = selectSimilarPolicies(base, policies, profile, { limit, threshold });
  const bookmarked = await userRepo.findBookmarkedPolicyIds(userId, selected.map((item) => item.policy_id));
  return { base_eligibility_result: judge(base, profile).result, items: selected.map((item) => ({
    policy_id: item.policy_id,
    title: item.title,
    category_id: item.category_id,
    category_name: item.category_name,
    subcategories: item.subcategories,
    region_codes: item.region_codes,
    regions: item.regions,
    support_summary: item.support_summary,
    benefit: item.support_summary ?? item.support_content ?? item.benefit_type ?? null,
    application_end_date: item.application_end_date,
    recruitment_status: item.recruitment_status,
    d_day: item.d_day,
    eligibility_result: item.eligibility_result,
    is_bookmarked: bookmarked.has(item.policy_id),
    similarity_score: item.similarity_score,
    score_breakdown: item.score_breakdown,
    reasons: item.reasons,
    data_gaps: item.data_gaps,
  })), threshold };
}

export function selectSimilarPolicies(base, policies, profile, { limit = DEFAULT_SIMILARITY_LIMIT,
  threshold = similarityThreshold() } = {}) {
  const baseTitle = normalizedPolicyTitle(base.title);
  const scored = policies.filter((item) => item.policy_id !== base.policy_id &&
    normalizedPolicyTitle(item.title) !== baseTitle).map((item) => {
    const similarity = scorePolicySimilarity(base, item);
    return { ...item, ...similarity };
  }).filter((item) => item.score >= threshold && item.substantive_score >= 10 &&
    (item.category_id === base.category_id || item.substantive_score >= 25));

  const candidates = scored.map((item) => ({
    ...item, ...policyStatus(item), similarity_score: item.score,
    eligibility_result: judge(item, profile).result,
  })).sort(compareSimilarPolicies);
  const uniqueByTitle = new Map();
  for (const item of candidates) {
    const title = normalizedPolicyTitle(item.title);
    if (!title || title === baseTitle) continue;
    const previous = uniqueByTitle.get(title);
    if (!previous || (previous.category_id !== base.category_id && item.category_id === base.category_id))
      uniqueByTitle.set(title, item);
  }
  const unique = [...uniqueByTitle.values()].sort(compareSimilarPolicies);
  const sameCategory = unique.filter((item) => item.category_id === base.category_id);
  const crossCategory = unique.filter((item) => item.category_id !== base.category_id);
  return [...sameCategory.slice(0, limit), ...crossCategory.slice(0, Math.max(0, limit - sameCategory.length))]
    .sort(compareSimilarPolicies);
}
