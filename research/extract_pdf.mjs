import fs from 'node:fs';
import {getDocument} from './.tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const input=process.argv[2];
const doc=await getDocument({data:new Uint8Array(fs.readFileSync(input)),useSystemFonts:true}).promise;
const pages=[];
for(let i=1;i<=doc.numPages;i++){
 const page=await doc.getPage(i),content=await page.getTextContent();
 pages.push(content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join(''));
}
fs.writeFileSync(input+'.txt',pages.map((p,i)=>`[PAGE ${i+1}]\n${p}`).join('\n\n'));
console.log(JSON.stringify({pages:pages.length,output:input+'.txt'}));
