import * as policyService from '../services/policy.service.js';
import { ok } from '../utils/response.js';

export async function list(req, res) {
  // Express 5: req.query 는 읽기 전용이라 기본값은 따로 받는다
  const page = Math.max(Number(req.query.page) || 1, 1);
  const size = Math.min(Math.max(Number(req.query.size) || 20, 1), 100);
  const data = await policyService.listPolicies({
    categoryId: req.query.categoryId,
    keyword: req.query.q,
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
