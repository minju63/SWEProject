import {
  createHash,
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from 'node:crypto';
import { AppError } from '../utils/response.js';
import rules from '../../../shared/signup-rules.mjs';
const hash = (v) => createHash('sha256').update(v).digest('hex');
// Reset and logged-in change share one journal and must serialize together.
const recoveryQueues = new WeakMap();
export function createAccountRecovery({
  state,
  auth,
  mail,
  secret,
  now = Date.now,
  purpose = 'password-reset',
}) {
  const key = createHash('sha256').update(secret).digest();
  const fail = (code, message, status = 400) => {
    throw new AppError(status, code, message);
  };
  const emailOf = (value) => {
    const email = String(value || '')
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail('INVALID_EMAIL', '올바른 이메일을 입력해주세요.');
    return email;
  };
  // Encrypt the short-lived provider session. Passwords/OTP values are never journaled.
  function encrypt(token) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv),
      data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }
  function decrypt(value) {
    const b = Buffer.from(value, 'base64'),
      cipher = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
    cipher.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString('utf8');
  }
  const put = (id, r) => state.command('recovery_put', id, r);
  async function get(id, ownerId) {
    if (!/^[0-9a-f-]{36}$/i.test(id || ''))
      fail('INVALID_RECOVERY', '비밀번호 찾기를 다시 시작해주세요.');
    const r = await state.command('recovery_get', id);
    if (!r || r.purpose !== purpose || r.expiresAt <= now() || r.status === 'consumed')
      fail('INVALID_RECOVERY', '인증이 만료됐어요. 비밀번호 찾기를 다시 시작해주세요.');
    if (purpose === 'password-change' && (!ownerId || ownerId !== r.userId))
      fail('USER_MISMATCH', '본인 계정의 인증만 사용할 수 있어요.', 403);
    return r;
  }
  async function send(id, r) {
    if (r.resendAt > now())
      fail('COOLDOWN', `${Math.ceil((r.resendAt - now()) / 1000)}초 후 다시 발송해주세요.`, 429);
    r.resendAt = now() + 60000;
    r.status = 'sending';
    await put(id, r);
    try {
      await auth.sendRecovery(r.email);
      r.status = 'pending';
      r.attempts = 0;
      r.otpExpiresAt = now() + 300000;
      r.expiresAt = now() + 300000;
      await put(id, r);
      return { requestId: id, email: r.email, expiresAt: r.otpExpiresAt, resendAt: r.resendAt };
    } catch (error) {
      r.status = 'send_failed';
      await put(id, r);
      throw error;
    }
  }
  const exclusive =
    (fn) =>
    (...args) => {
      const work = (recoveryQueues.get(state) || Promise.resolve()).then(() => fn(...args));
      recoveryQueues.set(
        state,
        work.catch(() => {})
      );
      return work;
    };
  return {
    findUsername: exclusive(async (value) => {
      const email = emailOf(value);
      const limit = await state.command('rate', null, { key: 'find-id:' + hash(email) });
      if (!limit.allowed) fail('RATE_LIMIT', '요청이 많아요. 잠시 후 다시 시도해주세요.', 429);
      const user = await auth.findAccount({ email });
      if (!user || user.app_metadata?.registration_pending) return { registered: false, email };
      const username = user.app_metadata?.registration?.username;
      if (!username)
        fail(
          'LEGACY_ACCOUNT',
          '기존 이메일 로그인 계정에는 별도 아이디가 없어요. 가입 이메일로 로그인해주세요.'
        );
      await mail.sendUsername(email, username);
      return { registered: true, message: '가입 이메일로 아이디 안내 메일을 보냈어요.' };
    }),
    start: exclusive(async (username, value, ownerId) => {
      let current;
      if (purpose === 'password-change') {
        if (!ownerId) fail('UNAUTHORIZED', '로그인이 필요해요.', 401);
        current = await auth.readUser(ownerId);
        if (!current || current.app_metadata?.registration_pending)
          fail('UNAUTHORIZED', '계정을 다시 확인해주세요.', 401);
        value = current.email;
        username = current.app_metadata?.registration?.username || '';
      }
      const email = emailOf(value);
      username = String(username || '')
        .trim()
        .toLowerCase();
      const user =
        current ||
        (rules.usernamePattern.test(username) ? await auth.findAccount({ email, username }) : null);
      if (!user || user.app_metadata?.registration_pending)
        fail('ACCOUNT_MISMATCH', '입력한 아이디와 이메일이 일치하는 계정을 찾을 수 없습니다.');
      const limit = await state.command('rate', null, { key: 'reset-account:' + user.id });
      if (!limit.allowed) fail('RATE_LIMIT', '요청이 많아요. 잠시 후 다시 시도해주세요.', 429);
      // One active operation per account; previously verified grants are revoked too.
      const gate = await state.command('recovery_get', 'cooldown:' + user.id);
      if (gate?.resendAt > now())
        fail(
          'COOLDOWN',
          `${Math.ceil((gate.resendAt - now()) / 1000)}초 후 다시 발송해주세요.`,
          429
        );
      await state.command('recovery_invalidate_user', null, { userId: user.id });
      await put('cooldown:' + user.id, { resendAt: now() + 60000, expiresAt: now() + 60000 });
      const id = randomUUID(),
        r = {
          purpose,
          userId: user.id,
          email,
          username,
          status: 'new',
          attempts: 0,
          resendAt: 0,
          expiresAt: now() + 300000,
        };
      await put(id, r);
      return send(id, r);
    }),
    resend: exclusive(async (id, ownerId) => {
      const r = await get(id, ownerId);
      if (!['pending', 'send_failed'].includes(r.status))
        fail('INVALID_RECOVERY', '비밀번호 찾기를 다시 시작해주세요.');
      await put('cooldown:' + r.userId, { resendAt: now() + 60000, expiresAt: now() + 60000 });
      return send(id, r);
    }),
    cancel: exclusive(async (id, ownerId) => {
      if (!/^[0-9a-f-]{36}$/i.test(id || '')) fail('INVALID_RECOVERY', '요청을 다시 확인해주세요.');
      const r = await state.command('recovery_get', id);
      if (!r || r.purpose !== purpose) return {};
      if (purpose === 'password-change' && (!ownerId || ownerId !== r.userId))
        fail('USER_MISMATCH', '본인 계정의 인증만 사용할 수 있어요.', 403);
      r.status = 'consumed';
      delete r.sessionCipher;
      delete r.grantHash;
      await put(id, r);
      return {};
    }),
    verify: exclusive(async (id, token, ownerId) => {
      const r = await get(id, ownerId);
      if (r.status !== 'pending') fail('INVALID_RECOVERY', '인증번호를 다시 발송해주세요.');
      if (r.otpExpiresAt <= now()) fail('EXPIRED', '인증번호가 만료됐어요. 다시 발송해주세요.');
      if (r.attempts >= 5) fail('ATTEMPTS', '인증번호를 5회 틀렸어요. 다시 발송해주세요.', 429);
      r.attempts++;
      await put(id, r);
      if (!/^\d{6}$/.test(token || '')) fail('INVALID_OTP', '6자리 숫자 인증번호를 입력해주세요.');
      const session = await auth.verifyRecovery(r.email, token);
      if (session.user?.id !== r.userId) fail('INVALID_OTP', '인증 대상 계정을 다시 확인해주세요.');
      const grant = randomBytes(32).toString('base64url');
      r.status = 'verified';
      r.grantHash = hash(grant);
      r.sessionCipher = encrypt(session.access_token);
      r.expiresAt = now() + 300000;
      await put(id, r);
      return { grant, expiresAt: r.expiresAt };
    }),
    complete: exclusive(async (id, grant, password, confirmation, ownerId) => {
      const r = await get(id, ownerId);
      if (
        !['verified', 'sessions_revoked'].includes(r.status) ||
        typeof grant !== 'string' ||
        !r.grantHash ||
        !timingSafeEqual(Buffer.from(hash(grant)), Buffer.from(r.grantHash))
      )
        fail('INVALID_RECOVERY', '이메일 인증을 다시 진행해주세요.');
      if (!rules.passwordPattern.test(password || ''))
        fail('INVALID_PASSWORD', '비밀번호는 8~15자로 영문·숫자·허용 특수문자를 포함해주세요.');
      if (password !== confirmation) fail('PASSWORD_MISMATCH', '비밀번호가 서로 다릅니다.');
      const account = await auth.findAccount({ email: r.email, username: r.username });
      if (account?.id !== r.userId || account.app_metadata?.registration_pending)
        fail('INVALID_RECOVERY', '계정 정보가 변경됐어요. 이메일 인증을 다시 진행해주세요.');
      if (r.status === 'verified') {
        if (await auth.samePassword(r.email, password))
          fail('SAME_PASSWORD', '직전 비밀번호와 다른 비밀번호를 입력해주세요.');
        // Revoke while the verified provider session still exists; password updates can revoke it.
        await auth.revokeSessions(decrypt(r.sessionCipher));
        r.status = 'sessions_revoked';
        delete r.sessionCipher;
        await put(id, r);
      }
      await auth.setPassword(r.userId, password);
      r.status = 'consumed';
      delete r.sessionCipher;
      delete r.grantHash;
      await put(id, r);
      return { message: '비밀번호가 변경됐어요. 다시 로그인해주세요.' };
    }),
  };
}
