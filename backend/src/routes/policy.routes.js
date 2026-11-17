import { Router } from 'express';
import * as policy from '../controllers/policy.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/categories', policy.categories);
router.get('/search-filters', policy.searchFilters);
router.get('/popular-search-keywords', policy.popularSearchKeywords);
router.get('/policies', policy.list);
router.get('/policies/suggestions', policy.suggestions);
router.get('/policies/:policyId', policy.detail);
router.get('/policies/:policyId/explanation', policy.explanation);
router.get('/policies/:policyId/similar', policy.similar);
router.get('/policies/:policyId/compare-candidates', policy.compareCandidates);
router.get('/policies/:policyId/compare/:comparisonId', policy.compare);
router.get('/policies/:policyId/compare/:comparisonId/summary', policy.compareSummary);
router.post('/policies/:policyId/view', policy.recordView);
router.get('/policies/:policyId/eligibility', policy.eligibility);

export default router;
