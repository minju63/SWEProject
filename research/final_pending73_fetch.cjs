const fs=require('node:fs'),path=require('node:path');const d=path.join(__dirname,'raw_2026-10-02/candidate_verification');let t=JSON.parse(fs.readFileSync(path.join(d,'pending_73_fetch_targets.json'),'utf8'));function add(id,URL){t.push({id,URL});}
add('20250917005400211730','https://www.nmhs.or.kr/00002/00018.web');
add('20250917005400211730','https://nmhs.or.kr/00001/00012.web');
add('20250917005400211730','https://www.nmhs.or.kr/00029/00067/00102.web');
add('20250917005400211730','https://www.gndamoa.or.kr/01328/01329/01329.web?amode=view&cpage=3&gcode=1001&idx=4994');
add('20260929005400213651','https://www.myhome.go.kr/hws/portal/sch/selectRsdtRcritNtcDetailView.do?pblancId=12611');
add('20250714005400111219','https://www.ulsan.go.kr/s/ulsanyouth/bbs/view.do?bbsId=BBS_0000000000000316&dataId=56323&mId=008001001000000000');
const r=JSON.parse(fs.readFileSync(path.join(d,'manual_checks.json'),'utf8'));for(const s of r.filter(s=>s.plcyNo==='20260921005400113499'&&s.file)){const h=fs.readFileSync(path.join(d,s.file),'utf8');if(h.includes('선택형')){for(const m of h.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g))if(/나눔형|일반형/.test(m[2])&&m[1].includes('View.do'))add(s.plcyNo,new URL(m[1],s.URL).href);}}
t=[...new Map(t.map(x=>[x.id+'|'+x.URL,x])).values()];fs.writeFileSync(path.join(d,'pending_73_fetch_targets.json'),JSON.stringify(t,null,2));console.log('Targets '+t.length);
