import * as policyService from '../services/policy.service.js';
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
    conditions: req.query.conditions,
    userId: req.user?.id,
    keyword: req.query.q,
    sort: ['latest', 'deadline', 'recommended'].includes(req.query.sort) ? req.query.sort : 'deadline',
    page,
    size,
  });
  ok(res, data);
}

export async function detail(req, res) {
  ok(res, await policyService.getPolicy(req.params.policyId));
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
