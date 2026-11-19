import { supabase } from './auth';
export async function personalApi(path, method = 'GET', body) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('로그인이 필요합니다.');
  const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
  const response = await fetch(base + '/me' + path, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (response.status === 401) await supabase.auth.signOut({ scope: 'local' });
  if (!response.ok || !result.success)
    throw new Error(
      response.status === 401
        ? '로그인 정보를 다시 확인해 주세요.'
        : result.message || '저장하지 못했어요. 다시 시도해 주세요.'
    );
  return result.data;
}
