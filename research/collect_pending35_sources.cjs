const fs=require('node:fs'),path=require('node:path');const d=path.join(__dirname,'raw_2026-10-02/candidate_verification');let t=JSON.parse(fs.readFileSync(path.join(d,'pending_73_fetch_targets.json'),'utf8'));function add(id,URL){t.push({id,URL});}
add('20260922005400113528','https://www.opm.go.kr/opm/info/youth_implementation.do?articleLimit=10&articleNo=162111&mode=view');
add('20260331005400212369','https://www.gb.go.kr/Main/chi_b/page.do?BD_CODE=bbs_bodo&B_LEVEL=0&B_NUM=506114201&B_STEP=506114200&cmd=2&mnu_uid=6792');
add('20260330005400212316','https://youth.wanju.go.kr/board/view.wanju?boardId=BBS_0000021&dataSid=72628&menuCd=DOM_000000113001000000&orderBy=REGISTER_DATE+DESC&paging=ok&startPage=2');
add('20251219005400212035','https://www.jeonnam.go.kr/M7116/boardView.do?menuId=jeonnam0202000000&seq=1958461');
add('20250903005400111595','https://www.gbhome.kr/');
add('20250901005400211561','https://www.cs.go.kr/00002660/00002663/00002715.web');
for(const id of ['20250716005400111306','20250714005400111222']){const r=JSON.parse(fs.readFileSync(path.join(d,'manual_checks.json'),'utf8')).find(r=>r.plcyNo==='20260421005400212798'&&r.URL.includes('brokerage-fees'));const h=fs.readFileSync(path.join(d,r.file),'utf8');for(const m of h.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g))if(/청년월세 한시/.test(m[2]))add(id,new URL(m[1],r.URL).href);}
t=[...new Map(t.map(x=>[x.id+'|'+x.URL,x])).values()];fs.writeFileSync(path.join(d,'pending_73_fetch_targets.json'),JSON.stringify(t,null,2));console.log('Targets '+t.length);
