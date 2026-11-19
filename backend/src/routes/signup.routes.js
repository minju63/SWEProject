import { Router } from 'express';
import { createHmac } from 'node:crypto';
import { supabase as db } from '../lib/supabase.js';
import { registrationState } from '../services/registration-state.service.js';
import { signupService, accountRecovery } from '../services/registration-runtime.service.js';
import { ok, AppError } from '../utils/response.js';
import { requireAuth } from '../middlewares/auth.js';
import { registrationAuth } from '../services/registration-auth.service.js';
export { signupService };
export function signupRouter(
  service = signupService,
  state = registrationState,
  recovery = accountRecovery
) {
  const router = Router();
  router.use(async (req, _res, next) => {
    // req.ip is supplied by Express; never accept a caller's arbitrary X-Forwarded-For by default.
    const key = createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY)
      .update('registration-rate:' + req.ip)
      .digest('hex');
    if (!(await state.command('rate', null, { key })).allowed)
      throw new AppError(429, 'RATE_LIMIT', '요청이 많아요. 잠시 후 다시 시도해주세요.');
    next();
  });
  router.post('/username/check', async (req, res) =>
    ok(res, await service.available(req.body?.username))
  );
  router.post('/email/check', async (req, res) =>
    ok(res, await service.emailAvailable(req.body?.email))
  );
  router.post('/signup', async (req, res) => ok(res, await service.start(req.body || {}), 201));
  router.post('/signup/resend', async (req, res) =>
    ok(res, await service.resend(req.body?.challengeId))
  );
  router.post('/signup/cancel', async (req, res) =>
    ok(res, await service.cancel(req.body?.challengeId))
  );
  router.post('/signup/verify', async (req, res) =>
    ok(res, await service.verify(req.body?.challengeId, req.body?.token))
  );
  router.post('/signup/complete', async (req, res) => {
    const token = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')?.[1];
    if (!token) throw new AppError(401, 'UNAUTHORIZED', '로그인이 필요해요.');
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user?.id)
      throw new AppError(401, 'UNAUTHORIZED', '인증을 다시 확인해주세요.');
    ok(res, await service.complete(req.body?.challengeId, data.user.id));
  });
  router.post('/login', async (req, res) =>
    ok(res, await service.login(req.body?.identifier, req.body?.password))
  );
  router.post('/logout', requireAuth, async (req, res) => {
    await registrationAuth.logout(req.user, req.headers.authorization.replace(/^Bearer\s+/i, ''));
    ok(res, {});
  });
  router.post('/find-username', async (req, res) =>
    ok(res, await recovery.findUsername(req.body?.email))
  );
  router.post('/password-reset/start', async (req, res) =>
    ok(res, await recovery.start(req.body?.username, req.body?.email))
  );
  router.post('/password-reset/resend', async (req, res) =>
    ok(res, await recovery.resend(req.body?.requestId))
  );
  router.post('/password-reset/verify', async (req, res) =>
    ok(res, await recovery.verify(req.body?.requestId, req.body?.token))
  );
  router.post('/password-reset/cancel', async (req, res) =>
    ok(res, await recovery.cancel(req.body?.requestId))
  );
  router.post('/password-reset/complete', async (req, res) =>
    ok(
      res,
      await recovery.complete(
        req.body?.requestId,
        req.body?.grant,
        req.body?.password,
        req.body?.confirmation
      )
    )
  );
  router.post('/onboarding', requireAuth, async (req, res) => {
    const registration = req.user.app_metadata?.registration;
    if (!registration?.consents?.personalization)
      throw new AppError(403, 'CONSENT_REQUIRED', '맞춤정보 수집·이용 동의가 필요해요.');
    const { error } = await db.auth.admin.updateUserById(req.user.id, {
      app_metadata: {
        ...req.user.app_metadata,
        registration: {
          ...registration,
          onboardingCompleted: true,
          onboardingSkipped: req.body?.skipped === true,
        },
      },
    });
    if (error) throw new AppError(503, 'AUTH_UPDATE', '완료 상태를 저장하지 못했어요.');
    ok(res, {});
  });
  return router;
}
export default signupRouter();
