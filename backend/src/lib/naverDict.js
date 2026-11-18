// 네이버 백과사전 검색 (NAVER API HUB). 용어 사전에 없는 용어의 설명 근거로만 쓴다.
// .env 의 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 이 모두 있어야 켜진다. 키는 서버에서만 쓴다.
const ENDPOINT = 'https://naverapihub.apigw.ntruss.com/search/v1/encyc';
const CACHE_MS = 24 * 60 * 60 * 1000; // 같은 용어는 하루 동안 다시 부르지 않는다 (호출 한도 절약)
const cache = new Map();

export const isNaverDictEnabled = () =>
  Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);

const ENTITIES = {
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&#39;': "'",
  '&nbsp;': ' ',
};
const clean = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(quot|amp|lt|gt|#39|nbsp);/g, (m) => ENTITIES[m])
    .replace(/\s+/g, ' ')
    .trim();

// 결과가 없거나 실패하면 null. 질문 원문이 아니라 용어만 보낸다
export async function lookupTerm(term, timeoutMs = 3000) {
  const q = String(term ?? '')
    .trim()
    .slice(0, 30);
  if (!q || !isNaverDictEnabled() || timeoutMs < 500) return null;
  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  try {
    const res = await fetch(
      `${ENDPOINT}?display=3&start=1&format=json&query=${encodeURIComponent(q)}`,
      {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
          'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET,
        },
      }
    );
    if (!res.ok) throw new Error(`NAVER ${res.status}`);
    const items = ((await res.json()).items ?? [])
      .map((i) => ({ title: clean(i.title), text: clean(i.description), url: i.link }))
      .filter((i) => i.title && i.text && /^https:\/\/terms\.naver\.com\//.test(i.url ?? ''));
    // 제목이 용어와 같은 항목을 앞에 둔다
    items.sort((a, b) => Number(b.title === q) - Number(a.title === q));
    const value = items.length ? { term: q, items } : null;
    cache.set(q, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.warn('[naver] 실패:', err.message);
    return null;
  }
}
