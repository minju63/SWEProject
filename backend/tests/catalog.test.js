import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {supabase} from '../src/lib/supabase.js';
import catalog from '../src/routes/catalog.routes.js';
import {errorHandler} from '../src/middlewares/error.js';
test('catalog reads beyond 500 records, batches statuses and returns no partial catalog on a source error',async()=>{
 const old=supabase.from,rows=Array.from({length:1001},(_,i)=>({policy_id:String(i),item_type:i%10===0?'EVENT':'POLICY',collection_domain:'JOB'})),ranges=[],statusIds=[];let failure=false;
 supabase.from=table=>({select(){return this},order(){return this},range(start,end){assert.equal(table,'policy');ranges.push([start,end]);return Promise.resolve(failure?{error:new Error('source unavailable')}:{data:rows.slice(start,end+1),error:null})},in(field,ids){assert.equal(table,'v_policy_status');assert.equal(field,'policy_id');assert(ids.length<=100);statusIds.push(...ids);return Promise.resolve({data:ids.map(id=>({policy_id:id,recruitment_status:'상시',d_day:null})),error:null})}});
 const app=express();app.use(catalog);app.use(errorHandler);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{let response=await fetch('http://127.0.0.1:'+server.address().port+'/policy-catalog');assert.equal(response.status,200);const {data}=await response.json();assert.equal(data.totalCount,1001);assert.equal(data.policies.length+data.events.length,1001);assert.equal(new Set(statusIds).size,1001);assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);assert.equal(data.policies[0].recruitment_status,'상시');failure=true;response=await fetch('http://127.0.0.1:'+server.address().port+'/policy-catalog');assert.equal(response.status,500);assert.equal((await response.json()).success,false)}finally{supabase.from=old;await new Promise(r=>server.close(r))}
});
