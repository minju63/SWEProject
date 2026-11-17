import * as policyService from '../services/policy.service.js';
import { suggestPolicies } from '../services/policy-suggestion.service.js';
import { getSimilarPolicies } from '../services/policy-similar.service.js';
import { getPolicyComparison } from '../services/policy-compare.service.js';
import { getPolicyExplanation } from '../services/policy-explanation.service.js';
import { getAiCompareCandidates } from '../services/policy-compare-candidates-ai.service.js';
import { getAiComparisonSummary } from '../services/policy-compare-summary-ai.service.js';
import { ok } from '../utils/response.js';

export async function list(req, res) {
  // Express 5: req.query 는 읽기 전용이라 기본값은 따로 받는다
  const page = Math.max(Number(req.query.page) || 1, 1);
  const size = Math.min(Math.max(Number(req.query.size) || 20, 1), 100);
  const data = await policyService.listPolicies({
    categoryId: req.query.categoryId,
    categoryIds: req.query.categoryIds?.split(',').filter(Boolean),
    details: req.query.details?.split(',').filter(Boolean),
    categoryDetails: req.query.categoryDetails,
    regions: req.query.regions?.split(',').filter(Boolean),
    statuses: req.query.statuses?.split(',').filter(Boolean),
    dateStart: req.query.dateStart,
    dateEnd: req.query.dateEnd,
    includeAlways: req.query.includeAlways === 'true',
    myConditionsOnly: req.query.myConditionsOnly === 'true',
    includeEligibility: req.query.includeEligibility === 'true',
    conditions: req.query.conditions,
    userId: req.user.id,
    keyword: req.query.q,
    sort: ['latest', 'deadline', 'recommended'].includes(req.query.sort) ? req.query.sort : 'deadline',
    page,
    size,
  });
  ok(res, data);
}

export async function suggestions(req, res) {
  ok(res, await suggestPolicies({ q: req.query.q, context: req.query.context,
    basePolicyId: req.query.basePolicyId }));
}

export async function detail(req, res) {
  ok(res, await policyService.getPolicy(req.params.policyId, req.user.id));
}

export async function explanation(req, res) {
  ok(res, await getPolicyExplanation(req.params.policyId, req.user.id));
}

export async function similar(req, res) {
  const limit = req.query.limit === '3' ? 3 : undefined;
  ok(res, await getSimilarPolicies(req.params.policyId, req.user.id, { limit }));
}

export async function compare(req, res) {
  ok(res, await getPolicyComparison(req.params.policyId, req.params.comparisonId, req.user.id));
}

export async function compareCandidates(req, res) {
  ok(res, await getAiCompareCandidates(req.params.policyId, req.user.id));
}

export async function compareSummary(req, res) {
  ok(res, await getAiComparisonSummary(req.params.policyId, req.params.comparisonId, req.user.id));
}

export async function recordView(req, res) {
  await policyService.recordRecentView(req.params.policyId, req.user.id);
  ok(res, null);
}

export async function eligibility(req, res) {
  ok(res, await policyService.getEligibility(req.params.policyId, req.user.id));
}

export async function categories(req, res) {
  ok(res, await policyService.listCategories());
}

export async function searchFilters(req, res) {
  ok(res, await policyService.listSearchFilters());
}

export async function popularSearchKeywords(req, res) {
  ok(res, await policyService.listPopularSearchKeywords());
}
