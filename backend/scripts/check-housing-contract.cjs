'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),dotenv=require('dotenv'),{createClient}=require('@supabase/supabase-js');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'research/housing_conditions_contract_2026-11-18'),front=dotenv.parse(fs.readFileSync(path.join(root,'frontend/.env'))),plan=JSON.parse(fs.readFileSync(path.join(dir,'plan.json'),'utf8'));
async function main(){
 assert.equal(new URL(front.VITE_SUPABASE_URL).hostname,'flkoszigqobfkztbvsyw.supabase.co');
 const base='http://127.0.0.1:4000/api/v1';
 const catalog=await fetch(base+'/policy-catalog',{signal:AbortSignal.timeout(45000)});assert.ok(catalog.ok);const data=(await catalog.json()).data,policies=data.policies.filter(p=>p.collection_domain==='HOUSING');assert.equal(policies.length,79);
 for(const p of policies){const wanted=plan.items.find(x=>x.policy_id===p.policy_id);assert.deepEqual(p.eligibility_conditions,wanted.values.eligibility_conditions);assert.equal(p.eligibility_verified,false);}
 const client=createClient(front.VITE_SUPABASE_URL,front.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const credentials=JSON.parse(fs.readFileSync(path.join(root,'.local/test-account.json'),'utf8'));
 const login=await client.auth.signInWithPassword({email:credentials.email,password:credentials.password});assert.ok(!login.error,'Dedicated account login failed');assert.equal(login.data.user.id,credentials.user_id);assert.equal(login.data.user.app_metadata.test_account,true);
 let endpointCount=0;try{
  for(const p of policies.filter(p=>p.eligibility_conditions.profile_contract.checks.length)){
   const r=await fetch(base+'/policies/'+p.policy_id+'/eligibility',{headers:{Authorization:'Bearer '+login.data.session.access_token},signal:AbortSignal.timeout(30000)});assert.ok(r.ok);const result=(await r.json()).data;assert.equal(result.result,'CHECK');assert.ok(result.conditions.some(c=>c.operator==='AND'&&Array.isArray(c.children)),'API still running an old eligibility engine');
   const inspect=nodes=>{for(const c of nodes){if(c.operator==='RAW')assert.equal(c.status,'UNKNOWN');if(c.children)inspect(c.children);}};inspect(result.conditions);endpointCount++;
  }
 }finally{await client.auth.signOut({scope:'local'});}
 const denied=await fetch(base+'/policies/'+policies[0].policy_id+'/eligibility');assert.equal(denied.status,401);
 const report={status:'PASS',checked_at:new Date().toISOString(),public_api_policy_count:79,canonical_json_matches_db_plan:true,full_verified_flags_false:79,real_authenticated_eligibility_endpoints:endpointCount,raw_nodes_remain_unknown:true,anonymous_eligibility_status:401,profile_and_policy_mutations:false};
 fs.writeFileSync(path.join(dir,'live_verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e instanceof assert.AssertionError?'Contract verification assertion failed: '+e.message:'Live contract verification failed; credentials omitted');process.exitCode=1;});
