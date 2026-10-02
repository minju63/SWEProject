const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'raw_2026-10-02/candidate_verification'),file=path.join(dir,'manual_targets.json');
const t=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const ss=require('./housing_sources_2026-10-02.json').sources;
const jin=ss.find(s=>s.source_id==='JIN_NOTICE');
const extra=[{id:'20250115005400210266',URL:jin.URL},{id:'20250103005400210047',URL:'https://www.seosan.go.kr/welfare/contents.do?key=8879'},{id:'20250512005400210809',URL:'https://sokcho.go.kr/bo/holic/article?hlmSn=1&sn=7'},{id:'20250106005400210052',URL:'https://www.gokseong.go.kr/youth/board/list.do?bbsId=BBS_000000000000722&menuNo=103001000000&searchCategory1=&searchCategory2=&searchCategory3='}];
for(const e of extra)if(!t.some(a=>a.id===e.id&&a.URL===e.URL))t.push(e);
const jf=path.join(dir,'20250115005400210266_manual_efc0a9dcb5.html');
if(fs.existsSync(jf))for(const m of fs.readFileSync(jf,'utf8').matchAll(/goDownLoad\('([^']+)','([^']+)','([^']+)'\)/g)){
 const u=new URL('/emwp/jsp/ofr/FileDown.jsp','https://eminwon.busanjin.go.kr');
 u.searchParams.set('user_file_nm',m[1]);u.searchParams.set('sys_file_nm',m[2]);u.searchParams.set('file_path',m[3]);
 if(!t.some(a=>a.URL===u.href))t.push({id:'20250115005400210266',URL:u.href});
}
fs.writeFileSync(file,JSON.stringify(t,null,2));console.log('Added official targets: '+extra.length);
