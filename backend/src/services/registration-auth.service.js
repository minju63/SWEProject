import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/response.js';
import { registrationState as state } from './registration-state.service.js';
// A distinct client prevents an end-user session from replacing the server's service credentials.
export const registrationClient = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (url, options = {}) =>
        fetch(url, {
          ...options,
          signal: options.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
        }),
    },
  });
function check(error) {
  if (!error) return;
  throw new AppError(
    error.status === 429 ? 429 : 503,
    'AUTH_REQUEST',
    '인증 서버 요청을 완료하지 못했어요. 잠시 후 다시 확인해주세요.'
  );
}
export const registrationAuth = {
  async findAccount({ email, username, requestId }) {
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await registrationClient().auth.admin.listUsers({
        page,
        perPage: 100,
      });
      check(error);
      const user = data.users.find(
        (u) =>
          (!email || u.email?.toLowerCase() === email) &&
          (!username || u.app_metadata?.registration?.username === username) &&
          (!requestId || u.app_metadata?.registration_request_id === requestId)
      );
      if (user) return user;
      if (data.users.length < 100) return null;
    }
    throw new AppError(
      503,
      'ACCOUNT_LOOKUP',
      '계정 확인을 완료하지 못했어요. 관리자에게 문의해주세요.'
    );
  },
  async emailExists(email) {
    return !!(await this.findAccount({ email }));
  },
  async createPending(email, password, nickname, id) {
    const { data, error } = await registrationClient().auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { display_name: nickname },
      app_metadata: { registration_pending: true, registration_request_id: id },
    });
    check(error);
    return data.user;
  },
  async resend(email) {
    const { error } = await registrationClient().auth.resend({ type: 'signup', email });
    check(error);
  },
  async verify(email, token) {
    const { data, error } = await registrationClient().auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error) throw new AppError(400, 'INVALID_OTP', '인증번호가 올바르지 않거나 만료됐어요.');
    return data.session;
  },
  async readUser(id) {
    const { data, error } = await registrationClient().auth.admin.getUserById(id);
    if (error && (error.status === 404 || error.code === 'user_not_found')) return null;
    check(error);
    return data.user;
  },
  async complete(id, registration) {
    const user = await this.readUser(id);
    if (!user || user.app_metadata?.registration_request_id !== registration.requestId)
      throw new AppError(403, 'USER_MISMATCH', '해당 계정의 가입 요청이 아니에요.');
    const { error } = await registrationClient().auth.admin.updateUserById(id, {
      app_metadata: { ...user.app_metadata, registration_pending: false, registration },
      user_metadata: { ...user.user_metadata, display_name: registration.nickname },
    });
    check(error);
  },
  async login(email, password) {
    const client = registrationClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session)
      throw new AppError(401, 'INVALID_LOGIN', '아이디 또는 비밀번호를 확인해 주세요');
    if (data.user.app_metadata?.registration_pending)
      throw new AppError(403, 'REGISTRATION_PENDING', '회원가입 인증을 완료해주세요.');
    if (!(await state.command('access', null, { userId: data.user.id })).allowed) {
      await client.auth.signOut({ scope: 'local' }).catch(() => {});
      throw new AppError(
        403,
        'REGISTRATION_PENDING',
        '회원가입을 완료하거나 삭제 요청 상태를 확인해주세요.'
      );
    }
    return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
  },
  async findPending(requestId, email) {
    return this.findAccount({ email, requestId });
  },
  async sendRecovery(email) {
    const { error } = await registrationClient().auth.resetPasswordForEmail(email);
    check(error);
  },
  async verifyRecovery(email, token) {
    const { data, error } = await registrationClient().auth.verifyOtp({
      email,
      token,
      type: 'recovery',
    });
    if (error || !data.session)
      throw new AppError(400, 'INVALID_OTP', '인증번호가 올바르지 않거나 만료됐어요.');
    return data.session;
  },
  async samePassword(email, password) {
    const client = registrationClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === 'invalid_credentials') return false;
      check(error);
    }
    if (!data.session) throw new AppError(503, 'AUTH_REQUEST', '비밀번호를 확인하지 못했어요.');
    await client.auth.signOut({ scope: 'local' });
    return true;
  },
  async setPassword(id, password) {
    const user = await this.readUser(id);
    if (!user) throw new AppError(400, 'INVALID_RECOVERY', '인증을 다시 진행해주세요.');
    const { error } = await registrationClient().auth.admin.updateUserById(id, {
      password,
      app_metadata: { ...user.app_metadata, auth_version: randomUUID() },
    });
    check(error);
  },
  async revokeSessions(token) {
    const { error } = await registrationClient().auth.admin.signOut(token, 'global');
    check(error);
  },
  async logout(user, token) {
    const { error } = await registrationClient().auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, auth_version: randomUUID() },
    });
    check(error);
    await this.revokeSessions(token);
  },
  async deleteUser(id) {
    // Preserve policy verification evidence; remove only the withdrawing author's nullable link.
    const { error: referenceError } = await registrationClient()
      .from('policy_field_verification')
      .update({ verified_by: null })
      .eq('verified_by', id);
    check(referenceError);
    const { error } = await registrationClient().auth.admin.deleteUser(id);
    if (error && (error.status === 404 || error.code === 'user_not_found')) return;
    check(error);
  },
  async requestWithdrawal(id) {
    const user = await this.readUser(id);
    if (!user) return;
    const stamp = new Date().toISOString();
    const { error } = await registrationClient().auth.admin.updateUserById(id, {
      app_metadata: {
        ...user.app_metadata,
        deletion_pending: true,
        consents_revoked_at: stamp,
        registration: user.app_metadata?.registration
          ? {
              ...user.app_metadata.registration,
              consents: {
                ...user.app_metadata.registration.consents,
                terms: false,
                privacy: false,
                personalization: false,
                revokedAt: stamp,
              },
            }
          : null,
      },
    });
    check(error);
  },
};
