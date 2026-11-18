const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {apiApplicationInfo,strictApiMatches,nullOnlyPlan,sectionFingerprint,syncApplicationInfo}=require('./application-info.cjs');
const {save,uuid}=require('./core.cjs');
const row={plcyNo:'fixture',plcyNm:'청년 주거안정 지원',refUrlAddr1:'https://www.busan.go.kr/fixture',plcyAplyMthdCn:'온라인 신청→심사',sbmsnDcmntCn:'필수서류\n주민등록등본\n해당자 서류\n대리인: 위임장'};
const source={source_url:row.refUrlAddr1,body:'<main>온라인 신청→심사<p>주민등록등본</p><p>대리인: 위임장</p></main>',stored_body_sha256:'fixture'};
test('API details require official-body evidence and retain conditional document names and stable keys',()=>{
 const a=apiApplicationInfo(row,source);assert.deepEqual(a.values.application_process,['온라인 신청','심사']);assert.equal(a.values.required_documents.length,2);assert.equal(a.values.required_documents[0].required,true);assert.equal(a.values.required_documents[1].required,false);assert.match(a.values.required_documents[1].name,/해당자.*대리인/);assert.deepEqual(a,apiApplicationInfo(row,source));
 assert.equal(apiApplicationInfo({...row,sbmsnDcmntCn:'인터넷에 없는 서류'},source).values.required_documents,undefined);
});
test('placeholders, mixed exemptions and unreadable attachments remain empty for review',()=>{
 for(const value of ['없음','필요 서류 없음','공고문 참조','해당자만 제출, 그 외 면제','제출서류는 홈페이지 확인'])assert.equal(apiApplicationInfo({...row,sbmsnDcmntCn:value},source).values.required_documents,undefined);
 assert.deepEqual(apiApplicationInfo(row,{...source,needs_document_extraction:true}).values,{});
 assert.deepEqual(apiApplicationInfo(row,{...source,error:'HTTP 403'}).values,{});
});
test('same URL alone or similar titles cannot identify an existing policy',()=>{
 const p={title:row.plcyNm,official_url:row.refUrlAddr1};assert.equal(strictApiMatches(p,[row]).length,1);assert.equal(strictApiMatches({...p,title:'다른 지원'},[row]).length,0);assert.equal(strictApiMatches({...p,official_url:'https://www.busan.go.kr/other'},[row]).length,0);
});
test('only null columns are filled; populated values and empty arrays are preserved',()=>{
 assert.deepEqual(nullOnlyPlan({application_process:['수동 검토'],required_documents:[]},{application_process:['온라인 신청'],required_documents:[{key:'a',name:'신청서'}],support_content:'overwrite'}),{set:{},conflicts:['application_process','required_documents']});
 assert.deepEqual(nullOnlyPlan({application_process:null},{application_process:['신청'],eligibility_verified:true}),{set:{application_process:['신청']},conflicts:[]});
});
test('fingerprints ignore navigation but detect any procedure/document section change',()=>{
 const x='앞 메뉴 이용절차 1 조건 확인 2 신청 준비서류 신분증 상담문의 123';assert.equal(sectionFingerprint(x),sectionFingerprint(x.replace('앞 메뉴','다른 메뉴').replace('123','456')));assert.notEqual(sectionFingerprint(x),sectionFingerprint(x.replace('신분증','등본')));assert.equal(sectionFingerprint('로그인 오류 안내'),null);
});
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'housing-application-info-test-'));
 save(path.join(dir,'summary.json'),{mode:'LIVE_READ_ONLY',status:'SCAN_COMPLETE_REVIEW_REQUIRED',scanned_at:new Date().toISOString()});save(path.join(dir,'scan_inputs.json'),{api_rows:[row]});
 const p={policy_id:uuid('test-application-info'),title:row.plcyNm,official_url:row.refUrlAddr1,collection_domain:'HOUSING',application_process:null,required_documents:null,support_content:'unchanged',eligibility_verified:false};
 const job={...p,policy_id:uuid('test-job'),collection_domain:'JOB'},data=[p,job];let writes=0,failAfterWrite=false,race=false;
 const io={all:async()=>structuredClone(data),publicSource:async()=>source,db:async(table,query,method,body)=>{
  assert.equal(table,'policy');const id=query.match(/policy_id=eq\.([^&]+)/)[1],current=data.find(p=>p.policy_id===id);
  if(method==='PATCH'){writes++;assert.match(query,/collection_domain=eq.HOUSING/);for(const k of Object.keys(body)){assert(['application_process','required_documents'].includes(k));assert(query.includes(k+'=is.null'));}if(race){current.application_process=['別担当入力'];return [];}Object.assign(current,structuredClone(body));if(failAfterWrite)throw Error('connection lost after commit');return[structuredClone(current)];}
  return current?[structuredClone(current)]:[];
 }};
 return{dir,io,data,setFailure:v=>failAfterWrite=v,setRace:v=>race=v,writes:()=>writes,cleanup:()=>{const resolved=path.resolve(dir);assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('housing-application-info-test-'));fs.rmSync(resolved,{recursive:true});}};
}
test('preview writes nothing; apply verifies housing only and reruns without duplicate writes',async()=>{const f=fixture();try{await syncApplicationInfo('',{}, {dir:f.dir,apply:false},f.io);assert.equal(f.writes(),0);const result=await syncApplicationInfo('',{}, {dir:f.dir,apply:true},f.io);assert.equal(result.updated_policies,1);assert.equal(f.data[1].required_documents,null);assert.equal(f.data[0].support_content,'unchanged');await syncApplicationInfo('',{}, {dir:f.dir,apply:true},f.io);assert.equal(f.writes(),1);}finally{f.cleanup();}});
test('uncertain committed request resumes by reading target values instead of writing again',async()=>{const f=fixture();try{f.setFailure(true);await assert.rejects(syncApplicationInfo('',{}, {dir:f.dir,apply:true},f.io),/connection lost/);f.setFailure(false);const result=await syncApplicationInfo('',{}, {dir:f.dir,apply:true},f.io);assert.equal(result.status,'COMPLETE_VERIFIED');assert.equal(f.writes(),1);}finally{f.cleanup();}});
test('conditional null filter preserves concurrent updates',async()=>{const f=fixture();try{f.setRace(true);const r=await syncApplicationInfo('',{}, {dir:f.dir,apply:true},f.io);assert.equal(r.updated_policies,0);assert.equal(f.data[0].application_process[0],'別担当入力');assert.equal(f.data[0].required_documents,null);}finally{f.cleanup();}});
test('offline and stale snapshots cannot supply API backfills',async()=>{const f=fixture();try{save(path.join(f.dir,'summary.json'),{mode:'OFFLINE_REPLAY',status:'SCAN_COMPLETE_REVIEW_REQUIRED'});await assert.rejects(syncApplicationInfo('',{}, {dir:f.dir,apply:true},f.io),/complete live scan/);save(path.join(f.dir,'summary.json'),{mode:'LIVE_READ_ONLY',status:'SCAN_COMPLETE_REVIEW_REQUIRED',scanned_at:'2000-01-01T00:00:00Z'});await syncApplicationInfo('',{}, {dir:f.dir,apply:true},f.io);assert.equal(f.writes(),0);}finally{f.cleanup();}});
