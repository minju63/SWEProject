import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { consents } from '../services/consent.service.js';
import { ok } from '../utils/response.js';

const router = Router();
router.use(requireAuth);

// 약관·동의서·AI 안내 전문과 내 동의 현황 (FR-MY-021)
router.get('/consents', (req, res) => ok(res, consents.view(req.user)));
// 선택 동의(맞춤정보) 철회·재동의. 철회는 { agree:false, confirmDelete:true } 가 있어야 하고 맞춤정보를 삭제한다
router.put('/consents/personalization', async (req, res) =>
  ok(res, await consents.setPersonalization(req.user, req.body ?? {}))
);

export default router;
