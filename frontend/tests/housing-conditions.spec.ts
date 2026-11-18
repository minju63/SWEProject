import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { databaseEligibility } from '../src/data/databaseEligibility';
import { emptyConditions, profileToConditions } from '../src/data/conditions';
import { mapHousingPolicy } from '../src/data/housing';
import { applicationForProfile } from '../src/data/myApplications';
import { policyCatalog } from '../src/data/policies';
import type { ApplicationItem, Profile } from '../src/app/AppState';

const fixtures = JSON.parse(fs.readFileSync('tests/fixtures/housing-profile.json', 'utf8'));
function policy(id: string) {
  const fixture = fixtures.find((p: any) => p.before.policy_id === id);
  return mapHousingPolicy({...fixture.before, ...fixture.values});
}

test('housing fixtures retain alternatives, subjects, dates and exclusions while exposing separate condition sections', () => {
  expect(fixtures).toHaveLength(6);
  for (const item of fixtures) {
    const old = item.before;
    const rules = item.values.eligibility_conditions;
    expect(old.collection_domain).toBe('HOUSING');
    expect(old.item_type).toBe('POLICY');
    expect(rules.required).toEqual(old.eligibility_conditions.required);
    expect(rules.exclusions).toEqual(old.eligibility_conditions.exclusions);
    expect(rules.condition_sections).toHaveLength(7);
    expect(databaseEligibility(policy(old.policy_id), emptyConditions, '').overall).toBe('확인 필요');
  }
});

test('HF age 39 boundary and ownership compare individually but cannot assert full eligibility', () => {
  const p = policy('5931cb39-c42f-535f-b6ee-f8e576bc1413');
  const pass = databaseEligibility(p, {...emptyConditions, age:'39', homeOwnership:'무주택'}, '');
  expect(pass.items[0].status).toBe('신청 가능');
  expect(pass.items[1].status).toBe('신청 가능');
  expect(pass.overall).toBe('확인 필요');
  const fail = databaseEligibility(p, {...emptyConditions, age:'40', homeOwnership:'유주택'}, '');
  expect(fail.items.slice(0,2).map(i=>i.status)).toEqual(['신청 불가','신청 불가']);
  expect(fail.overall).toBe('확인 필요');
  expect(p.target).toContain('39세');
});

test('monthly rent uses birth year, not current age; missing birthday cannot be inferred from age', () => {
  const p = policy('5378d71a-86cb-5297-bc71-a376b91f4fbd');
  for (const year of [1991,2007]) {
    const result = databaseEligibility(p, {...emptyConditions,birthDate:`${year}-01-01`,age:'35',homeOwnership:'무주택',independentLiving:'예'},'');
    expect(result.items.slice(0,3).every(i=>i.status==='신청 가능')).toBeTruthy();
    expect(result.overall).toBe('확인 필요');
  }
  for (const year of [1990,2008]) expect(databaseEligibility(p,{...emptyConditions,birthDate:`${year}-01-01`},'').items[0].status).toBe('신청 불가');
  expect(databaseEligibility(p,{...emptyConditions,age:'25'},'').items[0].status).toBe('확인 필요');
});

test('student alternatives and military extensions are not rejected by a flattened age upper limit', () => {
  const rental = policy('85a99896-0dbf-518d-a3ef-70349e10d46a');
  const student = databaseEligibility(rental,{...emptyConditions,age:'40',currentStatus:'대학생',homeOwnership:'무주택',maritalStatus:'미혼'},'');
  expect(student.items.slice(0,2).every(i=>i.status==='신청 가능')).toBeTruthy();
  expect(student.items.some(i=>i.status==='신청 불가')).toBeFalsy();
  const loan = policy('ff17d688-dc06-5180-8af1-304441214d0f');
  expect(databaseEligibility(loan,{...emptyConditions,age:'37'},'').overall).toBe('확인 필요');
  expect(databaseEligibility(loan,{...emptyConditions,age:'37'},'').items.some(i=>i.status==='신청 불가')).toBeFalsy();
});

test('My application receives source checks and keeps the whole-eligibility warning even with an individual mismatch', () => {
  const p = policy('5378d71a-86cb-5297-bc71-a376b91f4fbd');
  const profile = {birthDate:'2001-05-01',age:'25',region:'부산광역시 사하구',homeOwnership:'유주택',independentLiving:'부모와 함께 거주',interests:['주거·생활']} as Profile;
  expect(profileToConditions(profile).birthDate).toBe('2001-05-01');
  policyCatalog.push(p);
  try {
    const a = applicationForProfile({policyId:p.id,eligibilityChecks:[]} as unknown as ApplicationItem,profile);
    expect(a.eligibilityOverall).toBe('확인 필요');
    expect(a.eligibilityChecks.some(c=>c.label==='본인 무주택'&&c.status==='unmatched')).toBeTruthy();
    expect(a.eligibilityChecks.some(c=>c.label.startsWith('소득·재산:')&&c.status==='needs_check')).toBeTruthy();
    expect(a.eligibilityChecks.some(c=>c.label==='부모와 별도 거주'&&c.status==='unmatched')).toBeTruthy();
  } finally { policyCatalog.splice(policyCatalog.indexOf(p),1); }
});

test('canonical required AND/OR and exclusions drive the same browser verdict as the API contract',()=>{
  const p={...policy('5931cb39-c42f-535f-b6ee-f8e576bc1413'),eligibilityVerified:true,eligibilityRules:{
    required:[{operator:'AND',conditions:[{field:'age',op:'between',value:[19,34]},{operator:'OR',conditions:[{field:'region_code',op:'starts_with',value:'26'},{operator:'RAW',text:'부산 소재 기업 면접 확인'}]}]}],
    exclusions:[{field:'home_ownership',op:'eq',value:'유주택'}],
  }};
  expect(databaseEligibility(p,{...emptyConditions,age:'25',homeOwnership:'무주택'},'부산광역시 사하구').overall).toBe('신청 가능');
  expect(databaseEligibility(p,{...emptyConditions,age:'25',homeOwnership:'유주택'},'부산광역시 사하구').overall).toBe('신청 불가');
  expect(databaseEligibility(p,{...emptyConditions,age:'25',homeOwnership:'무주택'},'').overall).toBe('확인 필요');
  expect(databaseEligibility({...p,eligibilityVerified:false},{...emptyConditions,age:'25',homeOwnership:'무주택'},'부산광역시 사하구').overall).toBe('확인 필요');
  const raw={...p,eligibilityRules:{...p.eligibilityRules,required:[{operator:'RAW',field:'age',op:'gte',value:19,text:'자동 판정 금지'}]}};
  expect(databaseEligibility(raw,{...emptyConditions,age:'25',homeOwnership:'무주택'},'부산광역시 사하구').overall).toBe('확인 필요');
});
