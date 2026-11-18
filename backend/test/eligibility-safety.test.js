import test from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../src/services/eligibility.service.js';

const now = new Date('2026-11-18T03:00:00Z');
const rule = (field, op, value) => ({ field, op, value });
const policy = (required, exclusions = [], eligibility_verified = true) => ({
  eligibility_verified, eligibility_conditions: { required, exclusions },
});

test('AND, OR, and exclusions keep unknown separate from failed or hit conditions', () => {
  const required = [{ operator: 'AND', conditions: [
    rule('housing_type', 'eq', '월세'),
    { operator: 'OR', conditions: [rule('home_ownership', 'eq', false), rule('household_role', 'eq', '세대주')] },
  ] }];
  const exclusions = [rule('housing_benefit_status', 'eq', '수급 중')];
  const base = { housing_type: '월세', home_ownership: false, household_role: '세대원', housing_benefit_status: '미수급' };
  assert.equal(judge(policy(required, exclusions), base, now).result, 'ELIGIBLE');
  assert.equal(judge(policy(required, exclusions), { ...base, housing_benefit_status: '수급 중' }, now).result, 'INELIGIBLE');
  assert.equal(judge(policy(required, exclusions), { ...base, housing_benefit_status: null }, now).result, 'CHECK');
  assert.equal(judge(policy(required, exclusions), { ...base, housing_type: '전세', housing_benefit_status: null }, now).result, 'INELIGIBLE');
});

test('RAW, review memo, unsupported rule, and unverified policy cannot become eligible', () => {
  const pass = rule('housing_type', 'eq', '월세');
  const profile = { housing_type: '월세' };
  assert.equal(judge(policy([pass, { operator: 'RAW', text: '본인 무주택' }]), profile, now).result, 'CHECK');
  assert.equal(judge(policy([pass, { operator: 'MANUAL_REVIEW', text: '원문 전체 증빙·예외 심사 필요' }]), profile, now).result, 'CHECK');
  assert.equal(judge(policy([pass, rule('housing_type', 'unsupported', '월세')]), profile, now).result, 'CHECK');
  assert.equal(judge(policy([pass], [], false), profile, now).result, 'CHECK');
});
