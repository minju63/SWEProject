import { Router } from 'express';
import * as assistant from '../controllers/assistant.controller.js';
import { optionalAuth } from '../middlewares/auth.js';

const router = Router();
router.use(optionalAuth);

router.get('/recommend', assistant.recommend); // 홈 AI 맞춤 추천 → 첫 메시지 (FR-A08)
router.post('/chat', assistant.chat); // 자연어 질문 (FR-A10~A18)

export default router;
