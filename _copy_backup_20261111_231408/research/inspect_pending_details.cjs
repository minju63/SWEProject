const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'raw_2026-10-02/candidate_verification');
for(const spec of process.argv.slice(2)){
 const [file,term]=spec.split('@'); const b=fs.readFileSync(path.join(dir,file),'utf8').replace(/\s+/g,' ');
 const k=term?b.indexOf(term):0; console.log(file+' '+b.slice(Math.max(0,k),Math.max(0,k)+2400));
}
