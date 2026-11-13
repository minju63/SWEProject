// 공공데이터포털(data.go.kr) 호출. 키는 backend/.env 의 DATA_GO_KR_KEY.
// 키 값은 오류 메시지·로그 어디에도 남기지 않는다.
import { XMLParser } from 'fast-xml-parser';

const TIMEOUT_MS = 30000;
const RETRIES = 2; // 일시 오류(제공기관 서버 504, 응답 없음)는 두 번 더 시도
const xml = new XMLParser({ parseTagValue: false, trimValues: true }); // 값은 문자열 그대로 (번호 앞 0 보존)

// 호출 한도 초과·인증 문제: 더 불러도 소용없으므로 그 자리에서 멈춘다
export class QuotaError extends Error {}

const apiKey = () => process.env.DATA_GO_KR_KEY ?? '';
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mask(text) {
  let out = String(text);
  const key = apiKey();
  for (const k of [key, encodeURIComponent(key)]) if (k) out = out.split(k).join('***');
  return out;
}

// 응답 → { code, msg, body }. XML·JSON 모두 받는다 (부산 문화 API 는 XML, 표준데이터 API 는 JSON)
function parse(text) {
  const t = text.trim();
  const o = t.startsWith('<') ? xml.parse(t) : JSON.parse(t);
  const gateway = o.OpenAPI_ServiceResponse;
  if (gateway) {
    const h = gateway.cmmMsgHeader ?? {};
    return { code: String(h.returnReasonCode), msg: h.returnAuthMsg || h.errMsg || '', body: null };
  }
  const r = o.response ?? o;
  const h = r.header ?? {};
  return { code: String(h.resultCode), msg: h.resultMsg ?? '', body: r.body ?? null };
}

function itemsOf(body) {
  let items = body?.items;
  if (items && items.item !== undefined) items = items.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

// 한 쪽 조회 → { items, total }
export async function getPage(url, params) {
  const key = apiKey();
  if (!key) throw new QuotaError('backend/.env 에 DATA_GO_KR_KEY 가 없습니다.');
  const query = new URLSearchParams({ serviceKey: key, ...params });
  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(`${url}?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const text = await res.text();
      let r;
      try {
        r = parse(text);
      } catch {
        r = { code: `HTTP ${res.status}`, msg: text.slice(0, 120), body: null };
      }
      if (/^0+$/.test(r.code))
        return { items: itemsOf(r.body), total: Number(r.body?.totalCount ?? 0) };
      const message = `${r.code} ${mask(r.msg)}`.trim();
      // 20·22: 호출 한도, 30·31·32: 키 문제 (data.go.kr 공통 오류 코드)
      if (/^(20|22|30|31|32)$/.test(r.code) || /LIMIT|EXCEED/i.test(r.msg) || res.status === 429)
        throw new QuotaError(message);
      lastError = new Error(message);
    } catch (e) {
      if (e instanceof QuotaError) throw e;
      lastError =
        e.name === 'TimeoutError'
          ? new Error(`응답 없음 ${TIMEOUT_MS / 1000}초`)
          : new Error(mask(e.message));
    }
    if (attempt < RETRIES) await sleep(2000 * (attempt + 1));
  }
  throw lastError;
}

// 모든 쪽 조회. 받은 건수가 전체 건수보다 적으면 오류
export async function getAll(url, params = {}, { rows = 1000, delay = 300 } = {}) {
  const all = [];
  for (let page = 1; ; page++) {
    const { items, total } = await getPage(url, { ...params, pageNo: page, numOfRows: rows });
    all.push(...items);
    if (!items.length || all.length >= total) {
      if (all.length < total) throw new Error(`건수 부족 ${all.length}/${total}`);
      return all;
    }
    await sleep(delay);
  }
}
