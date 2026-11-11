import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {getDocument} from './.tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const root=path.join(import.meta.dirname,'raw_2026-10-02','candidate_verification');
const known=new Map();
for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.pdf')&&fs.existsSync(path.join(root,f+'.txt'))))known.set(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex'),f+'.txt');
for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.pdf'))){const file=path.join(root,f);if(fs.existsSync(file+'.txt'))continue;const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');if(known.has(hash)){fs.copyFileSync(path.join(root,known.get(hash)),file+'.txt');console.log(f+' same-content text reused');continue;}try{const doc=await getDocument({data:new Uint8Array(fs.readFileSync(file)),useSystemFonts:true}).promise;const pages=[];for(let i=1;i<=doc.numPages;i++){const c=await(await doc.getPage(i)).getTextContent();pages.push('[PAGE '+i+']\n'+c.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join(''));}fs.writeFileSync(file+'.txt',pages.join('\n\n'));known.set(hash,f+'.txt');console.log(f+' '+doc.numPages+' pages');await doc.cleanup();}catch(e){console.log(f+' ERROR '+e.message);}}
