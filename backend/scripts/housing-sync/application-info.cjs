'use strict';
const fs=require('node:fs'),path=require('node:path');
const {isDeepStrictEqual:eq}=require('node:util');
const {normalize,plain,sha,canonicalUrl,save}=require('./core.cjs');
const {clients}=require('./network.cjs');
const VERSION=1,FIELDS=['application_process','required_documents'];
function sourceText(source){
 if(!source||source.error||source.needs_document_extraction||source.inspection?.error_page_hint)return '';
 if(source.body_encoding==='base64')return source.extracted_text||'';
 if(source.body)return plain(source.body.replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi,' $1 ').replace(/&(lsquo|rsquo|ldquo|rdquo|ndash|mdash|hellip);/g,' '));
 return source.extracted_text||'';
}
function sectionFingerprint(text){const value=normalize(text),start=value.indexOf(normalize('이용절차 1'));if(start<0)return null;const ends=['상담문의','업무취급은행'].map(x=>value.indexOf(normalize(x),start)).filter(x=>x>start);if(!ends.length)return null;return sha(value.slice(start,Math.min(...ends)));}
function useful(value){return typeof value==='string'&&value.trim()&&!/^(없음|해당없음|미정|미등록|해당사항없음|[-–]|null|N\/A)$/i.test(value.trim())&&!/^(?:별도|제출|구비|필요|준비|서류|문서|\s|[:：])*없(?:음|습니다)[.!\s]*$/.test(value.trim())&&!/^(공고문|홈페이지|누리집|별도|상세).{0,20}(참조|참고|확인|문의)[.!\s]*$/.test(value.trim());}
function apiApplicationInfo(row,source){
 const text=normalize(sourceText(source));const values={},issues=[];
 if(!text)return{values,issues:['official_source_unavailable']};
 const process=plain(row.plcyAplyMthdCn||'').trim();
 if(useful(process)){
  const steps=process.split(/\s*(?:→|⇒|⟶|->)\s*/).map(x=>x.trim()).filter(Boolean);
  if(steps.length&&steps.length<=30&&steps.every(x=>x.length<=1500&&text.includes(normalize(x))))values.application_process=steps;
  else issues.push('application_process_not_supported_by_official_body');
 }
 const raw=plain(row.sbmsnDcmntCn||'').trim();
 if(useful(raw)){
  const lines=raw.split(/\r?\n/).map(x=>x.replace(/^[\s•●○·\-]+/,'').trim()).filter(Boolean),documents=[];let context='',required=true,ambiguous=false;
  for(const line of lines){
   if(!useful(line)){ambiguous=true;break;}
   if(/^(공통|필수)(?:\s*(?:제출)?\s*서류)?\s*[:：]?$/.test(line)){context='';required=true;continue;}
   if(/^(해당자|해당 시|조건부|선택)(?:\s*(?:제출)?\s*서류)?\s*[:：]?$/.test(line)){context=line.replace(/[:：]/g,'');required=false;continue;}
   const conditional=/^(?:[①-⑳\d.()\s]*)(?:해당자|대리인|결혼예정자|예비신혼|기혼자|미혼자|외국인|사업소득자|근로소득자|방문신청|방문접수|온라인신청)(?:\s|[:：(]|인 경우)/.test(line)||/^[^:：]{1,60}(?:인 경우|한 경우|필요시|필요 시)\s*[:：]/.test(line);
   // Mixed exemptions/alternatives need a human to bind each condition to its document.
   if(/생략|면제|제외|대체|불필요|추가 요청|추가요청/.test(line)||(/해당|경우|필요시|필요 시/.test(line)&&!conditional&&!context)){ambiguous=true;break;}
   const name=context?`${context}: ${line}`:line;
   if(name.length>500||!text.includes(normalize(line))){ambiguous=true;break;}
   documents.push({key:'housing_doc_'+sha(name).slice(0,16),name,required:conditional?false:required,confirmed:true});
  }
  if(!ambiguous&&documents.length&&documents.length<=60)values.required_documents=[...new Map(documents.map(d=>[d.key,d])).values()];
  else issues.push('documents_require_condition_or_source_review');
 }
 return{values,issues};
}
function strictApiMatches(policy,rows){return rows.filter(row=>normalize(row.plcyNm)===normalize(policy.title)&&[row.refUrlAddr1,row.refUrlAddr2,row.aplyUrlAddr].some(url=>canonicalUrl(url)&&canonicalUrl(url)===canonicalUrl(policy.official_url)));}
function nullOnlyPlan(policy,values){const set={},conflicts=[];for(const field of FIELDS){const value=values[field];if(!Array.isArray(value)||!value.length)continue;if(policy[field]==null)set[field]=value;else if(!eq(policy[field],value))conflicts.push(field);}return{set,conflicts};}
async function syncApplicationInfo(root,config,{dir,apply=false},override){
 const io=override||clients(root,config),out=path.join(dir,'application_info'),recipes=require('./application-info-recipes.json').recipes;
 const summary=JSON.parse(fs.readFileSync(path.join(dir,'summary.json'),'utf8'));
 if(summary.mode!=='LIVE_READ_ONLY'||summary.status!=='SCAN_COMPLETE_REVIEW_REQUIRED')throw Error('Application info requires complete live scan');
 const input=JSON.parse(fs.readFileSync(path.join(dir,'scan_inputs.json'),'utf8'));
 // Never use a stale API capture to add fields. Registered recipes fetch their official pages now.
 const scannedAt=summary.scanned_at||summary.run_id?.slice(0,23).replace(/T(\d\d)-(\d\d)-(\d\d)-/,'T$1:$2:$3.')+'Z';
 const freshApi=Number.isFinite(Date.parse(scannedAt))&&Date.now()-Date.parse(scannedAt)<24*3600*1000&&Date.now()>=Date.parse(scannedAt);
 const rows=freshApi?input.api_rows||[]:[],policies=(await io.all('policy','policy_id,title,collection_domain,official_url,application_process,required_documents','policy_id')).filter(p=>p.collection_domain==='HOUSING');
 const journal={version:VERSION,mode:apply?'APPLY':'PREVIEW',status:'PREPARED',started_at:new Date().toISOString(),scope:'HOUSING null application_process/required_documents only',api_capture_fresh:freshApi,policies_checked:policies.length,steps:[],review:[],unchanged:0};
 const log=()=>save(path.join(out,'result.json'),journal),plans=[],cache=new Map();
 async function official(url){const key=canonicalUrl(url);if(!cache.has(key))cache.set(key,io.publicSource(url));return cache.get(key);}
 for(const p of policies){
  let values={},evidence=null;const recipe=recipes.find(r=>r.policy_id===p.policy_id);
  try{
   if(recipe){const source=await official(recipe.url),fingerprint=sectionFingerprint(sourceText(source));save(path.join(out,'sources',sha(recipe.url)+'.json'),source);if(fingerprint!==recipe.section_sha256){journal.review.push({policy_id:p.policy_id,reason:'registered_official_section_changed_or_unreadable',url:recipe.url});continue;}values=recipe.values;evidence={url:recipe.url,section_sha256:fingerprint,kind:'REGISTERED_OFFICIAL_RECIPE'};}
   else if(freshApi){const matches=strictApiMatches(p,rows);if(matches.length!==1){if(matches.length>1)journal.review.push({policy_id:p.policy_id,reason:'ambiguous_api_identity'});journal.unchanged++;continue;}
    const source=await official(p.official_url),info=apiApplicationInfo(matches[0],source);values=info.values;evidence={url:p.official_url,api_id:matches[0].plcyNo,source_sha256:source.stored_body_sha256,kind:'EXACT_API_TITLE_AND_URL'};save(path.join(out,'sources',sha(p.official_url)+'.json'),source);if(info.issues.length)journal.review.push({policy_id:p.policy_id,reason:info.issues});
   }
   const {set,conflicts}=nullOnlyPlan(p,values);if(conflicts.length)journal.review.push({policy_id:p.policy_id,reason:'preserve_populated_fields',fields:conflicts});if(!Object.keys(set).length){journal.unchanged++;continue;}plans.push({policy_id:p.policy_id,set,evidence});
  }catch(error){journal.review.push({policy_id:p.policy_id,reason:'official_source_unavailable',detail:error.message});}
 }
 save(path.join(out,'plan.json'),plans);journal.planned_policies=plans.length;log();if(!apply)return journal;
 try{for(const plan of plans){const current=(await io.db('policy','select=*&policy_id=eq.'+plan.policy_id+'&collection_domain=eq.HOUSING'))[0];if(!current)throw Error('Housing policy disappeared');const {set,conflicts}=nullOnlyPlan(current,plan.set);if(conflicts.length){journal.review.push({policy_id:plan.policy_id,reason:'concurrent_update_preserved',fields:conflicts});}if(!Object.keys(set).length)continue;
   let query='policy_id=eq.'+plan.policy_id+'&collection_domain=eq.HOUSING';for(const f of Object.keys(set))query+='&'+f+'=is.null';
   const step={policy_id:plan.policy_id,fields:Object.keys(set),status:'PENDING'};journal.steps.push(step);log();
   const changed=await io.db('policy',query,'PATCH',set);if(changed.length!==1){step.status='CONCURRENT_CHANGE_PRESERVED';log();continue;}
   const actual=(await io.db('policy','select=*&policy_id=eq.'+plan.policy_id))[0];for(const f of Object.keys(set))if(!eq(actual?.[f],set[f]))throw Error('Application info read-back mismatch');
   for(const f of Object.keys(current))if(!Object.hasOwn(set,f)&&f!=='updated_at'&&!eq(current[f],actual[f]))throw Error('Unexpected policy field change');step.status='VERIFIED';log();
  }
  journal.status='COMPLETE_VERIFIED';journal.updated_policies=journal.steps.filter(s=>s.status==='VERIFIED').length;journal.finished_at=new Date().toISOString();log();return journal;
 }catch(error){journal.status='STOPPED_RESUME_REQUIRED';journal.error=error.message;log();throw error;}
}
module.exports={VERSION,sourceText,sectionFingerprint,apiApplicationInfo,strictApiMatches,nullOnlyPlan,syncApplicationInfo};
