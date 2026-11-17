// Public policy fields only. The score is independent of the viewer's eligibility.
export const SIMILARITY_WEIGHTS = Object.freeze({
  category: 25, subcategory: 20, benefit: 20, target: 15, conditions: 15, region: 5,
});
export const DEFAULT_SIMILARITY_MIN_SCORE = 38;
export const DEFAULT_SIMILARITY_LIMIT = 2; // Existing detail section has two cards.

const CONCEPTS = {
  employment: /취업|구직|고용|일자리|직업|채용/u,
  startup: /창업|사업화|창업자/u,
  training: /교육|훈련|강좌|학습|역량강화/u,
  counseling: /상담|컨설팅|멘토링/u,
  internship: /인턴|현장실습|실무경험/u,
  housing: /주택|임대|입주|주거/u,
  rent: /월세|임차료|주거비/u,
  deposit: /전세|보증금/u,
  moving: /이사비|이전비/u,
  utilities: /교통비|공과금|에너지비/u,
  scholarship: /장학금|등록금|학자금/u,
  loan: /대출|융자|이자지원|금리/u,
  saving: /저축|적금|자산형성/u,
  livelihood: /생활비|생계비|생활지원/u,
  culture: /문화|예술|공연|전시/u,
  creation: /창작|제작|작품활동/u,
  demolition: /철거|슬레이트|지붕개량/u,
  student: /대학생|재학생|학생/u,
  jobseeker: /취업준비|구직자|미취업|실업/u,
  worker: /근로자|재직자|직장인/u,
  artist: /예술인|예술가|문화인/u,
  newlywed: /신혼부부|예비부부/u,
  tenant: /임차인|세입자/u,
  homeless: /무주택/u,
  smallbusiness: /소상공인|자영업자/u,
  lowincome: /저소득|기초생활|수급자|차상위/u,
};
const GENERIC = /^(?:청년|부산|부산광역시|전국|지원|지원사업|사업|정책|모집|신청|대상|개인|제공|운영|확인|기타|프로그램|서비스|참여|활동|202[0-9]년?)$/u;

function terms(text) {
  const value = String(text ?? '').slice(0, 700);
  const found = new Set();
  for (const [concept, pattern] of Object.entries(CONCEPTS)) if (pattern.test(value)) found.add(`concept:${concept}`);
  for (const word of value.match(/[\p{Script=Hangul}A-Za-z0-9]{3,}/gu) ?? []) {
    const clean = word.toLocaleLowerCase('ko-KR');
    if (!GENERIC.test(clean) && !/^\d+$/u.test(clean)) found.add(`word:${clean}`);
  }
  return found;
}

function shared(a, b) {
  return [...a].filter((term) => b.has(term));
}

function textSimilarity(a, b, maximum) {
  const aTerms = terms(a);
  const bTerms = terms(b);
  if (!aTerms.size || !bTerms.size) return { points: 0, shared: [], missing: true };
  const common = shared(aTerms, bTerms);
  const concepts = common.filter((term) => term.startsWith('concept:'));
  const words = common.filter((term) => term.startsWith('word:'));
  const weighted = Math.min(1, (concepts.length * 2 + words.length) /
    Math.max(2, Math.min(aTerms.size, bTerms.size, 5)));
  return { points: common.length ? Math.round(maximum * weighted) : 0,
    shared: [...concepts, ...words].slice(0, 4).map((term) => term.split(':')[1]), missing: false };
}

function conditionSignatures(policy) {
  if (policy.eligibility_verified !== true) return [];
  const found = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const op = String(node.op ?? node.operator ?? '').toLowerCase();
    if (node.field && ['eq', 'in', 'between', 'gte', 'lte', 'contains', 'starts_with'].includes(op) && node.value != null)
      found.add(`${node.field}:${op}:${JSON.stringify(node.value)}`);
    for (const key of ['all', 'any', 'required', 'conditions']) visit(node[key]);
  };
  visit(policy.eligibility_conditions);
  if (Number.isInteger(policy.min_age) && Number.isInteger(policy.max_age))
    found.add(`age:${policy.min_age}-${policy.max_age}`);
  if (policy.income_condition) found.add(`income:${String(policy.income_condition).trim()}`);
  return [...found];
}

