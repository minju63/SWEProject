import { Router } from 'express';
import * as calendar from '../controllers/calendar.controller.js';
import { requireAuth } from '../middlewares/auth.js';

// /api/v1/me 아래에 붙는다 (app.js)
const router = Router();
router.use(requireAuth);

router.get('/calendar', calendar.getCalendar);
router.get('/policies/:policyId/alarms', calendar.getAlarms);
router.put('/policies/:policyId/alarms', calendar.putAlarms);
router.delete('/alarms/:alarmId', calendar.deleteAlarm);

export default router;
