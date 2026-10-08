import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCloudStore} from '../cloud-store.js';
const plan = title => ({version:1,tasks:[{title}],habits:[],completions:{}});
function fixture({remote=null,dirty=false,revision=0,fail=false}={}) {
  const values=new Map(),states=[],applied=[],writes=[];
  let row=remote,broken=fail,hold=null;
  values.set('plan:A',JSON.stringify(plan('local')));
  values.set('daily-cloud-meta:A',JSON.stringify({dirty,revision}));
  const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  const client={from:()=>({select:()=>({eq:(_column,id)=>({maybeSingle:async()=>{assert.equal(id,'A');return broken?{error:Error('offline')}:{data:structuredClone(row)};}})})}),
    rpc:async(_name,args)=>{
      writes.push(args);if(hold)await hold;
      if(broken)return {error:Error('offline')};
      assert.equal(args.p_user_id,'A');
      if(args.p_expected_revision!==(row?.revision||0))return {data:[]};
      row={document:structuredClone(args.p_document),revision:(row?.revision||0)+1};
      return {data:[structuredClone(row)]};
    }};
  const store=createCloudStore({client,userId:'A',storage,cacheKey:'plan:A',apply:p=>applied.push(p),status:(...s)=>states.push(s)});
  return {store,values,states,applied,writes,remote:()=>row,setRemote:r=>row=r,setBroken:b=>broken=b,setHold:p=>hold=p};
}
test('remote account loads without importing guest data',async()=>{
  const f=fixture({remote:{revision:4,document:plan('cloud')}});await f.store.start();
  assert.equal(f.applied[0].tasks[0].title,'cloud');assert.equal(f.writes.length,0);f.store.dispose();
});
test('offline edits survive a restart and sync to the same account',async()=>{
  const f=fixture({dirty:true,revision:2,remote:{revision:2,document:plan('old')},fail:true});await f.store.start();
  assert.equal(f.states.at(-1)[1],'offline');assert.equal(JSON.parse(f.values.get('daily-cloud-meta:A')).dirty,true);
  f.setBroken(false);await f.store.retry();assert.equal(f.remote().document.tasks[0].title,'local');
  assert.equal(f.remote().revision,3);assert.equal(JSON.parse(f.values.get('daily-cloud-meta:A')).dirty,false);f.store.dispose();
});
test('concurrent changes ask for a choice before replacing either copy',async()=>{
  const f=fixture({dirty:true,revision:1,remote:{revision:2,document:plan('other phone')}});await f.store.start();
  assert.equal(f.states.at(-1)[1],'conflict');assert.equal(f.writes.length,0);assert.equal(f.applied.length,0);
  await f.store.resolve('cloud');assert.equal(f.applied[0].tasks[0].title,'other phone');f.store.dispose();
});
test('keeping this device uses the current cloud revision',async()=>{
  const f=fixture({dirty:true,revision:1,remote:{revision:2,document:plan('other')}});await f.store.start();await f.store.resolve('device');
  assert.equal(f.writes[0].p_expected_revision,2);assert.equal(f.remote().revision,3);assert.equal(f.remote().document.tasks[0].title,'local');f.store.dispose();
});
test('another save during an in-flight write is not lost',async()=>{
  const f=fixture();await f.store.start();let release;f.setHold(new Promise(r=>release=r));
  f.values.set('plan:A',JSON.stringify(plan('one')));f.store.save(plan('one'));const sync=f.store.retry();
  await new Promise(r=>setTimeout(r,0));f.values.set('plan:A',JSON.stringify(plan('two')));f.store.save(plan('two'));release();await sync;
  assert.equal(f.remote().document.tasks[0].title,'two');assert.equal(f.remote().revision,2);f.store.dispose();
});
test('sign-out during a write cannot update another account UI or metadata',async()=>{
  const f=fixture();await f.store.start();let release;f.setHold(new Promise(r=>release=r));
  f.store.save(plan('A private plan'));const sync=f.store.retry();await new Promise(r=>setTimeout(r,0));f.store.dispose();const count=f.states.length;release();await sync;
  assert.equal(f.states.length,count);assert.equal(f.writes[0].p_user_id,'A');assert.equal(JSON.parse(f.values.get('daily-cloud-meta:A')).dirty,true);
});
