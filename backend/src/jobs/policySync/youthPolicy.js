// 온통청년 청년정책 API(getPlcy) 한 건을 우리 DB 형식으로 바꾼다 (UC-COM-003, FR-COM-006).
// 취업·진로(JOB)와 장학·금융(FINANCE)용. 주거는 scripts/housing-sync, 문화는 jobs/culture 가 맡는다.
// 자동으로 넣는 정책은 신청 자격을 사람이 확인하지 않았으므로 eligibility_verified=false(조건 확인 필요)로 둔다.
import { createHash } from 'node:crypto';

export const ENDPOINT = 'https://www.youthcenter.go.kr/go/ythip/getPlcy';

export const DOMAINS = {
  JOB: {
    domain: 'JOB',
    categoryName: '취업·진로',
    detailTable: 'job_detail',
    queries: [{ lclsfNm: '일자리' }],
    relevant: () => true,
    subcategory: (t) =>
      /인턴|채용|일경험/.test(t)
        ? '채용·인턴'
        : /창업/.test(t)
          ? '창업지원'
          : /교육|훈련|아카데미|부트캠프|실습/.test(t)
            ? '직무교육'
            : /재직|근속|내일채움/.test(t)
              ? '재직자지원'
              : '취업지원',
    detail: (t) => ({
      job_type: /인턴/.test(t)
        ? '인턴십'
        : /상담|컨설팅/.test(t)
          ? '취업상담'
          : /자격/.test(t)
            ? '자격증지원'
            : /정장/.test(t)
              ? '정장대여'
              : /채용/.test(t)
                ? '채용공고'
                : null,
    }),
  },
  FINANCE: {
    domain: 'FINANCE',
    categoryName: '장학·금융',
    detailTable: 'finance_detail',
    queries: [
      { lclsfNm: '교육' },
      ...['장학', '학자금', '자산형성', '저축', '적금', '금융', '대출', '이자'].map((plcyNm) => ({ plcyNm })),
    ],
    relevant: (t) => /장학|학자금|등록금|저축|적금|금융|대출|이자|자산|통장|보증|융자/.test(t),
    subcategory: () => null, // 장학·금융에는 세부분류가 아직 없다
    detail: (t) => ({
      finance_type: /장학/.test(t)
        ? '장학금'
        : /이자/.test(t)
          ? '이자지원'
          : /학자금|등록금/.test(t)
            ? '학자금대출'
            : /저축|적금|통장/.test(t)
              ? '저축'
              : /자산/.test(t)
                ? '자산형성'
                : null,
    }),
  },
};

const text = (v) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
const url = (v) => {
  const s = String(v ?? '').trim();
  return /^https?:\/\//i.test(s) ? s : null;
};
export const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[\s·.,()[\]「」『』'"“”‘’~\-_/]/g, '');
export const canonicalUrl = (v) => {
  const u = url(v);
  if (!u) return null;
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/$/, '')}${x.search}`.toLowerCase();
  } catch {
    return null;
  }
};
export const uuidOf = (key) => {
  const h = createHash('sha1').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

// 적용 지역 코드로 서비스 지역(전국·부산·부산진구·사하구)인지 본다. 코드가 없으면 전국으로 간주하지 않는다
export function scopeOf(row) {
  const codes = String(row.zipCd ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const cities = new Set(codes.map((x) => x.slice(0, 2)));
  if (cities.size >= 15) return 'KR';
  if (codes.includes('26') || codes.includes('26000')) return '26';
  const busan = codes.filter((c) => c.startsWith('26'));
  if (busan.length >= 16) return '26';
  if (busan.includes('26230')) return '26230';
  if (busan.includes('26380')) return '26380';
  return null;
}

// "20260701 ~ 20261231" → [시작, 끝]. 형식이 다르면 [null, null]
export function periodOf(row) {
  const m = String(row.aplyYmd ?? '')
    .trim()
    .match(/^(\d{8})\s*~\s*(\d{8})$/);
  if (!m) return [null, null];
  const f = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
  return [f(m[1]), f(m[2])];
}

const age = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 100 ? n : null;
};

// 새로 넣을 만한 정책인지. 아니면 건너뛰는 이유를 돌려준다 (null 이면 넣어도 된다)
export function skipReason(row, cfg, { today, existing }) {
  const title = text(row.plcyNm);
  if (!title || !text(row.plcySprtCn)) return 'missing_content';
  if (!cfg.relevant(`${title} ${row.plcyKywdNm ?? ''} ${row.mclsfNm ?? ''}`)) return 'other_topic';
  if (!scopeOf(row)) return 'out_of_scope';
  if (!url(row.refUrlAddr1) && !url(row.refUrlAddr2) && !url(row.aplyUrlAddr)) return 'no_official_url';
  const [, end] = periodOf(row);
  if (row.aplyPrdSeCd === '0057003' || (end && end < today)) return 'closed';
  if (!end && row.aplyPrdSeCd !== '0057002') return 'unknown_period';
  if (existing.externalIds.has(`youthcenter:${row.plcyNo}`)) return 'already_collected';
  const official = canonicalUrl(row.refUrlAddr1) || canonicalUrl(row.aplyUrlAddr);
  if (existing.titles.has(norm(title)) || (official && existing.urls.has(official))) return 'duplicate';
  return null;
}

// 반환: { policy, detail, source, region, subcategoryName }  (category_id·subcategory_id 는 DB 조회 뒤 채운다)
export function mapRow(row, cfg, now = new Date()) {
  const title = text(row.plcyNm);
  const [start, end] = periodOf(row);
  const always = row.aplyPrdSeCd === '0057002';
  const policyId = uuidOf(`policy:youthcenter:${row.plcyNo}`);
  const topic = `${title} ${row.plcyKywdNm ?? ''} ${row.mclsfNm ?? ''}`;
  const income =
    row.earnCndSeCd === '0043001'
      ? '제한없음'
      : text(row.earnEtcCn) ||
        (Number(row.earnMaxAmt) > 0 ? `연 ${Number(row.earnMaxAmt).toLocaleString('ko-KR')}만원 이하` : null);
  const iso = now.toISOString();
  return {
    policy: {
      policy_id: policyId,
      title,
      collection_domain: cfg.domain,
      item_type: 'POLICY',
      target_summary: text(row.sprtTrgtEtcCn) || text(row.addAplyQlfcCndCn) || '공식 공고의 지원대상을 확인해 주세요.',
      support_content: text(row.plcySprtCn),
      benefit_type: text(row.plcyKywdNm) || null,
      min_age: age(row.sprtTrgtMinAge),
      max_age: age(row.sprtTrgtMaxAge),
      income_condition: income,
      application_start_date: start,
      application_end_date: always ? null : end,
      is_always_open: always,
      application_method: text(row.plcyAplyMthdCn) || null,
      application_url: url(row.aplyUrlAddr),
      official_url: url(row.refUrlAddr1) || url(row.refUrlAddr2) || url(row.aplyUrlAddr),
      eligibility_conditions: null,
      eligibility_verified: false,
      classification_method: 'API 자동 수집',
      classification_status: '확인필요',
      last_collected_at: iso,
    },
    detail: { policy_id: policyId, ...cfg.detail(topic) },
    source: {
      policy_id: policyId,
      source_name: '온통청년',
      source_type: 'API',
      external_id: `youthcenter:${row.plcyNo}`,
      source_url: ENDPOINT,
      raw_data: row,
      last_checked_at: iso,
    },
    region: scopeOf(row),
    subcategoryName: cfg.subcategory(topic),
  };
}
