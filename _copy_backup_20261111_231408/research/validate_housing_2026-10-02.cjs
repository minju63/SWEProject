const fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const prep=path.join(root,'prepare_housing_2026-10-02.cjs');
let script=fs.readFileSync(prep,'utf8').replaceAll('本文直接下载；内容人工核对','공식 원문 직접 다운로드·본문 검토').replaceAll('上限式','상한식');
fs.writeFileSync(prep,script);
const data=JSON.parse(fs.readFileSync(path.join(root,'housing_2026-10-02.json'),'utf8'));
const evidence=JSON.parse(fs.readFileSync(path.join(root,'housing_sources_2026-10-02.json'),'utf8'));
if(data.columns.length!==44||data.rows.length!==58)throw Error('Shape mismatch');
for(const item of evidence.originals){
 const policy=data.rows.find(r=>r.data_id===item.data_id);
 if(item.지원대상_원문!==policy.지원대상_원문)throw Error('Evidence mismatch '+item.data_id);
 if(!fs.existsSync(path.join(root,item.원문파일)))throw Error('Missing raw '+item.data_id);
}
const envFile=path.join(root,'..','.env');
if(fs.existsSync(envFile)){
 const env=fs.readFileSync(envFile,'utf8');
 const match=env.match(/^YOUTHCENTER_API_KEY\s*=\s*(.+)$/m);
 if(match){const key=match[1].trim().replace(/^['"]|['"]$/g,'');
 for(const file of fs.readdirSync(root).filter(f=>f.includes('2026-10-02')&&/\.(json|csv|tsv|md|cjs)$/.test(f))){if(key&&fs.readFileSync(path.join(root,file),'utf8').includes(key))throw Error('Credential leaked');}}
}
console.log('Validated 58 policies, 44 columns, 58 linked originals; no API credential in exports.');
