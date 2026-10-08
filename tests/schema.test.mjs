import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const doc={version:1,tasks:[],habits:[],completions:{}};
test('SQL setup enforces owner isolation, shape checks and revision conflicts',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${A}'),('${B}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    const sql=await readFile(new URL('../supabase/setup.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${A}';`);
    const first=await db.query('select * from public.save_daily_plan($1,$2,0)',[A,doc]);assert.equal(first.rows[0].revision,1);
    assert.equal((await db.query('select * from public.save_daily_plan($1,$2,0)',[A,doc])).rows.length,0);
    assert.equal((await db.query('select * from public.save_daily_plan($1,$2,1)',[A,doc])).rows[0].revision,2);
    assert.equal((await db.query('select * from public.save_daily_plan($1,$2,1)',[A,doc])).rows.length,0);
    await assert.rejects(db.query('select * from public.save_daily_plan($1,$2,2)',[B,doc]),/Account does not match/);
    await assert.rejects(db.query('update daily_plans set user_id=$1 where user_id=$2',[B,A]),/row-level security/);
    await assert.rejects(db.query('select * from public.save_daily_plan($1,$2,2)',[A,{version:1,tasks:[],habits:[]}]),/daily_plan_shape/);
    await db.exec(`set request.jwt.claim.sub='${B}';`);
    assert.equal((await db.query('select * from daily_plans')).rows.length,0);
    assert.equal((await db.query('update daily_plans set revision=999 where user_id=$1 returning *',[A])).rows.length,0);
    await assert.rejects(db.query('insert into daily_plans(user_id,document) values($1,$2)',[A,doc]),/row-level security/);
    await assert.rejects(db.query('select * from public.save_daily_plan($1,$2,2)',[A,doc]),/Account does not match/);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from daily_plans'),/permission denied/);
    await assert.rejects(db.query('select * from public.save_daily_plan($1,$2,0)',[B,doc]),/permission denied/);
  }finally{await db.close();}
});
