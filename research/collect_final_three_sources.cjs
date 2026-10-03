const fs=require('fs'),path=require('path'),d=path.join(__dirname,'raw_2026-10-02/candidate_verification');
const f=path.join(d,'pending_73_fetch_targets.json'),all=JSON.parse(fs.readFileSync(f,'utf8'));
fs.writeFileSync(path.join(d,'pending_73_fetch_targets_full.json'),JSON.stringify(all,null,2));
fs.writeFileSync(f,JSON.stringify([
{id:'20260311005400112113',URL:'https://www.evaluation.go.kr/upload2/atch/eval/20260608093307684.pdf'},
{id:'20250618005400111006',URL:'https://www.opm.go.kr/opm/info/youth_implementation.do?articleNo=159017&attachNo=147916&mode=download'},
{id:'20250917005400211729',URL:'https://youth.incheon.go.kr/nationalpolicy/nationalpolicyDetail.do?pgno=18&plcyNo=20250917005400211729'}
],null,2));
