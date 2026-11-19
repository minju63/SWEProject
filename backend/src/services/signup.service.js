import { randomUUID } from 'node:crypto';
import rules from '../../../shared/signup-rules.mjs';
import { AppError } from '../utils/response.js';
const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};
const validId = (id) =>
  typeof id === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const checkId = (id) => {
  if (!validId(id)) fail(400, 'INVALID_CHALLENGE', '가입 요청을 다시 확인해주세요.');
};
const timing = (r) => ({
  expiresAt: Date.parse(r.otp_expires_at),
  resendAt: Date.parse(r.last_send_attempt_at) + 60000,
});
export function createSignupService({ state, auth, cleanup, now = () => Date.now() }) {
  async function send(id) {
    const r = await state.command('begin_send', id);
    try {
      await auth.resend(r.email);
      const sent = await state.command('finish_send', id, {
        operationId: r.operation_id,
        success: true,
      });
      return timing(sent);
    } catch (error) {
      await state
        .command('finish_send', id, { operationId: r.operation_id, success: false })
        .catch(() => {});
      throw error;
    }
  }
  return {
    async available(username) {
      username = String(username || '').toLowerCase();
      if (!rules.usernamePattern.test(username))
        fail(400, 'INVALID_USERNAME', '아이디 형식을 확인해주세요.');
      if (auth.findAccount && (await auth.findAccount({ username })))
        return { username, available: false };
      return {
        username,
        ...(await state.command('available', null, { kind: 'username', value: username })),
      };
    },
    async emailAvailable(email) {
      email = String(email || '')
        .trim()
        .toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        fail(400, 'INVALID_EMAIL', '이메일 형식을 확인해주세요.');
      const available = await state.command('available', null, { kind: 'email', value: email });
      return { available: available.available && !(await auth.emailExists(email)) };
    },
    async start(input) {
      const clean = {
        ...input,
        email: String(input.email || '')
          .trim()
          .toLowerCase(),
        username: String(input.username || '').toLowerCase(),
        nickname: String(input.nickname || '').trim(),
      };
      const errors = rules.signupErrors(clean);
      if (Object.keys(errors).length) fail(400, 'INVALID_SIGNUP', Object.values(errors)[0]);
      if (await auth.emailExists(clean.email))
        fail(409, 'EMAIL_EXISTS', '이미 가입한 이메일이에요. 로그인해주세요.');
      if (auth.findAccount && (await auth.findAccount({ username: clean.username })))
        fail(409, 'IDENTITY_EXISTS', '이미 사용 중인 아이디예요.');
      const id = randomUUID();
      const r = await state.command('reserve', id, {
        ...clean,
        password: undefined,
        confirmation: undefined,
        consents: {
          ageConfirmed: true,
          terms: true,
          privacy: true,
          personalization: clean.personalization,
          version: '2026-11-18',
          agreedAt: new Date(now()).toISOString(),
        },
      });
      // Admin createUser sets the trusted pending marker at creation; no public signup race exists.
      // The durable creating row lets cleanup recover even if creation succeeds but attach times out.
      const user = await auth.createPending(clean.email, clean.password, clean.nickname, id);
      await state.command('attach', id, { operationId: r.operation_id, userId: user.id });
      try {
        return { challengeId: id, email: clean.email, ...(await send(id)) };
      } catch {
        return {
          challengeId: id,
          email: clean.email,
          expiresAt: 0,
          resendAt: Date.now() + 60000,
          notice:
            '가입 요청은 저장됐지만 발송 결과를 확인하지 못했어요. 60초 후 다시 발송해주세요.',
        };
      }
    },
    async resend(id) {
      checkId(id);
      return send(id);
    },
    async verify(id, token) {
      checkId(id);
      const r = await state.command('begin_verify', id);
      try {
        if (!/^\d{6}$/.test(token || ''))
          fail(400, 'INVALID_OTP', '6자리 숫자 인증번호를 입력해주세요.');
        const session = await auth.verify(r.email, token);
        if (session?.user?.id !== r.user_id)
          fail(400, 'INVALID_OTP', '인증번호를 다시 확인해주세요.');
        await state.command('finish_verify', id, {
          operationId: r.operation_id,
          success: true,
          userId: session.user.id,
        });
        return {
          session: { access_token: session.access_token, refresh_token: session.refresh_token },
        };
      } catch (error) {
        await state
          .command('finish_verify', id, { operationId: r.operation_id, success: false })
          .catch(() => {});
        throw error;
      }
    },
    async complete(id, userId) {
      checkId(id);
      const r = await state.command('begin_complete', id, { userId });
      const next = r.consents.personalization ? '/onboarding' : '/';
      if (r.status === 'completed') return { next };
      try {
        await auth.complete(userId, {
          requestId: id,
          username: r.username,
          nickname: r.nickname,
          consents: r.consents,
          completedAt: new Date(now()).toISOString(),
        });
        await state.command('finish_complete', id, { operationId: r.operation_id, success: true });
        return { next };
      } catch (error) {
        await state
          .command('finish_complete', id, { operationId: r.operation_id, success: false })
          .catch(() => {});
        throw error;
      }
    },
    async cancel(id) {
      checkId(id);
      const job = await state.command('queue_cancel', id);
      if (!(await cleanup.runJob(job.id)))
        fail(503, 'CLEANUP_PENDING', '가입 요청을 정리하고 있어요. 잠시 후 다시 확인해주세요.');
      return {};
    },
    async login(identifier, password) {
      let email = String(identifier || '')
        .trim()
        .toLowerCase();
      if (!email.includes('@')) {
        const r = auth.findAccount
          ? await auth.findAccount({ username: email })
          : await state.command('lookup', null, { username: email });
        if (!r) fail(401, 'INVALID_LOGIN', '아이디 또는 비밀번호를 확인해 주세요');
        email = r.email;
      }
      return auth.login(email, password);
    },
  };
}
