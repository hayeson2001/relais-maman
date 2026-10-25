const CACHE='relais-maman-v1-20261025-r4';
const ASSETS=['./','./index.html','./styles.css','./app.mjs','./core.mjs','./training.mjs','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('relais-maman-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('./index.html')));
  else if(ASSETS.some(path=>new URL(path,self.registration.scope).pathname===url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
