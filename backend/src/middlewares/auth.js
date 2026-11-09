import { supabase } from '../lib/supabase.js';
import { AppError } from '../utils/response.js';

// Authorization: Bearer {accessToken} 헤더의 Supabase 토큰을 확인한다.
export async function requireAuth(req, _res, next) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) throw new AppError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user)
    throw new AppError(401, 'INVALID_TOKEN', '로그인 정보가 올바르지 않습니다.');

  req.user = data.user;
  next();
}
