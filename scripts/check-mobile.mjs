import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json','.wav':'audio/wav','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+sep))throw Error();res.setHeader('Content-Type',mime[extname(path)]||'text/plain');res.end(await readFile(path));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
const watch=page=>page.on('pageerror',e=>errors.push(e.message));
try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();watch(page);await page.goto(origin);await page.locator('[data-login=device]').waitFor();
  assert.equal(await page.locator('[data-login=google]').isDisabled(),true);
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/daily-login.png`,fullPage:true});
  await page.locator('[data-login=device]').click();await page.locator('.task').first().waitFor();
  await page.evaluate(()=>window.originalCard=document.querySelector('.task'));
  await page.locator('[data-action=complete][data-type=t]').first().click();await page.locator('#milestone').waitFor();
  assert.equal(await page.evaluate(()=>document.querySelector('[data-task-id="starter-study"]')===window.originalCard),true);
  await page.waitForTimeout(650);assert.equal(await page.locator('.task').last().getAttribute('data-task-id'),'starter-study');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollbarWidth),'none');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#milestone button').click();await page.locator('.bottom-nav [data-view=habits]').click();
  await page.locator('[data-action=complete][data-type=h]').first().click();await page.locator('.bottom-nav [data-view=more]').click();
  await page.locator('[data-action=motion]').click();assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('reduce-motion')),true);
  await page.reload();await page.locator('.app-shell:not([hidden])').waitFor();
  assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('my-daily-brief-v1')).completions).length),2);
  // The service worker caches only app assets: device plans remain available offline.
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.locator('.app-shell:not([hidden])').waitFor();
  await context.setOffline(true);await page.reload();await page.locator('.app-shell:not([hidden])').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await context.setOffline(false);await context.close();

  const restricted=await browser.newContext({viewport:{width:320,height:650},serviceWorkers:'block'});
  await restricted.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage blocked','SecurityError');}});});
  const restrictedPage=await restricted.newPage();watch(restrictedPage);await restrictedPage.goto(origin);
  await restrictedPage.locator('[data-login=device]').click();await restrictedPage.locator('.storage-warning').waitFor();
  await restrictedPage.locator('[data-action=complete][data-type=t]').first().click();
  assert.equal(await restrictedPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await restricted.close();

  // Exercise the actual bundled SDK with a mock project, without contacting any real account.
  const signed=await browser.newContext({viewport:{width:360,height:780},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
  const today=new Date().toLocaleDateString('en-CA');
  let row={revision:1,document:{version:1,tasks:[{id:'account-task',title:'My private study task',date:today,minutes:25,category:'study'}],habits:[],completions:{},settings:{sound:true,motion:true},focus:null}};
  let writes=0;
  await signed.route('**/supabase-config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const supabaseConfig={url:'https://daily-test.supabase.co',publishableKey:'sb_publishable_test',androidRedirectUrl:'mydailybrief://auth/callback'};"}));
  await signed.route('https://daily-test.supabase.co/**',async route=>{
    const request=route.request(),url=request.url();
    if(url.includes('/rpc/save_daily_plan')){const body=request.postDataJSON();assert.equal(body.p_user_id,A);assert.equal(body.p_expected_revision,row.revision);row={revision:row.revision+1,document:body.p_document};writes++;await route.fulfill({contentType:'application/json',body:JSON.stringify([row])});}
    else if(url.includes('/rest/v1/daily_plans'))await route.fulfill({contentType:'application/json',body:JSON.stringify(url.includes(A)?row:null)});
    else if(url.includes('/logout'))await route.fulfill({status:204});
    else throw Error(`Unexpected Supabase request: ${url}`);
  });
  await signed.addInitScript(({A})=>{const exp=Math.floor(Date.now()/1000)+3600;const enc=v=>btoa(JSON.stringify(v)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');const token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:A,role:'authenticated',aud:'authenticated',exp})+'.fake';if(!localStorage.getItem('daily-test-seeded')){localStorage.setItem('sb-daily-test-auth-token',JSON.stringify({access_token:token,refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,expires_at:exp,user:{id:A,aud:'authenticated',role:'authenticated',email:'study@example.com',app_metadata:{provider:'google'},user_metadata:{full_name:'Test Learner'},created_at:new Date().toISOString()}}));localStorage.setItem('daily-test-seeded','true');}},{A});
  const accountPage=await signed.newPage();watch(accountPage);await accountPage.goto(origin);await accountPage.getByText('My private study task',{exact:true}).waitFor();
  await accountPage.locator('[data-action=complete][data-type=t]').click();await accountPage.waitForTimeout(950);
  assert.equal(writes,1);assert.equal(Object.keys(row.document.completions).length,1);
  assert.equal(await accountPage.evaluate(A=>JSON.parse(localStorage.getItem(`my-daily-brief:account:${A}`)).tasks[0].title,A),'My private study task');
  assert.equal(await accountPage.evaluate(()=>JSON.parse(localStorage.getItem('my-daily-brief-v1')).tasks[0].id),'starter-study');
  await accountPage.locator('.bottom-nav [data-view=more]').click();await accountPage.getByText('All your little wins are synced').waitFor();
  if(process.env.SCREENSHOT_DIR)await accountPage.screenshot({path:`${process.env.SCREENSHOT_DIR}/daily-account.png`,fullPage:true});
  await accountPage.locator('[data-action=account-signout]').click();await accountPage.locator('[data-login=google]').waitFor();
  assert.equal(await accountPage.locator('.app-shell').isVisible(),false);await accountPage.locator('[data-login=device]').click();
  assert.equal(await accountPage.getByText('My private study task',{exact:true}).count(),0);
  await accountPage.evaluate(({A,B})=>{const stored=JSON.parse(localStorage.getItem(`sb-daily-test-auth-token`)||'null');const exp=Math.floor(Date.now()/1000)+3600;const enc=v=>btoa(JSON.stringify(v)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');localStorage.setItem('sb-daily-test-auth-token',JSON.stringify({access_token:enc({alg:'HS256'})+'.'+enc({sub:B,role:'authenticated',exp})+'.fake',refresh_token:'fake-refresh-B',token_type:'bearer',expires_at:exp,expires_in:3600,user:{id:B,email:'second@example.com',app_metadata:{provider:'google'},user_metadata:{full_name:'Second Learner'}}}));},{A,B});
  await accountPage.reload();await accountPage.getByText('Second Learner',{exact:true}).waitFor();
  assert.equal(await accountPage.getByText('My private study task',{exact:true}).count(),0);
  assert.equal(await accountPage.evaluate(A=>JSON.parse(localStorage.getItem(`my-daily-brief:account:${A}`)).tasks[0].title,A),'My private study task');
  assert.deepEqual(errors,[]);console.log('Mobile UI, no-refresh completion, offline cache, SDK account save/sign-out and account isolation passed.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
