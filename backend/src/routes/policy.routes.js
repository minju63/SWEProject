import { Router } from 'express';
import * as policy from '../controllers/policy.controller.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.js';

const router = Router();

router.get('/categories', policy.categories);
router.get('/search-filters', policy.searchFilters);
router.get('/policies', optionalAuth, policy.list);
router.get('/policies/:policyId', policy.detail);
router.get('/policies/:policyId/eligibility', requireAuth, policy.eligibility);

export default router;
