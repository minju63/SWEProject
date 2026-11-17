import { SEARCH_SUBCATEGORIES } from '../constants/policySubcategories.js';
import { findSuggestionIndex } from '../repositories/policy.repository.js';
import { AppError } from '../utils/response.js';
import { normalizedPolicyTitle } from './policy-similarity.service.js';

// 실제 정책명에 등장하는 관련어만 확장에 사용한다. 결과는 매 요청마다 DB 색인과 대조한다.
const RELATED_GROUPS = [
  ['일자리', '취업', '구직', '고용', '채용'],
  ['월세', '주거비'],
  ['장학', '장학금', '학자금'],
  ['문화', '문화예술', '예술'],
];
const SEARCH_PHRASES = ['취업 지원', '청년 취업', '월세 지원', '청년 주거'];
const ko = new Intl.Collator('ko-KR');
const normalize = (text) => String(text ?? '').normalize('NFC').trim().toLocaleLowerCase('ko-KR');

function expandedTerms(query, records) {
  const terms = new Set();
  for (const group of RELATED_GROUPS) {
    if (!group.some((term) => query.includes(term) || term.includes(query))) continue;
    for (const term of group) {
      if (term !== query && records.some((row) => normalize(row.title).includes(term) ||
        row.keywords.some((value) => normalize(value).includes(term)))) terms.add(term);
    }
  }
  return [...terms];
}

function policyMatch(row, query, synonyms) {
  const title = normalize(row.title);
  if (title === query) return { rank: 0, match: query };
  if (title.startsWith(query)) return { rank: 1, match: query };
  if (title.includes(query)) return { rank: 2, match: query };
  if (row.keywords.some((value) => normalize(value).includes(query))) return { rank: 3, match: query };
  if ([row.category_name, ...row.subcategories].some((value) => normalize(value).includes(query)))
    return { rank: 4, match: query };
  const synonym = synonyms.find((term) => title.includes(term) ||
    row.keywords.some((value) => normalize(value).includes(term)) ||
    [row.category_name, ...row.subcategories].some((value) => normalize(value).includes(term)));
  return synonym ? { rank: 5, match: synonym } : null;
}

export function rankPolicySuggestions(records, rawQuery, { basePolicyId = null, limit = 8, minLength = 2 } = {}) {
  const query = normalize(rawQuery);
  if ([...query].length < minLength) return { relatedSearches: [], policies: [] };
  const baseTitle = basePolicyId ? normalizedPolicyTitle(records.find((row) => row.policy_id === basePolicyId)?.title) : '';
  const synonyms = expandedTerms(query, records);
  const terms = [...new Set([...SEARCH_PHRASES, ...Object.values(SEARCH_SUBCATEGORIES).flat()])];
  const relatedSearches = terms.filter((term) => normalize(term) !== query &&
    !records.some((row) => normalize(row.title) === normalize(term)) &&
    records.some((row) => normalize(row.title).includes(normalize(term)) ||
      row.subcategories.some((subcategory) => normalize(subcategory) === normalize(term))))
    .map((text) => {
      const normalized = normalize(text);
      const match = normalized.includes(query) ? query : synonyms.find((term) => normalized.includes(term));
      return match ? { text, match, rank: normalized.startsWith(query) ? 0 : normalized.includes(query) ? 1 : 2 } : null;
    }).filter(Boolean)
    .sort((a, b) => a.rank - b.rank || ko.compare(a.text, b.text))
    .slice(0, Math.min(3, limit))
    .map(({ text, match }) => ({ text, match }));
  const available = limit - relatedSearches.length;
  const seenTitles = new Set();
  const policies = records.filter((row) => row.policy_id !== basePolicyId &&
    (!baseTitle || normalizedPolicyTitle(row.title) !== baseTitle))
    .map((row) => ({ row, found: policyMatch(row, query, synonyms) }))
    .filter(({ found }) => found)
    .sort((a, b) => a.found.rank - b.found.rank ||
      ko.compare(a.row.title, b.row.title) || a.row.policy_id.localeCompare(b.row.policy_id))
    .filter(({ row }) => {
      const title = normalize(row.title);
      if (seenTitles.has(title)) return false;
      seenTitles.add(title);
      return true;
    })
    .slice(0, available)
    .map(({ row, found }) => ({ policy_id: row.policy_id, title: row.title,
      category_name: row.category_name, match: found.match }));
  return { relatedSearches, policies };
}

export async function suggestPolicies({ q, context = 'search', basePolicyId }) {
  if (typeof q !== 'string' || [...q].length > 80)
    throw new AppError(400, 'INVALID_QUERY', '검색어는 80자 이내로 입력해 주세요.');
  if (!['search', 'compare'].includes(context))
    throw new AppError(400, 'INVALID_CONTEXT', '검색 문맥을 확인해 주세요.');
  if (context === 'compare' && basePolicyId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(basePolicyId))
    throw new AppError(400, 'INVALID_POLICY_ID', '기준 정책을 확인해 주세요.');
  if ([...q.trim()].length < 1)
    return { relatedSearches: [], policies: [] };
  return rankPolicySuggestions(await findSuggestionIndex(), q,
    { basePolicyId: context === 'compare' ? basePolicyId : null, minLength: 1 });
}
