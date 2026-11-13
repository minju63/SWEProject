/*
 * 문화 정책(온통청년) 원본 비교 (SRS DATA-SRCH-01, FR-COM-06)
 * DB 문화 정책은 온통청년 원본에 사람이 자격 조건·서류·절차를 정리해 더한 것이라 원본으로 덮어쓰지 않는다.
 *   - 자동 반영: 신청 기간·신청 주소·원문 주소·지원 내용·신청 방법·운영 기간.
 *     원본이 바뀌었고 DB 값이 지난번 원본에서 만든 값 그대로일 때만 바꾼다 (다르면 사람이 고친 것이므로 기록만).
 *   - 기록만: 정책명·지원 나이·제출 서류·참여 대상·승인 상태 변경, 원본과 연결 못 한 정책, 원본에서 사라진 정책, 새 정책 후보.
 * 지난번 원본은 policy_source.raw_data 에 둔다 (README DB 규칙 3: API 원본은 raw_data 에 그대로).
 * 원본 → DB 값 규칙은 처음 수집(busan-culture-api/cleanup/youthBuild.js)과 같다.
 */
import { kstEnd, kstStart } from './mapping.js';
import { text } from './normalize.js';

const one = (v) => text(String(v ?? '').replace(/\s+/g, ' '));
const dash = (d) => {
  const s = String(d ?? '').replace(/\D/g, '');
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
};
const link = (v) => {
  const s = one(v);
  return s && /^https?:\/\//i.test(s) ? s : null;
};
const applyPeriod = (x) =>
  String(x.aplyYmd ?? '')
    .split('~')
    .map(dash);

// 원본 → DB 값. 'detail.' 은 culture_detail 컬럼
export const POLICY_FIELDS = {
  application_start_date: (x) => applyPeriod(x)[0] ?? null,
  application_end_date: (x) => applyPeriod(x)[1] ?? null,
  application_url: (x) => link(x.aplyUrlAddr),
  official_url: (x) => link(x.refUrlAddr1 || x.refUrlAddr2 || x.aplyUrlAddr),
  support_content: (x) => one(x.plcySprtCn),
  application_method: (x) => one(x.plcyAplyMthdCn),
  'detail.event_start_at': (x) => kstStart(dash(x.bizPrdBgngYmd)),
  'detail.event_end_at': (x) => kstEnd(dash(x.bizPrdEndYmd)),
};
const LABEL = {
  application_start_date: '신청 시작일',
  application_end_date: '신청 마감일',
  application_url: '신청 주소',
  official_url: '원문 주소',
  support_content: '지원 내용',
  application_method: '신청 방법',
  'detail.event_start_at': '운영 시작일',
  'detail.event_end_at': '운영 종료일',
};
// 사람이 정리한 값의 근거라 바뀌면 기록만 하는 원본 항목
const WATCH = {
  plcyNm: '정책명',
  sprtTrgtMinAge: '최소 나이',
  sprtTrgtMaxAge: '최대 나이',
  sprtTrgtAgeLmtYn: '나이 제한 여부',
  sbmsnDcmntCn: '제출 서류',
  ptcpPrpTrgtCn: '참여 대상',
  addAplyQlfcCndCn: '추가 자격',
  earnEtcCn: '소득 조건',
  plcyAprvSttsCd: '승인 상태',
};

const time = (v) => (v ? new Date(v).getTime() : null);
const same = (field, a, b) =>
  field.startsWith('detail.') ? time(a) === time(b) : (a ?? null) === (b ?? null);
