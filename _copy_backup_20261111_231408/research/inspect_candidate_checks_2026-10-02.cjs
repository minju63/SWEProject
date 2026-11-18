const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'raw_2026-10-02','candidate_verification');
const policies=[1,2,3,4].flatMap(i=>JSON.parse(fs.readFileSync(path.join(__dirname,'raw_2026-10-02',`API_HOUSING_${i}.json`),'utf8')).result.youthPolicyList);
const checks=JSON.parse(fs.readFileSync(path.join(root,'checks.json'),'utf8'));
for(const p of policies.slice(+process.argv[2]||0,(+process.argv[2]||0)+(+process.argv[3]||20))){const c=checks.find(c=>c.plcyNo===p.plcyNo);let texts=[];for(const r of c.자료){if(r.status!==200||r.errorPage)continue;const f=r.textFile||r.file+'.txt';if(fs.existsSync(path.join(root,f))){const t=fs.readFileSync(path.join(root,f),'utf8');const ls=t.split('\n').map(s=>s.trim()).filter(s=>s&&/2026|모집기간|신청기간|접수기간|지원대상|신청대상|거주예정|전입예정|신청자격|마감/.test(s)&&s.length>8);texts.push({URL:r.URL,text:ls.slice(-16).join(' ').slice(0,800)});}}
let sr='';const alt=path.join(root,'search_alt_'+p.plcyNo+'.json');const sf=fs.existsSync(alt)?alt:path.join(root,'search_'+p.plcyNo+'.json');if(fs.existsSync(sf)){const s=JSON.parse(fs.readFileSync(sf,'utf8'));sr=(s.raw||s.error||'').slice(0,600);}
console.log(JSON.stringify(process.argv[4]==='compact'?{id:p.plcyNo,name:p.plcyNm,body:(texts[0]?.text||'본문미확보').slice(0,380),search:sr.slice(0,240)}:{id:p.plcyNo,name:p.plcyNm,org:p.sprvsnInstCdNm,original:texts.slice(0,2),search:sr}));}
