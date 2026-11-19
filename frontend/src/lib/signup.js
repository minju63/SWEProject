export async function signupApi(path, body, token) {
  const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')
  const r = await fetch(base + '/auth' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })
  const result = await r.json()
  if (!r.ok || !result.success)
    throw new Error(result.message || '요청을 처리하지 못했어요. 다시 시도해주세요.')
  return result.data
}
