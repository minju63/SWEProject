'use strict';
// Run explicitly after a reviewed release; daily collection never promotes new recipes itself.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {sectionFingerprint,sourceText}=require('./application-info.cjs');
const root=path.resolve(__dirname,'../../..'),dir=path.join(root,'research/housing_application_2026-11-17');
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
assert.equal(read('release_result.json').status,'COMPLETE_VERIFIED');
const plan=read('plan.json'),recipes=read('extra_sources.json').filter(s=>s.text).map(s=>{
 const p=plan.find(p=>p.policy_id===s.policy_id);assert(p?.set.application_process&&p?.set.required_documents);
 const fingerprint=sectionFingerprint(s.text);assert(fingerprint);assert.equal(fingerprint,sectionFingerprint(sourceText({body:s.body,body_encoding:'utf-8'})),'HTML/text fingerprint differs');
 return{policy_id:p.policy_id,title:p.title,url:s.url,reviewed_on:'2026-11-17',section_sha256:fingerprint,values:p.set};
});
assert.equal(recipes.length,10);
fs.writeFileSync(path.join(__dirname,'application-info-recipes.json'),JSON.stringify({version:1,source:'Reviewed housing application information release 2026-11-17',recipes},null,2)+'\n');
console.log('Registered official application-info recipes:',recipes.length);
