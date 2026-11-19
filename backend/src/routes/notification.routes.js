import { Router } from 'express';
import * as notification from '../controllers/notification.controller.js';
import { requireAuth } from '../middlewares/auth.js';

// /api/v1/me 아래에 붙는다 (app.js)
const router = Router();
router.use(requireAuth);

router.get('/alarm-preferences', notification.getPreferences);
router.put('/alarm-preferences', notification.putPreferences);
router.get('/notifications', notification.list);
router.get('/notifications/unread-count', notification.unreadCount);
router.post('/notifications/read-all', notification.readAll);
router.patch('/notifications/:notificationId/read', notification.read);

export default router;
