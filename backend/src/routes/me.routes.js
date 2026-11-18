import { Router } from 'express';
import * as me from '../controllers/me.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/profile', me.getProfile);
router.put('/profile', me.updateProfile);
router.get('/bookmarks', me.listBookmarks);
router.post('/bookmarks', me.addBookmark);
router.delete('/bookmarks/:policyId', me.removeBookmark);

export default router;
