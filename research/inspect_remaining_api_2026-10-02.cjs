const fs=require('node:fs'),path=require('node:path');
const d=path.join(__dirname,'raw_2026-10-02'),targets=JSON.parse(fs.readFileSync(path.join(d,'candidate_verification','remaining_review_targets_276.json'),'utf8'));
const ps=[1,2,3,4].flatMap(i=>JSON.parse(fs.readFileSync(path.join(d,`API_HOUSING_${i}.json`),'utf8')).result.youthPolicyList);
for(const t of targets.slice(Number(process.argv[2]||0),Number(process.argv[2]||0)+Number(process.argv[3]||15))){const p=ps.find(p=>p.plcyNo===t.plcyNo);console.log(JSON.stringify({id:p.plcyNo,name:p.plcyNm,org:p.sprvsnInstCdNm,period:p.aplyYmd,benefit:p.plcySprtCn,qualification:p.addAplyQlfcCndCn,exclude:p.ptcpPrpTrgtCn,ref:[p.refUrlAddr1,p.refUrlAddr2,p.aplyUrlAddr]}));}
