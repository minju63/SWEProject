import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateConditions} from '../../shared/eligibility-engine.mjs';
import {judge} from '../src/services/eligibility.service.js';
const c=(field,op,value)=>({field,op,value});
const policy=(required,exclusions=[],verified=true)=>({eligibility_verified:verified,eligibility_conditions:{required,exclusions}});
test('nested AND/OR preserves unknown alternatives and every required condition',()=>{
 const p=policy([{operator:'AND',conditions:[c('age','between',[19,34]),{operator:'OR',conditions:[c('region_code','starts_with','26'),{operator:'RAW',text:'타지역은 부산 소재 기업 면접 확인'}]}]}]);
 assert.equal(evaluateConditions(p,{age:25,region_code:'26'}).result,'ELIGIBLE');
 assert.equal(evaluateConditions(p,{age:25,region_code:'11'}).result,'CHECK');
 assert.equal(evaluateConditions(p,{age:40,region_code:'26'}).result,'INELIGIBLE');
 assert.equal(evaluateConditions(p,{region_code:'26'}).result,'CHECK');
});
test('exclusions invert known facts while RAW exclusions remain unknown',()=>{
 const p=policy([c('age','gte',19)],[c('home_ownership','eq','유주택')]);
 assert.equal(evaluateConditions(p,{age:25,home_ownership:'유주택'}).result,'INELIGIBLE');
 assert.equal(evaluateConditions(p,{age:25,home_ownership:'무주택'}).result,'ELIGIBLE');
 assert.equal(evaluateConditions({...p,eligibility_conditions:{...p.eligibility_conditions,exclusions:[{operator:'RAW',text:'중복수혜 확인'}]}},{age:25}).result,'CHECK');
});
test('unverified data never produces a full eligibility decision, including a known mismatch',()=>{
 for(const age of [18,25,40])assert.equal(evaluateConditions(policy([c('age','between',[19,34])],[],false),{age}).result,'CHECK');
});
test('RAW, household subjects, historical anchors and unsupported fields cannot use applicant values',()=>{
 for(const node of [{operator:'RAW',field:'age',op:'gte',value:19},{...c('age','gte',19),subject:'child'},{...c('age','gte',19),anchor:'notice_date'},c('interview_company_region','eq','26')])assert.equal(evaluateConditions(policy([node]),{age:25,region_code:'26'}).result,'CHECK');
});
test('malformed rules and empty groups fail closed; canonical keys override stale legacy rules',()=>{
 for(const required of [[],[{operator:'AND',conditions:[]}],[{operator:'OR',conditions:[]}],[c('age','between',[19,'34'])],[c('age','in','25')],[null]])assert.equal(evaluateConditions(policy(required),{age:25}).result,'CHECK');
 assert.equal(evaluateConditions({eligibility_verified:true,eligibility_conditions:{required:[{operator:'RAW',text:'확인 필요'}],all:[c('age','gte',19)]}},{age:25}).result,'CHECK');
 assert.equal(evaluateConditions(policy([c('age','gte',19)],{bad:true}),{age:25}).result,'CHECK');
});
test('API adapter reads the same canonical region, birth-year and boolean values',()=>{
 const p=policy([c('birth_year','between',[1991,2007]),c('region_code','starts_with','26'),c('lives_separately','eq',false)]);
 assert.equal(judge(p,{birth_date:'2001-05-01',region_code:'26380',lives_separately:false}).result,'ELIGIBLE');
 assert.equal(judge(p,{birth_date:'2001-05-01',region_code:'11',lives_separately:false}).result,'INELIGIBLE');
});
