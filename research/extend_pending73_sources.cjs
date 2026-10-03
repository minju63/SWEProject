const fs=require('node:fs'),path=require('node:path');const d=path.join(__dirname,'raw_2026-10-02/candidate_verification');const read=f=>JSON.parse(fs.readFileSync(path.join(d,f),'utf8'));let t=read('pending_73_fetch_targets.json');function add(id,URL){t.push({id,URL});}
const rs=read('manual_checks.json');
for(const r of rs.filter(r=>r.plcyNo==='20250714005400111210'))for(const l of r.links||[])if(/download\.jsp/.test(l.URL))add(r.plcyNo,l.URL);
add('20250917005400211732','https://youth.gyeongnam.go.kr/youth/menu.es?mid=a11104000000');
add('20250917005400211732','https://baro.gyeongnam.go.kr/baro/serviceView.es?mid=a10202000000&service_no=531');
add('20250917005400211727','https://baro.gyeongnam.go.kr/baro/menu.es?mid=a10704000000');
add('20250512005400210809','https://sokcho.go.kr/bo/holic/article?hlmSn=14&sn=293');
add('20250512005400210809','https://www.sokcho.go.kr/bo/holic/article?hlmSn=14&sn=293');
add('20251217005400212010','https://www.hc.go.kr/_res/portal/data/pdf/h05010/2026/16.pdf');
add('20251217005400212016','https://www.hc.go.kr/_res/portal/data/pdf/h09773/2026_14.pdf');
add('20250219005400210457','https://anbang.daegu.go.kr/board/homeStability');
add('20250715005400211239','https://www.ulsan.go.kr/s/ulsanyouth/contents.ulsan?mId=008001001002000000');
add('20250316005400210633','https://soco.seoul.go.kr/youth/pgm/home/yohome/supportYouth1.do?menuNo=400039');
add('20250316005400210633','https://housing.seoul.go.kr/site/main/board/faq_mr/12587');
const cached=read('recheck_2026-10-03.json');for(const r of cached.filter(r=>r.plcyNo==='20260908005400213382'))for(const s of r.자료||[])for(const l of s.links||[])if(/hongik|hwasun/.test(l.URL)&&/download/i.test(l.URL))add(r.plcyNo,l.URL);
for(const r of rs.filter(r=>r.plcyNo==='20260421005400212798'&&r.URL.includes('brokerage-fees')&&r.file)){const h=fs.readFileSync(path.join(d,r.file),'utf8');for(const m of h.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g)){for(const [id,txt]of [['20260922005400113538','주거취약계층 주거상향지원'],['20260922005400113539','주거취약계층 이사비 지원']])if(m[2].includes(txt))add(id,new URL(m[1],r.URL).href);}}
t=[...new Map(t.map(x=>[x.id+'|'+x.URL,x])).values()];fs.writeFileSync(path.join(d,'pending_73_fetch_targets.json'),JSON.stringify(t,null,2));console.log('Targets '+t.length);
