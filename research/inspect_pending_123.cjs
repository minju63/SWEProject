const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'raw_2026-10-02/candidate_verification');
const read=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8').replace(/^\uFEFF/,''));
const ps=[1,2,3,4].flatMap(i=>JSON.parse(fs.readFileSync(path.join(dir,'..',`API_HOUSING_${i}.json`),'utf8')).result.youthPolicyList);
const notes=read('remaining_review_decisions.json'),rechecks=read('recheck_2026-10-03.json');
const snapshot='pending_123_targets.json';
if(!fs.existsSync(path.join(dir,snapshot)))fs.writeFileSync(path.join(dir,snapshot),JSON.stringify(read('remaining_review_targets_276.json').filter(t=>!notes[t.plcyNo]),null,2));
const targets=read(snapshot);
for(const [i,t]of targets.entries()){
 if(i<Number(process.argv[2]||0)||i>=Number(process.argv[2]||0)+Number(process.argv[3]||10))continue;
 const p=ps.find(p=>p.plcyNo===t.plcyNo),r=rechecks.find(r=>r.plcyNo===t.plcyNo);
 console.log(JSON.stringify({i,id:t.plcyNo,name:t.정책명,org:p.sprvsnInstCdNm,ref:[p.refUrlAddr1,p.refUrlAddr2,p.aplyUrlAddr],apiPeriod:p.aplyYmd,apiConditions:p.addAplyQlfcCndCn?.slice(0,500)}));
 const seen=new Set();
 for(const s of [...(r?.자료||[]),...(r?.첨부||[])]){
  const file=[s.file&&s.file+'.document.txt',s.file&&s.file+'.txt',s.textFile].filter(Boolean).find(f=>fs.existsSync(path.join(dir,f)));
  if(seen.has(file||s.URL))continue;seen.add(file||s.URL);
  const body=file?fs.readFileSync(path.join(dir,file),'utf8').replace(/\s+/g,' '):'';
  let excerpt=body;
  if(body.length>4200){
   const term=t.정책명.replace(/\([^)]*\)|202\d년|\s/g,'').slice(0,10);
   const k=body.lastIndexOf(term);const hits=[...body.matchAll(/(?:신청기간|접수기간|모집기간|신청대상|입주자격|사업대상|지원대상|사업신청기간|신청자격|모집공고일|공고 제).{0,190}/g)].slice(-8).map(m=>m[0]);
   excerpt=(k>=0?body.slice(k,k+1600):body.slice(0,450))+' '+hits.join(' | ');
  }
  const anchors=[...body.matchAll(/(?:사업개요|지원계획|지원대상|신청기간|접수기간|모집기간|입주자격|사업대상|신청자격|모집공고일).{0,240}/g)].map(m=>m[0]);
  console.log(JSON.stringify({file,status:s.status||s.error,chars:body.length,body:body.slice(0,100)+' | '+(anchors.length?anchors.slice(-2).join(' | '):body.slice(-180))}));
 }
}
