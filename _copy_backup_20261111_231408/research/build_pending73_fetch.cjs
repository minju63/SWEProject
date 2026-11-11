const fs=require('node:fs'),path=require('node:path');const d=path.join(__dirname,'raw_2026-10-02/candidate_verification');const read=f=>JSON.parse(fs.readFileSync(path.join(d,f),'utf8'));
const targets=read('pending_73_fetch_targets.json');
const norm=s=>s.replace(/202\d년|지원사업|지원|사업|청년|모집|공고|[^가-힣a-zA-Z0-9]/g,'');
function score(a,b){a=norm(a);b=norm(b);if(!a.length)return 0;if(b.includes(a))return 1;const pairs=new Set(Array.from({length:a.length-1},(_,i)=>a.slice(i,i+2)));return [...pairs].filter(x=>b.includes(x)).length/Math.max(pairs.size,1);}
for(let i=0;i<73;i+=4){const r=read(`pending73_search_batch_${i}.json`);const links=[...r.raw.matchAll(/(?:^|\n)([^\n]+) \((https?:\/\/[^\n]+)\)\n/g)].map(m=>({title:m[1],URL:m[2]}));for(const q of r.queries){const found=links.filter(l=>{try{return /\.go\.kr$|\.ac\.kr$|^jejuhwc\.co\.kr$|^www\.jejuhwc\.co\.kr$|^www\.cndc\.kr$/.test(new URL(l.URL).hostname)&&score(q.name,l.title)>=.52;}catch{return false;}}).sort((a,b)=>score(q.name,b.title)-score(q.name,a.title)).slice(0,2);for(const l of found)targets.push({id:q.id,URL:l.URL,검색제목:l.title});}}
function add(id,URL){targets.push({id,URL});}
add('20260806005400213321','https://youth.gwangju.go.kr/build/js/common.js');
add('20260921005400113460','https://m.myhome.go.kr/hws/portal/cont/selectIntegratedPubRentalHouseView.do');
add('20260921005400113499','https://m.myhome.go.kr/hws/portal/cont/selectNewHomeChoiceTypeView.do');
add('20260922005400113539','https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?id=95088118&lcmspage=101');
add('20260422005400212846','https://jeju.go.kr/lifecycle/policy/list.htm?act=view&seq=60');
add('20250716005400211309','https://jeju.go.kr/lifecycle/policy/list.htm?act=view&seq=60');
add('20260421005400212798','https://www.jejuhwc.co.kr/finance/cost-support/brokerage-fees.htm');
add('20250109005400210120','https://www.jejuhwc.co.kr/finance/cost-support/brokerage-fees.htm');
add('20260506005400213142','https://youth.incheon.go.kr/dwelling/guarantee.jsp');
add('20250316005400210633','https://housing.seoul.go.kr/site/main/content/sh01_060400');
add('20250718005400211407','https://youth.incheon.go.kr/dwelling/transfer_faq.jsp');
add('20260421005400212786','https://jeju.go.kr/lifecycle/policy/list.htm?act=view&seq=64');
add('20251111005400211834','https://jeju.go.kr/lifecycle/policy/list.htm?act=view&seq=64');
add('20250903005400111595','https://www.gbhome.kr/pages/layout/A_layout/A_type/download/support_2026.pdf');
add('20250106005400210052','https://www.gokseong.go.kr/youth/board/list.do?bbsId=BBS_000000000000722&menuNo=103001000000');
const unique=[...new Map(targets.map(x=>[x.id+'|'+x.URL,x])).values()];fs.writeFileSync(path.join(d,'pending_73_fetch_targets.json'),JSON.stringify(unique,null,2));console.log(JSON.stringify(unique.map(x=>({id:x.id,url:x.URL})),null,2));
