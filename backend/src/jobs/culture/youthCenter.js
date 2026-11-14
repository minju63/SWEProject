// 온통청년 청년정책 Open API (getPlcy). 키는 backend/.env 의 YOUTHCENTER_API_KEY.
// 키 값은 오류 메시지·로그 어디에도 남기지 않는다.
import { QuotaError, sleep } from './dataGoKr.js';

const URL = 'https://www.youthcenter.go.kr/go/ythip/getPlcy';
const PAGE_SIZE = 100;
const TIMEOUT_MS = 30000;

const apiKey = () => process.env.YOUTHCENTER_API_KEY ?? '';
const mask = (s) => {
  const key = apiKey();
  return key ? String(s).split(key).join('***') : String(s);
};

async function getPage(params) {
  const key = apiKey();
  if (!key) throw new QuotaError('backend/.env 에 YOUTHCENTER_API_KEY 가 없습니다.');
  const query = new URLSearchParams({
    apiKeyNm: key,
    rtnType: 'json',
    pageSize: PAGE_SIZE,
    ...params,
  });
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${URL}?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 401) throw new QuotaError('HTTP 401 (키 확인)');
      if (res.ok) {
        const body = await res.json();
        const result = body.result ?? body;
        await sleep(400);
        return {
          items: result.youthPolicyList ?? [],
          total: Number(result.pagging?.totCount ?? 0),
        };
      }
      // 403 은 짧은 시간에 여러 번 부르면 잠시 나온다. 조금 길게 쉬고 다시 시도한다
      lastError = new Error(
        `HTTP ${res.status}${res.status === 403 ? ' (호출 제한 또는 키 확인)' : ''}`
      );
      if (res.status === 403) await sleep(5000 * (attempt + 1));
    } catch (e) {
      if (e instanceof QuotaError) throw e;
      lastError = new Error(
        e.name === 'TimeoutError' ? `응답 없음 ${TIMEOUT_MS / 1000}초` : mask(e.message)
      );
    }
    await sleep(2000 * (attempt + 1));
  }
  throw lastError;
}

// 조건에 맞는 정책 전체. 받은 건수가 전체 건수보다 적으면 오류
export async function getPolicies(params) {
  const all = [];
  for (let pageNum = 1; ; pageNum++) {
    const { items, total } = await getPage({ ...params, pageNum });
    all.push(...items);
    if (!items.length || all.length >= total) {
      if (all.length < total) throw new Error(`건수 부족 ${all.length}/${total}`);
      return all;
    }
  }
}
