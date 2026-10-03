const fs=require('node:fs'),path=require('node:path');const d=path.join(__dirname,'raw_2026-10-02/candidate_verification');const read=f=>JSON.parse(fs.readFileSync(path.join(d,f),'utf8'));let t=read('pending_73_fetch_targets.json');const rs=read('manual_checks.json');
for(const r of rs.filter(r=>t.some(x=>x.id===r.plcyNo&&x.URL===r.URL)&&r.status===200&&r.file?.endsWith('.html'))){const s=fs.readFileSync(path.join(d,r.file),'utf8');for(const m of s.matchAll(/cf_cmmFile\.download\('([^']+)',\s*'([^']+)'\)/g)){const downloadURL=new URL('/cmmfile/download/'+m[1],r.finalURL||r.URL).href+'?fileMaskNm='+m[2];t.push({id:r.plcyNo,URL:downloadURL,fetchOptions:{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'fileMaskNm='+m[2]},부모URL:r.URL});}}
function add(id,URL){t.push({id,URL});}
for(const id of ['20260421005400212786','20251111005400211834'])add(id,'https://www.jeju.go.kr/lifecycle/policy/list.htm?act=view&page=5&seq=58');
for(const id of ['20260421005400212798','20250109005400210120'])add(id,'https://www.jeju.go.kr/lifecycle/notice/guide.htm?act=download&no=1&seq=2011964');
add('20260326005400212297','https://youthforest.iksan.go.kr/board/view.iksan?boardId=BBS_0000029&dataSid=48963&menuCd=DOM_000000103001007000&paging=ok&startPage=1');
add('20260430005400212972','https://ch2030youth.kr/bbs/board.php?bo_table=notice&page=1&sod=asc&sop=and&sst=wr_datetime&wr_id=624');
add('20250917005400211732','https://youth.gyeongnam.go.kr/youth/menu.es?mid=a11402010206');
add('20250917005400211730','https://youth.gyeongnam.go.kr/youth/menu.es?mid=a11006000000');
add('20250917005400211729','https://youth.gyeongnam.go.kr/youth/menu.es?mid=a11106000000');
add('20250917005400211727','https://youth.gyeongnam.go.kr/youth/menu.es?mid=a11308000000');
add('20250714005400111222','https://www.ulsan.go.kr/s/house/bbs/view.ulsan?bbsId=BBS_0000000000000306&dataId=34595&mId=001003003000000000');
add('20250714005400111210','https://ulsan.go.kr/u/rep/transfer/notice/42105.ulsan?gosiGbn=A&mId=001004002000000000');
add('20250220005400210512','https://goesan.go.kr/DATA/bbs/251/F4FEBF7D-4751-3862-21C1-4F6CE056AD29.pdf');
add('20250117005400210321','https://www.kyungnam.ac.kr/bbs/psy/371/99170/download.do');
add('20260922005400113549','https://www.mafra.go.kr/bbs/home/795/586675/download.do');
add('20250106005400210053','https://www.gokseong.go.kr/document/kr/data/changes/2026.pdf');
for(const r of rs.filter(r=>r.plcyNo==='20260421005400212798'&&r.URL.includes('brokerage-fees')&&r.file)){const s=fs.readFileSync(path.join(d,r.file),'utf8');const names=[['20250718005400211379','일반형 매입임대주택'],['20250716005400111307','전세보증금반환보증 보증료 지원'],['20250316005400210633','청년안심주택']];for(const [id,name]of names)for(const m of s.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g))if(m[2].includes(name))add(id,new URL(m[1],r.URL).href);}
t=[...new Map(t.map(x=>[x.id+'|'+x.URL,x])).values()];fs.writeFileSync(path.join(d,'pending_73_fetch_targets.json'),JSON.stringify(t,null,2));console.log('Targets '+t.length);
