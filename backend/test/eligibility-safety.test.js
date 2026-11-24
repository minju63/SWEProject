import test from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../src/services/eligibility.service.js';

const now = new Date('2026-11-18T03:00:00Z');
const rule = (field, op, value) => ({ field, op, value });
const policy = (required, exclusions = [], eligibility_verified = true) => ({
  eligibility_verified, eligibility_conditions: { required, exclusions },
});

test('source-confirmed applicant checks compare the profile without approving the whole policy', () => {
  const check = { field: 'home_ownership', op: 'eq', value: '무주택', label: '본인 무주택',
    subject: 'applicant', verification: 'SOURCE_CONFIRMED',
    evidence: { source_url: 'https://example.gov/policy', quote: '무주택자', body_sha256: 'a'.repeat(64) } };
  const p = { eligibility_verified: false, eligibility_conditions: {
    logic: 'UNVERIFIED', required: [{ operator: 'RAW', text: '가구 소득 확인' }],
    profile_contract: { version: 'housing-profile/1', mode: 'PARTIAL_REVIEW', checks: [check] },
  } };
  for (const [value, expected] of [['무주택', 'SATISFIED'], ['유주택', 'UNSATISFIED'], [null, 'UNKNOWN']]) {
    const result = judge(p, { home_ownership: value }, now);
    assert.equal(result.result, 'CHECK');
    assert.equal(result.conditions[0].status, expected);
  }
  p.eligibility_conditions.profile_contract.checks = [{ ...check, subject: 'household' },
    { ...check, evidence: { ...check.evidence, quote: '' } }];
  assert.equal(judge(p, { home_ownership: '무주택' }, now).conditions.some((c) => c.partial_profile_check), false);
});

test('Busan newlywed policy compares the current applicant region only', () => {
  const p = { policy_id: 'f8708fd3-0285-5b3b-9ac6-f8f84ef8bcc1',
    eligibility_verified: false, eligibility_conditions: { logic: 'UNVERIFIED', required: [
      { operator: 'AND', conditions: [
        { operator: 'RAW', label: '본인 지역 부산', original_condition: {
          field: 'city_code', subject: 'applicant', operator: 'EQ', value: '26', anchor: 'application_date',
        } },
        { operator: 'RAW', text: '배우자와 신청일 기준 거주지 확인' },
      ] },
    ] } };
  for (const [region_code, expected] of [['26380', 'SATISFIED'], ['11', 'UNSATISFIED'], [null, 'UNKNOWN']]) {
    const result = judge(p, { region_code }, now);
    assert.equal(result.result, 'CHECK');
    assert.equal(result.conditions.length, 1);
    assert.equal(result.conditions[0].children[0].status, expected);
    assert.equal(result.conditions[0].children[1].status, 'UNKNOWN');
  }
});

test('reviewed profile checks update the matching row inside an OR branch', () => {
  const check = { field: 'home_ownership', op: 'eq', value: '무주택', label: '본인 무주택',
    subject: 'applicant', verification: 'SOURCE_CONFIRMED',
    evidence: { source_url: 'https://example.gov/policy', quote: '무주택자', body_sha256: 'a'.repeat(64) } };
  const original = { subject: 'applicant', field: 'owns_home', operator: 'EQ', value: false, anchor: 'application_date' };
  const p = { eligibility_verified: false, eligibility_conditions: { logic: 'UNVERIFIED',
    required: [{ operator: 'AND', conditions: [original] }],
    profile_contract: { version: 'housing-profile/1', mode: 'PARTIAL_REVIEW', checks: [check] } } };
  const result = judge(p, { home_ownership: '무주택' }, now);
  assert.equal(result.conditions.length, 1);
  assert.equal(result.conditions[0].children[0].status, 'SATISFIED');
  assert.equal(result.result, 'CHECK');
  p.eligibility_conditions.required[0].operator = 'OR';
  const alternative = judge(p, { home_ownership: '무주택' }, now);
  assert.equal(alternative.conditions.length, 1);
  assert.equal(alternative.conditions[0].children[0].status, 'SATISFIED');
  assert.equal(alternative.result, 'CHECK');
});