const show = (v) => {
  if (v === null || v === undefined || v === '') return '(없음)';
  const s = String(v).replace(/T.*$/, ''); // 시각은 날짜만
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
};
const isApiItem = (raw) => !!(raw?.plcyNo && raw?.plcyNm);
const normTitle = (s) => (one(s) ?? '').replace(/[\s'"‘’“”()（）]/g, '');

// ---------------- 지역·기간 (처음 수집 busan-culture-api/cleanup/youthStages.js 와 같은 규칙) ----------------
// prettier-ignore
const SIDO = ['서울', '인천', '대구', '광주', '대전', '울산', '세종', '경기', '강원', '충청', '충북', '충남', '전라', '전북', '전남', '경상', '경북', '경남', '제주'];
const MINISTRY =
  /(문화체육관광부|국가보훈부|보건복지부|고용노동부|교육부|행정안전부|여성가족부|국토교통부|산업통상자원부|중소벤처기업부|해양수산부|농림축산식품부|과학기술정보통신부|기획재정부)/;
const agencies = (x) =>
  [x.sprvsnInstCdNm, x.operInstCdNm, x.rgtrInstCdNm, x.rgtrUpInstCdNm, x.rgtrHghrkInstCdNm]
    .filter(Boolean)
    .join(' | ');

// '부산/구' | '전국' | '타 시도' | '부산 타 구·군' | '분류불가'
export function region(x) {
  const t = agencies(x);
  if (MINISTRY.test(String(x.sprvsnInstCdNm ?? ''))) return '전국';
  const busan = /부산(광역시|시)|부산진구|사하구/.test(t);
  const otherGu =
    /(금정|해운대|동래|연제|수영|사상|강서|영도|기장)(구|군)/.test(t) && !/부산진구|사하구/.test(t);
  const otherSido = (SIDO.some((s) => t.includes(s)) || /남동구/.test(t)) && !/부산/.test(t);
  if (busan && !otherSido) return '부산/구';
  if (otherGu) return '부산 타 구·군';
  if (otherSido) return '타 시도';
  const zips = String(x.zipCd ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (zips.length && zips.length < 100 && zips.every((c) => c.slice(0, 2) === zips[0].slice(0, 2)))
    return zips[0].startsWith('26') ? '부산 타 구·군' : '타 시도';
  return '분류불가';
}

// 사업 종료 후 1년이 지난 정책은 후보에서 뺀다
function periodPass(x, today8) {
  const end = String(x.bizPrdEndYmd ?? '');
  if (!/^\d{8}$/.test(end)) return true;
  const limit = `${Number(today8.slice(0, 4)) - 1}${today8.slice(4)}`;
  return end >= limit;
}

// 처음 수집 때 일부러 뺀 정책 (youthBuild.js EXCLUDE)
const EXCLUDE = /온나청년패스|청년문화축제|스텝업댄스페스티벌|발달장애인문화예술학교|금정구|남동구/;

// ---------------- 연결 ----------------
/*
 * DB 정책 → 원본: 지난번 원본의 정책 번호 → 정책명이 같은 원본
 * 같은 이름이 여러 개면 처음 수집과 같이 부산·전국 정책 중 가장 최근에 고친 것.
 * 원본 하나에 DB 정책이 여럿 붙으면 모두 연결하지 않는다 (DB 중복 정책 확인 대상).
 */
function linkPolicies(policies, items) {
  const byNo = new Map(items.map((x) => [x.plcyNo, x]));
  const byTitle = new Map();
  for (const x of items)
    byTitle.set(normTitle(x.plcyNm), [...(byTitle.get(normTitle(x.plcyNm)) ?? []), x]);
  const links = new Map();
  for (const p of policies) {
    const no = isApiItem(p.raw) ? p.raw.plcyNo : null;
    if (no && byNo.has(no)) {
      links.set(p.policy_id, { item: byNo.get(no), how: 'number' });
      continue;
    }
    const candidates = byTitle.get(normTitle(p.title)) ?? [];
    const pick =
      candidates.length === 1
        ? candidates[0]
        : candidates
            .filter((x) => ['부산/구', '전국'].includes(region(x)))
            .sort(
              (a, b) =>
                String(b.lastMdfcnDt ?? '').localeCompare(String(a.lastMdfcnDt ?? '')) ||
                String(b.plcyNo).localeCompare(String(a.plcyNo))
            )[0];
    if (pick) links.set(p.policy_id, { item: pick, how: 'title' });
  }
  const shared = new Map();
  for (const [id, l] of links)
    shared.set(l.item.plcyNo, [...(shared.get(l.item.plcyNo) ?? []), id]);
  const duplicated = new Set([...shared.values()].filter((ids) => ids.length > 1).flat());
  for (const id of duplicated) links.delete(id);
  return { links, duplicated };
}

// ---------------- 비교 ----------------
export function planPolicySync(policies, items, today) {
  const today8 = today.replace(/-/g, '');
  const { links, duplicated } = linkPolicies(policies, items);
  const updates = [];
  const issues = [];
  const stat = { number: 0, title: 0, unlinked: 0 };

  for (const p of policies) {
    const ref = {
      ref_type: 'policy',
      ref_key: p.external_id,
      policy_id: p.policy_id,
      name: p.title,
    };
    const l = links.get(p.policy_id);
    if (!l) {
      stat.unlinked += 1;
      const hadSource = isApiItem(p.raw);
      issues.push({
        ...ref,
        issue_type: hadSource ? 'policy_missing_in_source' : 'policy_unlinked',
        detail: duplicated.has(p.policy_id)
          ? '같은 원본에 DB 정책이 여러 개 연결됨 (DB 중복 정책인지 확인)'
          : hadSource
            ? `온통청년에서 정책 번호 ${p.raw.plcyNo} 와 같은 이름의 정책을 찾지 못함 (종료·삭제 확인)`
            : '온통청년에서 같은 이름의 정책을 찾지 못함 (수동 입력 정책이면 무시)',
      });
      continue;
    }
    stat[l.how] += 1;
    const base = isApiItem(p.raw) ? p.raw : null;
    const now = l.item;
    const changes = {};
    const firstDiffs = [];
    const kept = [];
    for (const [field, map] of Object.entries(POLICY_FIELDS)) {
      const next = map(now);
      const cur = p.values[field];
      if (!base) {
        if (!same(field, cur, next))
          firstDiffs.push(`${LABEL[field]}: DB ${show(cur)} / 원본 ${show(next)}`);
        continue;
      }
      const prev = map(base);
      if (same(field, prev, next)) continue; // 원본이 그대로
      if (same(field, cur, prev)) changes[field] = next;
      else
        kept.push(
          `${LABEL[field]}: 원본 ${show(prev)} → ${show(next)} (사람이 고친 DB 값 ${show(cur)} 유지)`
        );
    }
    if (base)
      for (const [k, label] of Object.entries(WATCH))
        if ((one(base[k]) ?? null) !== (one(now[k]) ?? null))
          kept.push(`${label}: 원본 ${show(one(base[k]))} → ${show(one(now[k]))} (반영 안 함)`);
    // 신청 기간이 거꾸로 되면 반영하지 않는다
    const start = changes.application_start_date ?? p.values.application_start_date;
    const end = changes.application_end_date ?? p.values.application_end_date;
    if (start && end && start > end) {
      kept.push(`신청 기간 역전(${start} > ${end})이라 반영 안 함`);
      delete changes.application_start_date;
      delete changes.application_end_date;
    }
    if (firstDiffs.length)
      issues.push({
        ...ref,
        issue_type: 'source_differs',
        detail: `처음 비교에서 원본(${now.plcyNo})과 다른 값: ${firstDiffs.join(' / ')}`,
      });
    if (kept.length)
      issues.push({ ...ref, issue_type: 'source_changed', detail: kept.join(' / ') });
    updates.push({
      policy_id: p.policy_id,
      external_id: p.external_id,
      title: p.title,
      changes,
      raw: now,
    });
  }

  // 새 정책 후보: 처음 수집과 같은 조건 (문화활동, 승인, 부산·전국, 종료 후 1년 이내, 제외 목록 밖)
  const linkedNos = new Set([...links.values()].map((l) => l.item.plcyNo));
  const titles = new Set(policies.map((p) => normTitle(p.title)));
  for (const x of items) {
    if (!/^문화활동/.test(x.mclsfNm ?? '') || x.plcyAprvSttsCd !== '0044002') continue;
    const scope = region(x);
    if (!['부산/구', '전국'].includes(scope) || !periodPass(x, today8)) continue;
    if (EXCLUDE.test(`${x.plcyNm} ${agencies(x)}`)) continue;
    if (linkedNos.has(x.plcyNo) || titles.has(normTitle(x.plcyNm))) continue;
    issues.push({
      ref_type: 'policy',
      ref_key: x.plcyNo,
      policy_id: null,
      name: one(x.plcyNm),
      issue_type: 'policy_new_candidate',
      detail: `${scope} · ${one(x.sprvsnInstCdNm) ?? '기관 미기재'} · 사업 기간 ${show(dash(x.bizPrdBgngYmd))}~${show(dash(x.bizPrdEndYmd))} (자격·서류 정리 후 추가)`,
    });
  }
  return { updates, issues, stat };
}
