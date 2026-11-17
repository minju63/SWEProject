import test from 'node:test';
import assert from 'node:assert/strict';
import { rankPolicySuggestions, suggestPolicies } from '../src/services/policy-suggestion.service.js';

const record = (id, title, extra = {}) => ({ policy_id: id, title,
  category_name: '취업·진로', keywords: [], subcategories: [], ...extra });

test('자동완성은 실제 정책의 직접 일치, 키워드, 분야, 검증된 관련어 순으로 정렬한다', () => {
  const records = [
    record('synonym', '취업 지원 안내'),
    record('facet', '진로 상담', { subcategories: ['일자리 교육'] }),
    record('keyword', '직업 교육', { keywords: ['일자리 정보'] }),
    record('contains', '청년 일자리 연결'),
    record('prefix', '일자리 연결'),
    record('exact', '일자리'),
    record('z-duplicate', '일자리 연결'),
  ];
  const result = rankPolicySuggestions(records, '일자리', { limit: 20 });
  assert.deepEqual(result.policies.map((item) => item.policy_id),
    ['exact', 'prefix', 'contains', 'keyword', 'facet', 'synonym']);
  assert.ok(result.relatedSearches.some((item) => item.text === '취업 지원'));
  assert.equal(new Set(result.policies.map((item) => item.title)).size, result.policies.length);
  assert.equal(rankPolicySuggestions(records, '일').policies.length, 0);
  assert.equal(rankPolicySuggestions(records, "' OR 1=1 --").policies.length, 0);
});

test('비교 자동완성은 기준 정책을 제외하고 최대 8개만 반환한다', () => {
  const records = Array.from({ length: 12 }, (_, index) => record(`p${index}`, `청년 정책 ${index}`));
  records.push(record('same-title', '청년-정책 0'));
  const result = rankPolicySuggestions(records, '청년', { basePolicyId: 'p0' });
  assert.ok(result.relatedSearches.length + result.policies.length <= 8);
  assert.ok(result.policies.every((item) => !['p0', 'same-title'].includes(item.policy_id)));
});

test('빈 검색어와 잘못된 문맥·기준 ID는 DB 조회 전에 처리한다', async () => {
  assert.deepEqual(await suggestPolicies({ q: '일' }), { relatedSearches: [], policies: [] });
  await assert.rejects(suggestPolicies({ q: '일자리', context: 'unknown' }),
    (error) => error.status === 400);
  await assert.rejects(suggestPolicies({ q: '일자리', context: 'compare', basePolicyId: 'bad-id' }),
    (error) => error.status === 400);
});
