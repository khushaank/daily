const CACHE='daily-brief-shell-v3';
const FILES=['./index.html','./style.css?v=3','./app.js?v=3','./engine.js?v=3','./sounds.js?v=3','./task-motion.js?v=3','./icon.svg','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png','./audio/complete.wav','./audio/tap.wav'];
const base=self.registration.scope;
const shellURL=new URL('./index.html',base).href;
const allowedPaths=new Set(FILES.map(file=>new URL(file,base).pathname));

async function isAppShell(response){
  return response.ok&&response.headers.get('content-type')?.includes('text/html')&&(await response.clone().text()).includes('<main id="app">');
}
async function audioRange(response,header){
  if(!header)return response;
  const match=/^bytes=(\d*)-(\d*)$/.exec(header);
  if(!match||!match[1]&&!match[2])return response;
  const buffer=await response.arrayBuffer(),length=buffer.byteLength;
  const start=match[1]?Number(match[1]):Math.max(0,length-Number(match[2]));
  const end=match[1]?(match[2]?Math.min(Number(match[2]),length-1):length-1):length-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start> end||start>=length)return new Response(null,{status:416,headers:{'content-range':`bytes */${length}`}});
  return new Response(buffer.slice(start,end+1),{status:206,headers:{'content-type':response.headers.get('content-type')||'audio/wav','accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${length}`,'content-length':String(end-start+1)}});
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.all(FILES.map(async file=>{
      const url=new URL(file,base).href,response=await fetch(url,{cache:'reload',credentials:'same-origin'});
      if(!response.ok)throw Error('App asset could not be cached.');
      if(url===shellURL&&!await isAppShell(response))throw Error('Sign-in pages must not be cached as the app.');
      if(url!==shellURL&&response.headers.get('content-type')?.includes('text/html'))throw Error('App asset was blocked by sign-in.');
      await cache.put(url,response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith('daily-brief-shell-')&&key!==CACHE)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==new URL(base).origin)return;
  if(request.mode==='navigate'&&(url.pathname===new URL(base).pathname||url.pathname===new URL(shellURL).pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const response=await fetch(request);
        if(await isAppShell(response))await cache.put(shellURL,response.clone());
        return response;
      }catch{
        return await cache.match(shellURL)||new Response('Open My Daily Brief online once to prepare offline use.',{status:503,headers:{'content-type':'text/plain'}});
      }
    })());
  }else if(allowedPaths.has(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE),cached=await cache.match(request.url);
      if(cached)return url.pathname.endsWith('.wav')?audioRange(cached,request.headers.get('range')):cached;
      const response=await fetch(request);
      if(response.ok&&!response.headers.get('content-type')?.includes('text/html'))await cache.put(request.url,response.clone());
      return response;
    })());
  }
});
