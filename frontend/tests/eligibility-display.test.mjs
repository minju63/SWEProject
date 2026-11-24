import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge } from '../../backend/src/services/eligibility.service.js';
import { displayConditions } from '../src/pages/common/eligibilityDisplay.js';

test('internal RAW text is human-readable and exact duplicate is hidden only in display', () => {
  const raw = { operator: 'RAW', text: '본인의 주택 소유 여부: false. 기준·대상 범위와 예외는 공식 공고 확인 필요.', status: 'UNKNOWN' };
  const structured = { field: 'owns_home', subject: 'applicant', operator: 'EQ', value: false, status: 'SATISFIED' };
  const conditions = [raw, structured];
  assert.deepEqual(displayConditions(conditions).required, [{ label: '본인 무주택', status: 'SATISFIED' }]);
  assert.equal(conditions.length, 2);
  assert.deepEqual(displayConditions([raw]).required, [{ label: '본인 무주택', status: 'UNKNOWN' }]);
  assert.equal(displayConditions([{ ...raw, text: `${raw.text} 별도 예외 심사 필요` }, structured]).required.length, 2);
});

test('nested AND is flattened and the matching youth rent OR stays one uncertain group', () => {
  const leaf = (field, subject, operator, value) => ({ field, subject, operator, value, status: 'UNKNOWN' });
  const group = { operator: 'OR', status: 'UNKNOWN', children: [
    { operator: 'AND', children: [leaf('recognized_income_to_median_ratio', 'original_household', 'LTE', 1), leaf('assets', 'original_household', 'LTE', 470000000)] },
    leaf('age', 'applicant', 'GTE', 30), leaf('is_married', 'applicant', 'EQ', true),
    leaf('is_single_parent', 'applicant', 'EQ', true),
    { operator: 'AND', children: [leaf('income_to_median_ratio', 'applicant', 'GTE', .5), leaf('independent_livelihood_approved', 'authority', 'EQ', true)] },
  ] };
  const shown = displayConditions([{ operator: 'AND', children: [leaf('assets', 'youth_household', 'LTE', 122000000), group] }], '2026년 청년월세 지원');
  assert.deepEqual(shown.required, [
    { label: '청년가구 재산 1억 2,200만 원 이하', status: 'UNKNOWN' },
    { label: '원가구 소득·재산 기준 또는 심사 면제', status: 'UNKNOWN' },
  ]);
  // 일반 OR 묶음은 "하나만 충족" 안내와 함께 하위 조건을 그대로 보여준다.
  const generic = displayConditions([group], '다른 정책').required[0];
  assert.equal(generic.label, '아래 중 하나만 충족하면 돼요');
  assert.ok(generic.anyOf.length >= 2);
});

test('exclusion reasons split outside parentheses and remain unknown', () => {
  const shown = displayConditions([{ exclusion: true, operator: 'MANUAL_REVIEW', status: 'UNKNOWN',
    text: '공공임대 거주(예외 A; 예외 B);타 월세지원 수급 중;이미 24회 수급' }]);
  assert.deepEqual(shown.exclusions, [
    { label: '공공임대 거주(예외 A; 예외 B)', status: 'UNKNOWN' },
    { label: '타 월세지원 수급 중', status: 'UNKNOWN' },
    { label: '이미 24회 수급', status: 'UNKNOWN' },
  ]);
});

test('review memo is hidden but an unknown placeholder remains', () => {
  const shown = displayConditions([{ operator: 'MANUAL_REVIEW', status: 'UNKNOWN',
    text: '구조화한 일부 조건만으로 전체 자격 충족을 판정하지 않음; 원문 전체 증빙·예외 심사 필요' }]);
  assert.deepEqual(shown.required, [{ label: '세부 자격 확인 필요', status: 'UNKNOWN' }]);
});

test('saved 2026 youth rent policy keeps CHECK and shows each exclusion separately', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/housing-profile.json', import.meta.url), 'utf8'))[3].before;
  const evaluated = judge(fixture, {}, new Date('2026-11-18T00:00:00Z'));
  const shown = displayConditions(evaluated.conditions, fixture.title);
  assert.equal(evaluated.result, 'CHECK');
  assert.equal(shown.required.length, 6);
  assert.equal(shown.exclusions.length, 7);
  assert.equal(shown.required[5].label, '원가구 소득·재산 기준 또는 심사 면제');
  assert.ok([...shown.required, ...shown.exclusions].every((item) =>
    item.status === 'UNKNOWN' && !/\b(?:AND|OR|RAW|MANUAL_REVIEW)\b/u.test(item.label)));
});
