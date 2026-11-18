#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),config=require('./config.json');
const args=process.argv.slice(2),command=args.shift()||'scan';
function option(name){const i=args.indexOf(name);if(i===-1)return null;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing value for '+name);return args[i+1];}
(async()=>{
 if(command==='daily')return require('./daily.cjs').daily(root,config,{apply:!args.includes('--preview')});
 if(command==='application-info'){
  const base=path.join(root,'research/housing-sync'),run=option('--run')||JSON.parse(fs.readFileSync(path.join(base,'latest.json'),'utf8')).run_id;
  const result=await require('./application-info.cjs').syncApplicationInfo(root,config,{dir:require('./core.cjs').safePath(path.join(base,'runs'),run),apply:args.includes('--apply')});
  console.log(JSON.stringify({...result,steps:result.steps.length,review:result.review.length}));return result;
 }
 if(command==='scan')return require('./scan.cjs').scan(root,config,{offline:args.includes('--offline'),runId:option('--run'),resumeId:option('--resume')});
 if(command==='notices'){const value=await require('./notices.cjs').discover(config,require('./network.cjs').clients(root,config));require('./core.cjs').save(path.join(root,'research/housing-sync/notice_lists_check.json'),value);console.log(JSON.stringify({db_writes:0,coverage:value.coverage,lists:value.logs.length,notices:value.rows.length,failures:value.logs.filter(l=>l.error).length}));return;}
 if(command==='publish')return require('./publish.cjs').publish(root,config,{runId:option('--run'),reviewFile:option('--reviews'),apply:args.includes('--apply')});
 if(command==='help'||command==='--help'){console.log('node backend/scripts/housing-sync/cli.cjs scan\nnode backend/scripts/housing-sync/cli.cjs scan --offline [--run RUN_ID]\nnode backend/scripts/housing-sync/cli.cjs publish --run RUN_ID --reviews FILE\nnode backend/scripts/housing-sync/cli.cjs publish --run RUN_ID --reviews FILE --apply\nDefault scan and publish preview do not write to the database.');return;}
 throw Error('Unknown command. Use help.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