function regionPoints(base, candidate) {
  const a = base.region_codes ?? [];
  const b = candidate.region_codes ?? [];
  if (!a.length || !b.length) return { points: 0, missing: true };
  if (a.some((code) => b.includes(code))) return { points: 5, missing: false };
  if (a.includes('KR') || b.includes('KR')) return { points: 2, missing: false };
  if (a.some((code) => b.some((other) => code.startsWith(other) || other.startsWith(code))))
    return { points: 3, missing: false };
  return { points: 0, missing: false };
}

export function scorePolicySimilarity(base, candidate) {
  const breakdown = Object.fromEntries(Object.keys(SIMILARITY_WEIGHTS).map((key) => [key, 0]));
  const reasons = [];
  const data_gaps = [];
  if (base.category_id && base.category_id === candidate.category_id) {
    breakdown.category = 25;
    reasons.push(`대분류 일치: ${base.category_name ?? base.category_id}`);
  }
  const sameSubcategory = (base.subcategories ?? []).filter((name) => candidate.subcategories?.includes(name));
  if (sameSubcategory.length) {
    breakdown.subcategory = 20;
    reasons.push(`소분류 일치: ${sameSubcategory.join(', ')}`);
  } else if (!base.subcategories?.length || !candidate.subcategories?.length) data_gaps.push('소분류');

  const aBenefit = [base.support_summary, base.support_content, base.benefit_type].filter(Boolean);
  const bBenefit = [candidate.support_summary, candidate.support_content, candidate.benefit_type].filter(Boolean);
  const benefit = textSimilarity(
    aBenefit.length ? [base.title, ...aBenefit].join(' ') : '',
    bBenefit.length ? [candidate.title, ...bBenefit].join(' ') : '', 20);
  breakdown.benefit = benefit.points;
  if (benefit.points) reasons.push(`지원 목적·내용·혜택 키워드: ${benefit.shared.join(', ')}`);
  if (benefit.missing) data_gaps.push('지원 내용·혜택');

  const target = textSimilarity(base.target_summary, candidate.target_summary, 15);
  breakdown.target = target.points;
  if (target.points) reasons.push(`지원 대상 키워드: ${target.shared.join(', ')}`);
  if (target.missing) data_gaps.push('지원 대상');

  const aConditions = conditionSignatures(base);
  const bConditions = conditionSignatures(candidate);
  if (aConditions.length && bConditions.length) {
    const matching = shared(new Set(aConditions), new Set(bConditions));
    breakdown.conditions = Math.round(15 * matching.length / Math.min(aConditions.length, bConditions.length));
    if (breakdown.conditions) reasons.push(`검증된 신청 조건 ${matching.length}개 일치`);
  } else data_gaps.push('검증된 신청 조건');

  const region = regionPoints(base, candidate);
  breakdown.region = region.points;
  if (region.points) reasons.push(region.points === 5 ? '지원 지역 일치' : '지원 지역 범위 겹침');
  if (region.missing) data_gaps.push('지원 지역');

  return { score: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
    score_breakdown: breakdown, reasons, data_gaps,
    substantive_score: breakdown.benefit + breakdown.target + breakdown.conditions };
}

export function similarityThreshold(value = process.env.POLICY_SIMILARITY_MIN_SCORE) {
  if (value == null || value === '') return DEFAULT_SIMILARITY_MIN_SCORE;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : DEFAULT_SIMILARITY_MIN_SCORE;
}

export function normalizedPolicyTitle(title) {
  return String(title ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function compareSimilarPolicies(a, b) {
  const aBand = Math.floor(a.similarity_score / 5);
  const bBand = Math.floor(b.similarity_score / 5);
  if (aBand !== bBand) return bBand - aBand;
  const closed = (p) => p.recruitment_status === '마감' ? 1 : 0;
  if (closed(a) !== closed(b)) return closed(a) - closed(b);
  const eligibility = { ELIGIBLE: 0, CHECK: 1, INELIGIBLE: 2 };
  if (eligibility[a.eligibility_result] !== eligibility[b.eligibility_result])
    return eligibility[a.eligibility_result] - eligibility[b.eligibility_result];
  const status = { '모집 중': 0, '상시': 1, '모집 예정': 2, '기간 미정': 3, '마감': 4 };
  if (status[a.recruitment_status] !== status[b.recruitment_status])
    return (status[a.recruitment_status] ?? 5) - (status[b.recruitment_status] ?? 5);
  const deadline = (p) => p.application_end_date ?? '9999-12-31';
  return deadline(a).localeCompare(deadline(b)) ||
    a.title.localeCompare(b.title, 'ko-KR') || a.policy_id.localeCompare(b.policy_id);
}
