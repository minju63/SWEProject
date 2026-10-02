import fs from 'node:fs';
import path from 'node:path';
import {getDocument} from './.tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const root=path.join(import.meta.dirname,'raw_2026-10-02','candidate_verification');
for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.pdf'))){const file=path.join(root,f);if(fs.existsSync(file+'.txt'))continue;try{const doc=await getDocument({data:new Uint8Array(fs.readFileSync(file)),useSystemFonts:true}).promise;const pages=[];for(let i=1;i<=doc.numPages;i++){const c=await(await doc.getPage(i)).getTextContent();pages.push('[PAGE '+i+']\n'+c.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join(''));}fs.writeFileSync(file+'.txt',pages.join('\n\n'));console.log(f+' '+doc.numPages+' pages');await doc.cleanup();}catch(e){console.log(f+' ERROR '+e.message);}}
