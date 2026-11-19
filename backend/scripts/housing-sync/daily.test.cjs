const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {daily}=require('./daily.cjs');
const {save}=require('./core.cjs');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'housing-daily-test-')),base=path.join(root,'research/housing-sync'),dir=path.join(base,'runs/fixture');let scans=0,imports=0,enrichments=0,fail=false;
 const io={scan:async()=>{scans++;return{dir,summary:{run_id:'fixture',status:'SCAN_COMPLETE_REVIEW_REQUIRED'}};},autoPublish:async()=>{imports++;return{status:'COMPLETE_VERIFIED'};},syncApplicationInfo:async()=>{enrichments++;if(fail)throw Error('enrichment failed');return{status:'COMPLETE_VERIFIED'};}};
 return{root,base,io,counts:()=>[scans,imports,enrichments],fail:v=>fail=v,cleanup:()=>{const target=path.resolve(root);assert(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('housing-daily-test-'));fs.rmSync(target,{recursive:true,force:true});}};
}

test('contract upgrade stops an old partial import even when an uncertain write reports zero inserts',async()=>{
 const f=fixture();try{
  save(path.join(f.base,'daily_pending.json'),{run_id:'fixture',pipeline_version:2});
  save(path.join(f.base,'runs/fixture/auto_bundle/result.json'),{status:'STOPPED_RESUME_REQUIRED',steps:[{status:'INSERTING',inserted:0}]});
  await assert.rejects(daily(f.root,{}, {},f.io),/Older partial import requires review/);
  assert.deepEqual(f.counts(),[0,0,0]);assert(fs.existsSync(path.join(f.base,'daily_pending.json')));
 }finally{f.cleanup();}
});
test('daily executes both stages once per Korean calendar day',async()=>{const f=fixture();try{await daily(f.root,{}, {},f.io);const r=await daily(f.root,{}, {},f.io);assert.equal(r.status,'ALREADY_COMPLETED_TODAY');assert.deepEqual(f.counts(),[1,1,1]);assert(!fs.existsSync(path.join(f.base,'daily.lock')));}finally{f.cleanup();}});
test('failed enrichment remains pending and resumes without another scan',async()=>{const f=fixture();try{f.fail(true);await assert.rejects(daily(f.root,{}, {},f.io),/enrichment failed/);assert(!fs.existsSync(path.join(f.base,'daily_latest.json')));assert(fs.existsSync(path.join(f.base,'daily_pending.json')));f.fail(false);await daily(f.root,{}, {},f.io);assert.deepEqual(f.counts(),[1,2,2]);assert(!fs.existsSync(path.join(f.base,'daily_pending.json')));}finally{f.cleanup();}});
test('preview never records a completed day and old pipeline completion does not skip new stage',async()=>{const f=fixture();try{await daily(f.root,{}, {apply:false},f.io);assert(!fs.existsSync(path.join(f.base,'daily_latest.json')));save(path.join(f.base,'daily_latest.json'),{result:{status:'COMPLETE_VERIFIED',finished_at:new Date().toISOString()}});await daily(f.root,{}, {},f.io);assert.deepEqual(f.counts(),[2,2,2]);}finally{f.cleanup();}});
