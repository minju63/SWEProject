import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError } from '../utils/response.js';
import rules from '../../../shared/signup-rules.mjs';
import { accountWorkflow } from './account-recovery.service.js';

const validId = (id) => /^[0-9a-f-]{36}$/i.test(id || '');
export function createAccountIdentity({ state, auth, mail, secret, now = Date.now }) {
  const fail = (code, text, status = 400) => {
    throw new AppError(status, code, text);
  };
  const digest = (id, value) =>
    createHmac('sha256', secret)
      .update(id + ':' + value)
      .digest('hex');
  const matches = (id, value, expected) =>
    typeof value === 'string' &&
    typeof expected === 'string' &&
    expected.length === 64 &&
    timingSafeEqual(Buffer.from(digest(id, value)), Buffer.from(expected));
  const locked = (fn) => accountWorkflow(state, fn);
  const put = (id, value) => state.command('recovery_put', id, value);
  async function account(owner) {
    if (!owner) fail('UNAUTHORIZED', '로그인이 필요해요.', 401);
    const user = await auth.readUser(owner);
    if (!user || user.app_metadata?.registration_pending || user.app_metadata?.deletion_pending)
      fail('UNAUTHORIZED', '계정을 다시 확인해주세요.', 401);
    return user;
  }
  async function get(id, owner, kind, allowExpired = false) {
    if (!validId(id)) fail('INVALID_CHANGE', '계정 변경을 다시 시작해주세요.');
    const r = await state.command('recovery_get', id);
    if (!r || r.purpose !== 'identity-' + kind || r.userId !== owner)
      fail('INVALID_CHANGE', '본인 계정의 해당 변경 인증만 사용할 수 있어요.', 403);
    if (
      r.status === 'consumed' ||
      (!allowExpired && r.status !== 'applying' && r.expiresAt <= now())
    )
      fail('EXPIRED', '인증이 만료됐어요. 다시 시작해주세요.');
    return r;
  }
  async function unchanged(r, owner) {
    const user = await account(owner);
    if (user.email !== r.email || (user.app_metadata?.registration?.username || '') !== r.username)
      fail('ACCOUNT_CHANGED', '계정 정보가 변경됐어요. 다시 인증해주세요.');
    return user;
  }
  async function send(id, r, isNew) {
    if (r.resendAt > now()) fail('COOLDOWN', '인증번호는 60초 후 다시 보낼 수 있어요.', 429);
    const token = String(randomInt(0, 1000000)).padStart(6, '0');
    r.otpHash = digest(id, token);
    r.resendAt = now() + 60000;
    r.otpExpiresAt = now() + 300000;
    r.expiresAt = now() + 300000;
    r.attempts = 0;
    r.status = 'sending';
    await put(id, r);
    try {
      await mail.sendIdentityCode(isNew ? r.reservedValue : r.email, token, r.kind, isNew);
      r.status = isNew ? 'new-pending' : 'pending';
      await put(id, r);
    } catch (error) {
      r.status = isNew ? 'new-send-failed' : 'send-failed';
      delete r.otpHash;
      await put(id, r);
      throw error;
    }
    return {
      requestId: id,
      email: isNew ? r.reservedValue : r.email,
      expiresAt: r.expiresAt,
      resendAt: r.resendAt,
    };
  }
  async function verifyCode(id, r, token) {
    if (r.otpExpiresAt <= now()) fail('EXPIRED', '인증번호가 만료됐어요. 다시 발송해주세요.');
    if (r.attempts >= 5) fail('ATTEMPTS', '인증번호를 5회 틀렸어요. 다시 발송해주세요.', 429);
    r.attempts++;
    await put(id, r);
    if (!/^\d{6}$/.test(token || '') || !matches(id, token, r.otpHash))
      fail('INVALID_OTP', '인증번호가 올바르지 않아요.');
    delete r.otpHash;
  }
  function grant(id, r, value) {
    if (!matches(id, value, r.grantHash))
      fail('NOT_VERIFIED', '등록 이메일 인증을 다시 진행해주세요.');
  }
  async function reserve(id, r, kind, value) {
    value = String(value || '')
      .trim()
      .toLowerCase();
    if (
      kind === 'username'
        ? !rules.usernamePattern.test(value)
        : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    )
      fail(
        'INVALID_VALUE',
        kind === 'username'
          ? '아이디는 소문자로 시작하는 영문·숫자 8~15자로 입력해주세요.'
          : '올바른 새 이메일을 입력해주세요.'
      );
    if (value === (kind === 'username' ? r.username : r.email))
      fail('SAME_VALUE', '현재 값과 다른 값을 입력해주세요.');
    const other = await auth.findAccount({ [kind]: value });
    if (other) fail('IDENTITY_EXISTS', '이미 사용 중인 아이디 또는 이메일이에요.', 409);
    return state.command('identity_reserve', id, { userId: r.userId, kind, value });
  }
  async function apply(id, r, owner) {
    const current = await account(owner);
    const currentValue =
      r.kind === 'username' ? current.app_metadata?.registration?.username : current.email;
    if (r.status !== 'applying' || currentValue !== r.reservedValue) {
      await unchanged(r, owner);
      const other = await auth.findAccount({ [r.kind]: r.reservedValue });
      if (other && other.id !== owner) fail('IDENTITY_EXISTS', '이미 사용 중인 값이에요.', 409);
      r.status = 'applying';
      await put(id, r);
      // Provider timeout may follow a successful write: keep the reservation and reconcile on retry.
      await auth.changeIdentity(owner, r.kind, r.reservedValue);
    }
    await state.command('identity_commit', id, { userId: owner });
    return { changed: true, user_id: owner, message: '계정 정보가 변경됐어요.' };
  }
  return {
    resume: locked(async (owner, kind, id) => {
      const r = await get(id, owner, kind);
      if (r.status !== 'applying') fail('INVALID_CHANGE', '진행 중인 저장 요청이 없어요.');
      return apply(id, r, owner);
    }),
    start: locked(async (owner, kind) => {
      if (!['username', 'email'].includes(kind))
        fail('INVALID_CHANGE', '변경 항목을 확인해주세요.');
      const user = await account(owner);
      const rate = await state.command('rate', null, { key: 'identity:' + owner });
      if (!rate.allowed) fail('RATE_LIMIT', '요청이 많아요. 잠시 후 다시 시도해주세요.', 429);
      // Never abandon an ambiguous provider write by starting a new request.
      const active = await state.command('identity_active', null, { userId: owner });
      if (active) {
        if (active.kind !== kind)
          fail(
            'CHANGE_PENDING',
            `${active.kind === 'username' ? '아이디' : '이메일'} 변경 화면에서 저장 결과를 먼저 확인해주세요.`,
            409
          );
        return { requestId: active.requestId, resumable: true };
      }
      const previous = await state.command('recovery_get', 'cooldown:' + owner);
      if (previous?.resendAt > now())
        fail('COOLDOWN', '인증번호는 60초 후 다시 보낼 수 있어요.', 429);
      await state.command('recovery_invalidate_user', null, { userId: owner });
      await put('cooldown:' + owner, { resendAt: now() + 60000, expiresAt: now() + 60000 });
      const id = randomUUID(),
        r = {
          purpose: 'identity-' + kind,
          kind,
          userId: owner,
          email: user.email,
          username: user.app_metadata?.registration?.username || '',
          status: 'new',
          resendAt: 0,
        };
      return send(id, r, false);
    }),
    resend: locked(async (owner, kind, id) => {
      const r = await get(id, owner, kind, true);
      if (!['pending', 'send-failed', 'new-pending', 'new-send-failed'].includes(r.status))
        fail('INVALID_CHANGE', '인증을 다시 시작해주세요.');
      await unchanged(r, owner);
      return send(id, r, r.status.startsWith('new-'));
    }),
    verify: locked(async (owner, kind, id, token) => {
      const r = await get(id, owner, kind);
      if (r.status !== 'pending') fail('INVALID_CHANGE', '등록 이메일 인증을 다시 시작해주세요.');
      await unchanged(r, owner);
      await verifyCode(id, r, token);
      const value = randomBytes(32).toString('base64url');
      r.grantHash = digest(id, value);
      r.status = 'verified';
      r.expiresAt = now() + 300000;
      r.resendAt = 0;
      await put(id, r);
      return { grant: value, expiresAt: r.expiresAt };
    }),
    prepare: locked(async (owner, kind, id, proof, value) => {
      if (kind !== 'email') fail('INVALID_CHANGE', '변경 항목을 확인해주세요.');
      const r = await get(id, owner, kind);
      grant(id, r, proof);
      if (r.status !== 'verified') fail('INVALID_CHANGE', '등록 이메일 인증을 다시 진행해주세요.');
      await unchanged(r, owner);
      const reserved = await reserve(id, r, kind, value);
      return send(id, reserved, true);
    }),
    complete: locked(async (owner, kind, id, proof, value, token) => {
      if (validId(id)) {
        const prior = await state.command('recovery_get', id);
        if (
          prior?.status === 'consumed' &&
          prior.reservedKind &&
          prior.grantHash &&
          prior.userId === owner &&
          prior.purpose === 'identity-' + kind &&
          prior.expiresAt > now()
        ) {
          grant(id, prior, proof);
          const current = await account(owner);
          const savedValue =
            kind === 'username' ? current.app_metadata?.registration?.username : current.email;
          if (savedValue === prior.reservedValue)
            return { changed: true, user_id: owner, message: '계정 정보가 변경됐어요.' };
        }
      }
      let r = await get(id, owner, kind);
      grant(id, r, proof);
      if (r.status === 'applying') return apply(id, r, owner);
      await unchanged(r, owner);
      if (kind === 'username') {
        if (r.status !== 'verified') fail('NOT_VERIFIED', '이메일 인증을 먼저 완료해주세요.');
        r = await reserve(id, r, kind, value);
      } else {
        if (r.status !== 'new-pending') fail('NOT_VERIFIED', '새 이메일 인증을 먼저 완료해주세요.');
        await verifyCode(id, r, token);
      }
      return apply(id, r, owner);
    }),
    cancel: locked(async (owner, kind, id) => {
      const r = await get(id, owner, kind, true);
      if (r.status === 'applying')
        fail('CHANGE_PENDING', '저장 결과를 확인해야 해요. 저장을 다시 눌러주세요.', 409);
      r.status = 'consumed';
      delete r.otpHash;
      delete r.grantHash;
      await put(id, r);
      return {};
    }),
  };
}
