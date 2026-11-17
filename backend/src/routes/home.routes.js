import { Router } from 'express';
import * as home from '../controllers/home.controller.js';
import { optionalAuth } from '../middlewares/auth.js';

const router = Router();

// 로그인하지 않아도 열린다 (맞춤정보가 없으면 판정은 모두 '확인 필요')
router.get('/home', optionalAuth, home.home);

export default router;
