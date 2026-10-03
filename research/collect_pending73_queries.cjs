const fs=require('node:fs'),path=require('node:path');
const d=path.join(__dirname,'raw_2026-10-02/candidate_verification');
const read=f=>JSON.parse(fs.readFileSync(path.join(d,f),'utf8').replace(/^\uFEFF/,''));
const p=[1,2,3,4].flatMap(i=>JSON.parse(fs.readFileSync(path.join(d,'..',`API_HOUSING_${i}.json`),'utf8')).result.youthPolicyList);
const targets=read('pending_73_targets.json');
const queries=targets.map(t=>{const a=p.find(x=>x.plcyNo===t.plcyNo);const u=[a.refUrlAddr1,a.refUrlAddr2,a.aplyUrlAddr].find(x=>/^https?:/.test(x)&&!/(gov.kr|bokjiro|myhome|youthcenter)/.test(x));let host=u?new URL(u).hostname.replace(/^www\./,''):'';if(/sejong/.test(host))host='sejong.go.kr';let name=t.정책명.replace(/202\d년|\(국토부\)|\(연장신청\)|\[광산구\]/g,'').trim();return {id:t.plcyNo,name:t.정책명,q:name+' '+(host?'site:'+host:a.sprvsnInstCdNm||'공식')+' 모집 공고'};});
fs.writeFileSync(path.join(d,'pending_73_search_queries.json'),JSON.stringify(queries,null,2));
console.log(JSON.stringify(queries));
