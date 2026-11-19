import { supabase } from '../lib/supabase.js';
import { AppError } from '../utils/response.js';
import { registrationState } from '../services/registration-state.service.js';

// Authorization: Bearer {accessToken} 헤더의 Supabase 토큰을 확인한다.
export async function requireAuth(req, _res, next) {
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
  if (!token) throw new AppError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id)
    throw new AppError(401, 'INVALID_TOKEN', '로그인 정보가 올바르지 않습니다.');

  req.user = data.user;
  // getUser validates the token first; compare server-owned version to revoke old JWTs after reset.
  if (data.user.app_metadata?.auth_version) {
    let claims;
    try {
      claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    } catch {
      /* Invalid token structure is rejected by the version comparison below. */
    }
    if (claims?.app_metadata?.auth_version !== data.user.app_metadata.auth_version)
      throw new AppError(401, 'SESSION_REVOKED', '비밀번호가 변경됐어요. 다시 로그인해주세요.');
  }
  if (data.user.app_metadata?.registration_pending)
    throw new AppError(
      403,
      'REGISTRATION_PENDING',
      '회원가입 화면에서 이메일 인증을 완료해주세요.'
    );
  // getUser checks the live identity; the ledger additionally blocks direct Auth verification
  // and accounts with a durable deletion request, even with a still-valid JWT.
  const deletingOwnAccount = req.method === 'DELETE' && req.path === '/account';
  if (
    !deletingOwnAccount &&
    !(await registrationState.command('access', null, { userId: data.user.id })).allowed
  )
    throw new AppError(
      403,
      'REGISTRATION_INCOMPLETE',
      '회원가입 완료 또는 계정 삭제 요청 상태를 확인해주세요.'
    );
  next();
}

// 로그인하지 않아도 쓸 수 있는 API 용: 토큰이 있고 올바르면 req.user 를 채우고, 없으면 그냥 통과한다.
export async function optionalAuth(req, _res, next) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (
      !error &&
      data.user &&
      !data.user.app_metadata?.registration_pending &&
      (await registrationState.command('access', null, { userId: data.user.id })).allowed
    )
      req.user = data.user;
  }
  next();
}
