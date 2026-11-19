import { Router } from 'express';
import { notifications } from '../services/notifications.service.js';
import { passwordChange } from '../services/registration-runtime.service.js';
import { requireAuth } from '../middlewares/auth.js';
import { ok } from '../utils/response.js';
import { supabase } from '../lib/supabase.js';
const router = Router();
router.use(requireAuth);
router.get('/notifications', async (req, res) => ok(res, await notifications.list(req.user.id)));
router.put('/notifications/:id/read', async (req, res) =>
  ok(res, await notifications.read(req.user.id, req.params.id))
);
router.get('/notification-settings', async (req, res) =>
  ok(res, await notifications.settings(req.user.id))
);
router.put('/notification-settings', async (req, res) =>
  ok(res, await notifications.saveSettings(req.user.id, req.body || {}))
);
router.post('/account/password/start', async (req, res) =>
  ok(res, await passwordChange.start(null, null, req.user.id))
);
router.post('/account/password/resend', async (req, res) =>
  ok(res, await passwordChange.resend(req.body?.requestId, req.user.id))
);
router.post('/account/password/verify', async (req, res) =>
  ok(res, await passwordChange.verify(req.body?.requestId, req.body?.token, req.user.id))
);
router.post('/account/password/complete', async (req, res) =>
  ok(
    res,
    await passwordChange.complete(
      req.body?.requestId,
      req.body?.grant,
      req.body?.password,
      req.body?.confirmation,
      req.user.id
    )
  )
);
router.post('/account/password/cancel', async (req, res) =>
  ok(res, await passwordChange.cancel(req.body?.requestId, req.user.id))
);
router.get('/map-profile', async (req, res) => {
  const { data, error } = await supabase
    .from('user_profile')
    .select('region_code')
    .eq('user_id', req.user.id)
    .maybeSingle();
  if (error) throw error;
  ok(res, { user_id: req.user.id, region_code: data?.region_code || null });
});
export default router;
