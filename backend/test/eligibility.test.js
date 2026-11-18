import test from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../src/services/eligibility.service.js';

const now = new Date('2026-11-16T15:30:00Z'); // 11월 17일 00:30 KST
const verified = (all, exclude = []) => ({
  eligibility_verified: true,
  official_url: 'https://example.org/policy',
  eligibility_conditions: { all, exclude },
});

test('KST 기준 만 나이와 검증된 필수 조건을 판정한다', () => {
  const policy = verified([{ field: 'age', op: 'between', value: [20, 34] },
    { field: 'region', op: 'starts_with', value: '26' }]);
  const result = judge(policy, { birth_date: '2006-11-17', region_code: '26380' }, now);
  assert.equal(result.result, 'ELIGIBLE');
  assert.deepEqual(result.conditions.map((item) => item.status), ['SATISFIED', 'SATISFIED']);
  assert.equal(result.conditions[0].evidence.profile_value, 20);
  assert.equal(result.conditions[0].evidence.source_url, policy.official_url);
  assert.ok(!JSON.stringify(result).includes('2006-11-17'));
});

test('확인된 불충족은 다른 조건이 불명확해도 INELIGIBLE이다', () => {
  const result = judge(verified([{ field: 'age', op: 'between', value: [20, 34] },
    { field: 'income', op: 'text', value: '기준 중위소득 확인' }]),
  { birth_date: '2007-01-01' }, now);
  assert.equal(result.result, 'INELIGIBLE');
  assert.deepEqual(result.conditions.map((item) => item.status), ['UNSATISFIED', 'UNKNOWN']);
});

test('누락된 사용자 값과 소득 원문은 추측하지 않고 CHECK로 둔다', () => {
  const policy = { ...verified([{ field: 'housing_type', op: 'eq', value: '월세' }]),
    income_condition: '기준 중위소득 100% 이하' };
  const result = judge(policy, {}, now);
  assert.equal(result.result, 'CHECK');
  assert.deepEqual(result.conditions.map((item) => item.status), ['UNKNOWN', 'UNKNOWN']);
  assert.ok(result.conditions.every((item) => item.reason && item.evidence?.source));
});

test('OR, 제외 조건, 적용 여부 미확인은 조건별로 처리한다', () => {
  const policy = verified([
    { any: [{ field: 'current_status', op: 'eq', value: '대학생' },
      { field: 'current_status', op: 'eq', value: '직장인' }] },
    { field: 'housing_type', op: 'eq', value: '월세', applicable: false },
  ], [{ field: 'special_targets', op: 'contains', value: '기존 수혜자' }]);
  const result = judge(policy, { current_status: ['직장인'], special_targets: ['장애인'] }, now);
  assert.equal(result.result, 'CHECK');
  assert.deepEqual(result.conditions.map((item) => item.status),
    ['SATISFIED', 'UNKNOWN', 'CLEAR']);
  assert.ok(!JSON.stringify(result).includes('장애인'));
  const excluded = judge(policy, { current_status: ['직장인'], special_targets: ['기존 수혜자'] }, now);
  assert.equal(excluded.result, 'INELIGIBLE');
});

test('실제 DB의 required RAW와 미검증 all은 CHECK로 유지한다', () => {
  const raw = { eligibility_verified: false, min_age: 19,
    eligibility_conditions: { required: [{ text: '재학 및 성적 조건', operator: 'RAW' }],
      exclusions: [{ operator: 'NOT', condition: { text: '기존 수혜자', operator: 'RAW' } }] } };
  const result = judge(raw, { birth_date: '2010-01-01' }, now);
  assert.equal(result.result, 'CHECK');
  assert.equal(result.conditions.length, 3);
  assert.ok(result.conditions.every((item) => item.status === 'UNKNOWN'));
  const housing = { eligibility_verified: false,
    eligibility_conditions: { all: [{ text: '가구 소득 확인' }], required: [{ operator: 'AND', conditions: [] }] } };
  assert.equal(judge(housing, {}, now).result, 'CHECK');
});

test('검증된 중첩 AND와 OR의 조건별 결과를 반환한다', () => {
  const policy = { eligibility_verified: true, eligibility_conditions: { required: [
    { operator: 'AND', conditions: [
      { field: 'age', operator: 'BETWEEN', value: [19, 34] },
      { operator: 'OR', conditions: [
        { field: 'region', operator: 'EQ', value: '26' },
        { field: 'region', operator: 'EQ', value: '26380' },
      ] },
    ] },
  ] } };
  const result = judge(policy, { birth_date: '2001-01-01', region_code: '26380' }, now);
  assert.equal(result.result, 'ELIGIBLE');
  assert.equal(result.conditions[0].children[1].status, 'SATISFIED');
  assert.equal(result.conditions[0].children[1].children[0].status, 'UNSATISFIED');
});

test('값이 없는 비교 규칙은 불충족으로 단정하지 않는다', () => {
  const result = judge(verified([{ field: 'housing_type', op: 'eq' }]), { housing_type: '월세' }, now);
  assert.equal(result.result, 'CHECK');
  assert.equal(result.conditions[0].status, 'UNKNOWN');
});

test('빈 all은 제외 원문을 유지하고 유효한 required는 판정한다', () => {
  const onlyExclusion = verified([], [{ text: '기존 수혜 여부 확인' }]);
  assert.equal(judge(onlyExclusion, {}, now).result, 'CHECK');
  const required = { eligibility_verified: true, eligibility_conditions: {
    all: [], required: [{ field: 'age', operator: 'BETWEEN', value: [19, 34] }],
  } };
  assert.equal(judge(required, { birth_date: '2001-01-01' }, now).result, 'ELIGIBLE');
});
