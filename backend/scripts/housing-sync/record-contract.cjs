'use strict';
// Shared by automatic and reviewed imports. No live DB updates or inferred eligibility.
const { plain, normalize, sha, safePublicUrl } = require('./core.cjs');
const { isProgramUrl } = require('./program-url.cjs');
const { describe } = require('../../../shared/housing-condition-labels.cjs');
const CONTRACT_VERSION = 'housing-import/3';
const notice = '전체 신청 자격은 공식 공고의 조건·예외와 함께 확인해 주세요.';
const internal = /\b(?:true|false|[a-z]+_[a-z_]+)\b/;
const text = (value) =>
  plain(value || '')
    .replace(/\s+/g, ' ')
    .trim();
function officialProgramUrl(url, allowedHosts = require('./config.json').allowedHosts) {
  if (!isProgramUrl(url)) return false;
  try {
    safePublicUrl(url, allowedHosts);
    return true;
  } catch {
    return false;
  }
}
function sourceBody(source) {
  return plain(source.extracted_text || source.body || '');
}
function display(value) {
  const t = text(value);
  return internal.test(t) ? '세부 자격은 공식 공고에서 확인해 주세요.' : t;
}
function conditions(input = {}, source, sourceIds = []) {
  const checkedAt = source.checked_at || new Date().toISOString(),
    url = source.source_url;
  const normalizeNode = (node) => {
    if (!node || typeof node !== 'object') throw Error('Invalid housing condition');
    if (['AND', 'OR'].includes(node.operator)) {
      if (!Array.isArray(node.conditions) || !node.conditions.length)
        throw Error('Empty housing condition group');
      const children = node.conditions.map(normalizeNode);
      return {
        ...node,
        label: node.operator === 'AND' ? '다음 조건을 모두 충족' : '다음 중 하나에 해당',
        conditions: [
          ...new Map(children.map((n) => [JSON.stringify(n.original_condition || n), n])).values(),
        ],
      };
    }
    const original = node.original_condition || node;
    let label = display(node.label || node.text);
    if (original.field) {
      try {
        label = describe(original);
      } catch {
        label = '세부 자격은 공식 공고에서 확인해 주세요.';
      }
    }
    if (!label) throw Error('Housing condition requires source text');
    return {
      operator: 'RAW',
      text: label,
      label,
      source_url: url,
      checked_at: checkedAt,
      reason: '공식 공고의 전체 조건·예외 대조 및 수동 확인 필요',
      original_condition: structuredClone(original),
    };
  };
  const dedup = (rows) => [
    ...new Map(rows.map((n) => [JSON.stringify(n.original_condition || n), n])).values(),
  ];
  const notices = [...(input.review_notices || []).map(display), notice];
  const metadata =
    /현재 앱 판정기|자동 적합 승인 금지|전체 자격.*판정하지|프로필 입력 항목.*판정기 코드/;
  const clean = (node) => {
    if (metadata.test(node.text || '')) {
      notices.push(notice);
      return null;
    }
    if (node.conditions) {
      const children = node.conditions.map(clean).filter(Boolean);
      return children.length ? { ...node, conditions: children } : null;
    }
    return node;
  };
  const required = dedup((input.required || []).map(clean).filter(Boolean).map(normalizeNode));
  const exclusions = dedup(
    (input.exclusions || [])
      .map(clean)
      .filter(Boolean)
      .flatMap((n) => {
        // A group keeps its AND/OR relationship; split only an unstructured list of exclusions.
        if (
          !n.field &&
          !n.original_condition?.field &&
          !n.conditions &&
          typeof n.text === 'string' &&
          n.text.includes(';')
        )
          return n.text
            .split(';')
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => normalizeNode({ ...n, text: t, label: t }));
        return [normalizeNode(n)];
      })
  );
  return {
    schema_version: 'eligibility/2',
    presentation_version: 'housing-conditions/2',
    logic: 'UNVERIFIED',
    required,
    exclusions,
    review_notices: [...new Set(notices)],
    source_url: url,
    source_urls: [url],
    source_ids: sourceIds,
    checked_at: checkedAt,
    source_evidence: [
      {
        source_url: url,
        checked_at: checkedAt,
        body_sha256: source.stored_body_sha256 || sha(sourceBody(source)),
        status: 'FETCHED_NOT_FULLY_VERIFIED',
        original_text_excerpt: sourceBody(source).slice(0, 2000),
      },
    ],
    review_ir: {
      required: structuredClone(input.required || []),
      exclusions: structuredClone(input.exclusions || []),
    },
    profile_contract: {
      version: 'housing-profile/1',
      mode: 'PARTIAL_REVIEW',
      checks: [],
      overall_verdict: 'CHECK',
      reason: notice,
    },
    condition_sections: [
      ['age', '나이·기준일'],
      ['residence', '거주지·대상 지역'],
      ['status', '지원 대상·현재 상태'],
      ['housing', '주거·계약 조건'],
      ['income', '소득·재산'],
      ['exclusions', '제외·중복지원'],
      ['exceptions', '유형별 예외·추가 확인'],
    ].map(([key, label]) => ({
      key,
      label,
      text: '공식 공고의 세부 기준 확인 필요',
      verification: 'NEEDS_REVIEW',
      rule_refs: [],
    })),
    verification: { status: 'UNVERIFIED', note: '형식 정리는 전체 자격 검증을 뜻하지 않습니다.' },
  };
}
function automaticConditions(row, source, ids) {
  const body = normalize(sourceBody(source));
  const confirmed = (value) => text(value) && body.includes(normalize(text(value)));
  const required = [row.sprtTrgtEtcCn, row.earnEtcCn, row.addAplyQlfcCndCn]
    .filter(confirmed)
    .map((value) => ({ operator: 'RAW', text: text(value) }));
  const exclusions = confirmed(row.ptcpPrpTrgtCn)
    ? [{ operator: 'RAW', text: text(row.ptcpPrpTrgtCn) }]
    : [];
  return {
    ...conditions({ required, exclusions }, source, ids),
    api_conditions: {
      age: row.sprtTrgtEtcCn || null,
      income: row.earnEtcCn || null,
      additional: row.addAplyQlfcCndCn || null,
      exclusions: row.ptcpPrpTrgtCn || null,
      application_period: row.aplyYmd || null,
    },
    collection: {
      method: 'AUTOMATIC_API_IMPORT',
      human_reviewed: false,
      scope_is_source_metadata: true,
    },
  };
}
function period(raw, source, parseDates) {
  const [start, end] = parseDates(raw),
    official = sourceBody(source),
    body = normalize(official);
  const split =
    /냉방[\s\S]*난방|난방[\s\S]*냉방|유형별.{0,20}(?:기간|기한).{0,20}(?:다름|상이)/.test(official);
  if (start && end && !split && body.includes(normalize(start)) && body.includes(normalize(end)))
    return {
      application_start_date: start,
      application_end_date: end,
      is_always_open: false,
      application_period_unknown_reason: /예산\s*소진/.test(official)
        ? '예산 소진 시 조기 마감될 수 있어요. 현재 접수 여부는 공식 공고에서 확인해 주세요.'
        : null,
    };
  return {
    application_start_date: null,
    application_end_date: null,
    is_always_open: false,
    application_period_unknown_reason:
      '신청기간 확인 필요\n' +
      (text(raw) ? '수집 참고 정보: ' + display(raw) + ' (공식 공고 대조 필요)\n' : '') +
      '현재 접수 여부와 유형별 신청기한은 공식 공고에서 확인해 주세요.',
  };
}
function assertRecord(policy, allowedHosts) {
  if (policy.collection_domain !== 'HOUSING' || policy.item_type !== 'POLICY')
    throw Error('Housing import scope mismatch');
  if (!officialProgramUrl(policy.official_url, allowedHosts))
    throw Error('Official program URL required');
  if (policy.application_url && !officialProgramUrl(policy.application_url, allowedHosts))
    throw Error('Official application URL required');
  const c = policy.eligibility_conditions;
  if (
    policy.eligibility_verified !== false ||
    c?.schema_version !== 'eligibility/2' ||
    !Array.isArray(c.required) ||
    !Array.isArray(c.exclusions) ||
    !Array.isArray(c.review_notices) ||
    !c.source_url ||
    !c.checked_at ||
    !c.source_evidence?.length ||
    ['all', 'any', 'exclude'].some((k) => Object.hasOwn(c, k))
  )
    throw Error('Housing eligibility contract mismatch');
  if (
    !policy.application_start_date &&
    !policy.application_end_date &&
    !policy.is_always_open &&
    !policy.application_period_unknown_reason
  )
    throw Error('Missing application period explanation');
  if (
    policy.application_period_unknown_reason != null &&
    typeof policy.application_period_unknown_reason !== 'string'
  )
    throw Error('Invalid application period explanation');
  for (const f of ['application_process', 'required_documents'])
    if (policy[f] != null && !Array.isArray(policy[f])) throw Error('Invalid ' + f + ' array');
  for (const step of policy.application_process || [])
    if (typeof step !== 'string' || !step.trim()) throw Error('Invalid application step');
  const keys = new Set();
  for (const doc of policy.required_documents || []) {
    if (
      !doc ||
      typeof doc.key !== 'string' ||
      !doc.key ||
      keys.has(doc.key) ||
      typeof doc.name !== 'string' ||
      !doc.name.trim() ||
      typeof doc.required !== 'boolean' ||
      typeof doc.confirmed !== 'boolean'
    )
      throw Error('Invalid required document');
    keys.add(doc.key);
  }
}
module.exports = {
  CONTRACT_VERSION,
  officialProgramUrl,
  conditions,
  automaticConditions,
  period,
  assertRecord,
};