test('LH youth housing compares age and student status within alternatives', () => {
  const raw = (field, value, operator = 'EQ') => ({ operator: 'RAW', label: field,
    original_condition: { field, value, operator, subject: 'applicant', anchor: 'application_date' } });
  const p = { policy_id: '85a99896-0dbf-518d-a3ef-70349e10d46a', eligibility_verified: false,
    eligibility_conditions: { logic: 'UNVERIFIED', required: [{ operator: 'OR', conditions: [
      raw('age', [19, 39], 'BETWEEN'), raw('university_student', true),
      raw('scheduled_university_entry_or_return', true),
    ] }] } };
  const result = judge(p, { birth_date: '2005-07-07', current_status: ['대학생'] }, now);
  assert.equal(result.result, 'CHECK');
  assert.deepEqual(result.conditions[0].children.map((child) => child.status), ['SATISFIED', 'SATISFIED', 'UNKNOWN']);
  assert.equal(result.conditions[0].status, 'SATISFIED');
  const other = judge(p, { birth_date: '1970-01-01', current_status: ['직장인'] }, now);
  assert.deepEqual(other.conditions[0].children.map((child) => child.status), ['UNSATISFIED', 'UNKNOWN', 'UNKNOWN']);
  assert.equal(other.conditions[0].status, 'UNKNOWN');
});

test('housing compares current profile to matching applicant and marital rows without inferring family facts', () => {
  const raw = (subject, field, value) => ({ operator: 'RAW', label: field,
    original_condition: { subject, field, value, operator: 'EQ', anchor: 'application_date' } });
  const p = { collection_domain: 'HOUSING', eligibility_verified: false, eligibility_conditions: {
    logic: 'UNVERIFIED', required: [{ operator: 'OR', conditions: [
      { operator: 'AND', conditions: [raw('couple', 'is_married', true), raw('couple', 'marriage_duration', 7)] },
      raw('household', 'single_parent_family', true), raw('applicant', 'owns_home', false),
    ] }],
  } };
  const result = judge(p, { marital_status: '미혼', home_ownership: '무주택' }, now);
  assert.equal(result.result, 'CHECK');
  const [marriage, family, home] = result.conditions[0].children;
  assert.equal(marriage.children[0].status, 'UNSATISFIED');
  assert.equal(marriage.children[1].status, 'UNKNOWN');
  assert.equal(family.status, 'UNKNOWN');
  assert.equal(home.status, 'SATISFIED');
  assert.equal(home.profile_comparison, true);
  const blank = judge(p, {}, now);
  assert.equal(blank.conditions[0].children[0].children[0].status, 'UNKNOWN');
  const otherDomain = judge({ ...p, collection_domain: 'JOB' }, { marital_status: '미혼' }, now);
  assert.equal(otherDomain.conditions[0].children[0].children[0].status, 'UNKNOWN');
});

test('housing compares head of household, graduate status and bounded age without guessing missing facts', () => {
  const raw = (field, operator, value, anchor = 'application_date') => ({ operator: 'RAW', label: field,
    original_condition: { subject: 'applicant', field, value, operator, anchor } });
  const p = { collection_domain: 'HOUSING', eligibility_verified: false, eligibility_conditions: {
    logic: 'UNVERIFIED', required: [raw('is_household_head', 'EQ', true),
      raw('graduate_student', 'EQ', true), raw('age', 'LT', 40),
      raw('birth_date', 'BETWEEN', ['1986-01-01', '2008-12-31'], '2026_application_year'),
      raw('age', 'GTE', 19, 'loan_receipt_date')],
  } };
  const positive = judge(p, { birth_date: '2005-07-07', household_role: '세대주', current_status: ['대학원생'] }, now);
  assert.deepEqual(positive.conditions.map((item) => item.status), ['SATISFIED', 'SATISFIED', 'SATISFIED', 'SATISFIED', 'UNKNOWN']);
  assert.equal(positive.result, 'CHECK');
  const other = judge(p, { birth_date: '1986-01-01', household_role: '세대원', current_status: ['직장인'] }, now);
  assert.deepEqual(other.conditions.map((item) => item.status), ['UNSATISFIED', 'UNKNOWN', 'UNSATISFIED', 'SATISFIED', 'UNKNOWN']);
  assert.ok(judge(p, {}, now).conditions.every((item) => item.status === 'UNKNOWN'));
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
