// Static app-shell cache only. Never cache private API responses.
const CACHE='monday-surface02-shell-v10';
const APP=['./','./index.html','./app.css','./app.js','./file-vault.js','./app-compiler.js','./work-evidence.js','./portable-capsule.js','./encrypted-capsule.js','./mark.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('monday-surface')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;
  const isShell=APP.some(path=>new URL(path,self.registration.scope).pathname===u.pathname);
  if(!isShell)return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});}return r;}).catch(()=>caches.match(e.request)));
});
