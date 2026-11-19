'use strict';
const fs=require('node:fs'),path=require('node:path');
const {save,safePath}=require('./core.cjs');
const PIPELINE_VERSION=3;
async function daily(root,config,{apply=true}={},overrides={}){
 const base=path.join(root,'research/housing-sync');fs.mkdirSync(base,{recursive:true});
 const lock=path.join(base,'daily.lock');let fd;
 try{fd=fs.openSync(lock,'wx');}catch{throw Error('daily.lock exists; check previous process before removing lock');}
 const scan=overrides.scan||require('./scan.cjs').scan,auto=overrides.autoPublish||require('./auto.cjs').autoPublish,info=overrides.syncApplicationInfo||require('./application-info.cjs').syncApplicationInfo;
 const day=t=>new Date(t).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),completed=path.join(base,'daily_latest.json'),pending=path.join(base,'daily_pending.json');
 async function cycle(dir,runId){
  const policies=await auto(root,config,{dir,apply});
  const application=await info(root,config,{dir,apply});
  const result={...policies,pipeline_version:PIPELINE_VERSION,application_info:application,status:apply?'COMPLETE_VERIFIED':'PREVIEW',finished_at:new Date().toISOString()};
  save(path.join(dir,'daily_result.json'),result);
  if(apply){if(fs.existsSync(pending))fs.unlinkSync(pending);save(completed,{run_id:runId,result});}
  console.log(JSON.stringify(result));return result;
 }
 try{
  fs.writeFileSync(fd,JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}));
  if(apply&&fs.existsSync(completed)){
   const previous=JSON.parse(fs.readFileSync(completed,'utf8'));
   if(previous.result?.status==='COMPLETE_VERIFIED'&&previous.result.pipeline_version===PIPELINE_VERSION&&day(previous.result.finished_at)===day(Date.now())){
    const result={status:'ALREADY_COMPLETED_TODAY',run_id:previous.run_id,completed_at:previous.result.finished_at};console.log(JSON.stringify(result));return result;
   }
  }
  if(fs.existsSync(pending)){
   const value=JSON.parse(fs.readFileSync(pending,'utf8')),prior=safePath(path.join(base,'runs'),value.run_id),journal=path.join(prior,'auto_bundle/result.json');
   const j=fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal,'utf8')):null;
   if(value.pipeline_version!==PIPELINE_VERSION){
    if(!apply)throw Error('Older pending import requires review; preview will not replace its journal');
    if(j?.steps?.length&&j.status!=='COMPLETE_VERIFIED')throw Error('Older partial import requires review before contract upgrade');
    save(path.join(base,'daily_previous_contract.json'),{...value,status:j?.status||'NO_WRITES',reason:'New housing record contract requires a fresh scan'});
    fs.unlinkSync(pending);
   }else{
   if(j?.status==='STOPPED_RESUME_REQUIRED'&&j.steps.length===0&&apply){save(path.join(base,'daily_abandoned_no_writes.json'),{run_id:value.run_id,reason:j.error});fs.unlinkSync(pending);}
   else return await cycle(prior,value.run_id);
   }
  }
  const found=await scan(root,config);
  if(found.summary.status!=='SCAN_COMPLETE_REVIEW_REQUIRED')throw Error('Daily scan incomplete; no database writes. Next schedule will scan again.');
  if(apply)save(pending,{run_id:found.summary.run_id,pipeline_version:PIPELINE_VERSION});
  return await cycle(found.dir,found.summary.run_id);
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
module.exports={daily,PIPELINE_VERSION};
