'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {sha,uuid,normalize,canonicalUrl,inspectText,duplicateMatches,equivalent,validateJson,safePath,save}=require('./core.cjs');
const {clients}=require('./network.cjs');
const {validateHousingDetail}=require('./detail-validation.cjs');
const contract=require('./record-contract.cjs');
const {apiApplicationInfo}=require('./application-info.cjs');
const allowedPolicy=new Set(['title','target_summary','support_content','support_summary','benefit_type','min_age','max_age','income_condition','application_start_date','application_end_date','application_period_unknown_reason','is_always_open','application_method','application_url','official_url','item_type']);
function validateApproval(review,candidate,source){
 if(review.decision!=='approve')throw Error('Not an approved review');
 for(const f of ['reviewer','reviewed_at','review_notes'])if(typeof review[f]!=='string'||!review[f].trim())throw Error('Review requires '+f);
 if(!Number.isFinite(Date.parse(review.reviewed_at)))throw Error('Invalid reviewed_at');
 for(const f of ['scope_verified','qualifications_reviewed','duplicate_relation_reviewed'])if(review[f]!==true)throw Error('Review requires '+f+'=true');
 if(candidate.scope.status==='OUT_OF_SCOPE'||candidate.relevant===false)throw Error('Cannot approve an out-of-scope/unrelated candidate');
 if(candidate.kind==='BUDGET_ONLY')throw Error('Budget-only source is not sufficient: add an actual authoritative program source');
 if(!source||source.error||source.needs_document_extraction||source.inspection?.error_page_hint||source.inspection?.inactive_hint)throw Error('Source requires manual remediation/extraction before approval');
 if(inspectText(source.extracted_text||'').historical_only_hint)throw Error('Past temporary-program deadline found; current eligibility cannot be inferred');
 if(review.source_key!==source.key||!review.expected_source_sha256||review.expected_source_sha256!==source.stored_body_sha256)throw Error('Approval source fingerprint differs from scan');
 const original=Buffer.from(source.body,source.body_encoding==='base64'?'base64':'utf8');if(sha(original)!==source.stored_body_sha256)throw Error('Source body checksum mismatch');
 if(!Array.isArray(review.region_codes)||!review.region_codes.length||review.region_codes.some(r=>!['KR','26','26230','26380'].includes(r)))throw Error('Invalid approved region scope');
 if(!review.subcategory_name)throw Error('Select an existing housing subcategory');
 const p=review.policy;if(!p||Object.keys(p).some(k=>!allowedPolicy.has(k)))throw Error('Unexpected policy field; checklist/verified/IDs must not be supplied');
 for(const k of ['title','target_summary','support_content','application_method'])if(typeof p[k]!=='string'||!p[k].trim())throw Error('Reviewed policy requires '+k);
 if(p.item_type&&p.item_type!=='POLICY')throw Error('EVENT publishing is blocked until the common status-view issue is resolved; do not relabel an event as POLICY');
 if(p.min_age!==null||p.max_age!==null)throw Error('Keep age scalars NULL; use role-scoped rich conditions');
 if(typeof p.is_always_open!=='boolean')throw Error('is_always_open must be explicitly reviewed');
 for(const k of ['application_start_date','application_end_date'])if(p[k]!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(p[k])||new Date(p[k]+'T00:00:00Z').toISOString().slice(0,10)!==p[k]))throw Error('Invalid reviewed date');
 if(p.application_start_date&&p.application_end_date&&p.application_start_date>p.application_end_date)throw Error('Application dates reversed');
 if(canonicalUrl(p.official_url)!==canonicalUrl(source.source_url))throw Error('Reviewed official URL must match the bound source');
 if(!contract.officialProgramUrl(p.official_url)||source.final_url&&!contract.officialProgramUrl(source.final_url))throw Error('Official program URL required');
 const rich=review.eligibility_conditions;if(!rich||!Array.isArray(rich.required)||!rich.required.length||!Array.isArray(rich.exclusions))throw Error('Review subject/AND/OR qualifications and exclusion guards');
 function node(n){if(!n||!['AND','OR','RAW','MANUAL_REVIEW','EQ','LTE','LT','GTE','GT','IN','BETWEEN'].includes(n.operator))throw Error('Invalid eligibility operator');if(['AND','OR'].includes(n.operator)){if(!Array.isArray(n.conditions)||!n.conditions.length)throw Error('Empty condition group');n.conditions.forEach(node);}else if(n.operator==='RAW'?!n.text:!n.subject||(n.operator==='MANUAL_REVIEW'?!n.text:!n.field||!Object.hasOwn(n,'value')))throw Error('Unscoped eligibility condition');}
 rich.required.forEach(node);rich.exclusions.forEach(node);validateJson(review);
 if(!review.housing_detail||review.housing_detail.housing_support_type===undefined)throw Error('Review housing detail and explicit NULL type');
 validateHousingDetail(review.housing_detail,review.housing_value_context);
}
function validateRows(tables,definitions){for(const[t,rows]of Object.entries(tables))for(const row of rows){const def=definitions[t];if(!def)throw Error('Unknown DB table '+t);for(const key of def.required||[])if(!Object.hasOwn(def.properties[key],'default')&&(row[key]===undefined||row[key]===null))throw Error('Missing DB field '+t+'.'+key);for(const[k,v]of Object.entries(row)){const prop=def.properties[k];if(!prop)throw Error('Unknown DB field '+t+'.'+k);if(v===null){if((def.required||[]).includes(k))throw Error('NULL required DB field');continue;}if(prop.type&&typeof v!==(prop.type==='integer'?'number':prop.type))throw Error('Wrong DB type '+t+'.'+k);if(prop.type==='integer'&&!Number.isSafeInteger(v))throw Error('Invalid DB integer');if(prop.format==='uuid'&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v))throw Error('Invalid DB UUID');}validateJson(row);}}
async function insertAndVerify(io,table,rows,journal,saveJournal){const col=table==='policy_source'?'source_id':'policy_id',key=r=>table==='policy_region'?r.policy_id+'|'+r.region_code:table==='policy_subcategory_map'?r.policy_id+'|'+r.subcategory_id:r[col];if(!rows.length)return;
 const ids=[...new Set(rows.map(r=>r[col]))];const query='select=*&'+col+'=in.('+ids.join(',')+')';
 const existing=await io.db(table,query);const pending=rows.filter(row=>{const old=existing.find(x=>key(x)===key(row));if(!old)return true;if(!equivalent(old,row))throw Error('Resume row differs: '+table);return false;});
 const step={table,expected:rows.length,reused:rows.length-pending.length,inserted:0,status:'INSERTING'};journal.steps.push(step);saveJournal();
 const size=table==='policy_source'?8:100;for(let i=0;i<pending.length;i+=size){const batch=pending.slice(i,i+size);await io.db(table,'','POST',batch);step.inserted+=batch.length;saveJournal();}
 const actual=await io.db(table,query);for(const row of rows){const old=actual.find(x=>key(x)===key(row));if(!old||!equivalent(old,row))throw Error('Read-back mismatch: '+table);}step.status='VERIFIED';saveJournal();
}
async function publish(root,config,{runId,reviewFile,apply=false},overrideIo){
 const base=path.join(root,'research/housing-sync'),latest=JSON.parse(fs.readFileSync(path.join(base,'latest.json'),'utf8'));const id=runId||latest.run_id,dir=safePath(path.join(base,'runs'),id);
 const summary=JSON.parse(fs.readFileSync(path.join(dir,'summary.json'),'utf8'));if(summary.status!=='SCAN_COMPLETE_REVIEW_REQUIRED'||summary.mode==='OFFLINE_REPLAY')throw Error('Partial/offline scan cannot be published; rerun complete live scan');
 if(!reviewFile)throw Error('--reviews FILE is required; copy and complete reviews.template.json');
 const file=safePath(root,reviewFile),reviews=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(reviews))throw Error('Review file must contain an array');const approved=reviews.filter(r=>r.decision==='approve');
 if(!approved.length){console.log(JSON.stringify({status:'NO_APPROVED_ROWS',db_writes:0}));return{status:'NO_APPROVED_ROWS'};}
 if(approved.length>100)throw Error('Review/publish at most 100 policies per batch');
 if(new Set(approved.map(r=>r.candidate_key)).size!==approved.length)throw Error('Duplicate approved candidate keys');
 const candidates=JSON.parse(fs.readFileSync(path.join(dir,'candidates.json'),'utf8')),sources=JSON.parse(fs.readFileSync(path.join(dir,'sources.json'),'utf8')),input=JSON.parse(fs.readFileSync(path.join(dir,'scan_inputs.json'),'utf8')),io=overrideIo||clients(root,config);
 const [existing,categories,subcategories,regions,sourceKeys,schema]=await Promise.all([io.all('policy','policy_id,title,official_url','policy_id'),io.all('policy_category'),io.all('policy_subcategory'),io.all('region'),io.all('policy_source','source_id,source_type,external_id','source_id'),io.db('','')]);
 const category=categories.find(c=>c.category_name==='주거·생활');if(!category)throw Error('Housing category missing');const tables={policy:[],housing_detail:[],policy_source:[],policy_region:[],policy_subcategory_map:[]};
 for(const r of approved){const c=candidates.find(c=>c.key===r.candidate_key),s=sources.find(s=>s.key===r.source_key);if(!c)throw Error('Approved candidate no longer exists');validateApproval(r,c,s);
  const pid=uuid('policy:housing-sync:'+c.key),others=existing.filter(p=>p.policy_id!==pid);if(duplicateMatches({...c,title:r.policy.title},others).length)throw Error('Existing policy title/URL conflict; link/review existing record instead');
  const sid=uuid('source:CRAWL:housing-sync:'+pid+':'+canonicalUrl(s.source_url));const sourceIds=[sid];const now=new Date().toISOString();
  if(apply){const live=await io.publicSource(s.source_url);if(live.stored_body_sha256!==r.expected_source_sha256)throw Error('Official source changed since review; re-scan and re-review');}
  const raw={...s};delete raw.related;delete raw.terms;delete raw.inspection;delete raw.key;
  tables.policy_source.push({source_id:sid,policy_id:pid,source_name:new URL(s.source_url).hostname,source_type:'CRAWL',external_id:'housing:sync:'+pid+':'+sha(canonicalUrl(s.source_url)).slice(0,24),source_url:s.source_url,raw_data:raw});
  if(c.api_id){let fullResponse;for(const page of input.api_pages){const value=JSON.parse(fs.readFileSync(safePath(dir,page.file),'utf8')),record=value.result?.youthPolicyList?.find(x=>x.plcyNo===c.api_id);if(record&&equivalent(record,c.api_row)){fullResponse=value;break;}}if(!fullResponse)throw Error('Full original API page matching the candidate is missing');
   const apiSid=uuid('source:API:youthcenter:'+c.api_id);sourceIds.push(apiSid);tables.policy_source.push({source_id:apiSid,policy_id:pid,source_name:'온통청년',source_type:'API',external_id:'youthcenter:'+c.api_id,source_url:config.api.endpoint,raw_data:{response:fullResponse,selected_policy_id:c.api_id,collected_at:summary.checked_at_kst,api_key_included:false}});
  }
  const eligible={...contract.conditions(r.eligibility_conditions,{...s,checked_at:s.checked_at||r.reviewed_at},sourceIds),review:{reviewer:r.reviewer,reviewed_at:r.reviewed_at,source_sha256:r.expected_source_sha256}};
  if(r.housing_value_context)eligible.housing_value_context=r.housing_value_context;
  tables.policy.push({...r.policy,policy_id:pid,category_id:category.category_id,collection_domain:'HOUSING',item_type:'POLICY',min_age:null,max_age:null,eligibility_verified:false,eligibility_conditions:eligible,classification_method:'공식 원문 수집 후 수동 검토',classification_status:'확인필요'});
  if(!r.policy.application_start_date&&!r.policy.application_end_date&&!r.policy.is_always_open&&!r.policy.application_period_unknown_reason)tables.policy.at(-1).application_period_unknown_reason=contract.period('',s,()=>[null,null]).application_period_unknown_reason;
  Object.assign(tables.policy.at(-1),apiApplicationInfo(c.api_row||{},s).values);
  contract.assertRecord(tables.policy.at(-1));
  tables.housing_detail.push({...r.housing_detail,policy_id:pid});for(const code of new Set(r.region_codes)){if(!regions.some(x=>x.region_code===code))throw Error('Missing region '+code);tables.policy_region.push({policy_id:pid,region_code:code});}
  const sub=subcategories.find(s=>s.category_id===category.category_id&&s.subcategory_name===r.subcategory_name);if(!sub)throw Error('Common subcategory missing; register with common owner first');tables.policy_subcategory_map.push({policy_id:pid,subcategory_id:sub.subcategory_id});
 }
 validateRows(tables,schema.definitions);const housingTypes=new Set(['청년주택','월세지원','전세지원','이사비','공과금','교통비']);for(const d of tables.housing_detail)if(d.housing_support_type!==null&&!housingTypes.has(d.housing_support_type))throw Error('Unsupported housing type');
 if(new Set(tables.policy.map(p=>normalize(p.title))).size!==tables.policy.length||new Set(tables.policy.map(p=>canonicalUrl(p.official_url))).size!==tables.policy.length)throw Error('Approved rows share a title/source: resolve duplicate relationship before batch publishing');
 const keys=new Set();for(const s of tables.policy_source){const k=s.source_type+'|'+s.external_id;if(keys.has(k))throw Error('Duplicate source identity');keys.add(k);if(sourceKeys.some(x=>x.source_id!==s.source_id&&x.source_type===s.source_type&&x.external_id===s.external_id))throw Error('Source identity already belongs to another record');}
 const bundleDir=path.join(dir,'approved_bundle');for(const[t,rows]of Object.entries(tables))save(path.join(bundleDir,t+'.json'),rows);
 const journalFile=path.join(bundleDir,apply?'load_result.json':'preview.json'),journal={mode:apply?'APPLY':'PREVIEW',status:'PREPARED',started_at:new Date().toISOString(),atomic_across_tables:false,counts:Object.fromEntries(Object.entries(tables).map(([t,r])=>[t,r.length])),steps:[]};const saveJournal=()=>save(journalFile,journal);saveJournal();
 if(!apply){console.log(JSON.stringify({...journal,db_writes:0}));return journal;}
 try{for(const[t,rows]of Object.entries(tables))await insertAndVerify(io,t,rows,journal,saveJournal);const statuses=await io.db('v_policy_status','select=*&policy_id=in.('+tables.policy.map(p=>p.policy_id).join(',')+')');assert.equal(statuses.length,tables.policy.length);journal.statuses=statuses;journal.status='COMPLETE_VERIFIED';journal.finished_at=new Date().toISOString();saveJournal();console.log(JSON.stringify(journal));return journal;}catch(error){journal.status='STOPPED_RESUME_AFTER_REVIEW';journal.error=error.message;journal.finished_at=new Date().toISOString();saveJournal();throw error;}
}
module.exports={validateApproval,validateRows,insertAndVerify,publish};
