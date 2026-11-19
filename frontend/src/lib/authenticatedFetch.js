// Keep pure policy mapping modules importable without initializing the browser Auth client.
export async function authenticatedFetch(url, options = {}) {
  const { supabase } = await import('./supabase');
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw Error('로그인이 필요합니다.');
  const headers = new Headers(options.headers);
  headers.set('Authorization', 'Bearer ' + session.access_token);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) await supabase.auth.signOut({ scope: 'local' });
  return response;
}
