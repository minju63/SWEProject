import { Router } from 'express';
import * as policy from '../controllers/policy.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.get('/categories', policy.categories);
router.get('/policies', policy.list);
router.get('/policies/:policyId', policy.detail);
router.get('/policies/:policyId/eligibility', requireAuth, policy.eligibility);

export default router;
