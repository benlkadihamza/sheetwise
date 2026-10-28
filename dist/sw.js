// Sheetwise app shell: explicit assets only; no account pages or API responses.
const VERSION='sheetwise-offline-27ceb6a8e9d7bb89';
const ASSETS=['./index.html','./style.css','./optimizer.js','./banding.js','./units.js','./app.js','./workshop.js','./manual-geometry.js','./manual.js','./offline.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./vendor/jspdf.umd.min.js','./report-pdf.js','./report-actions.js'];
const BASE=new URL('./',self.location.href),SHELL=new URL('index.html',BASE).href;
const allowed=new Set(ASSETS.map(path=>new URL(path,BASE).pathname));
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(VERSION);for(const asset of ASSETS){if(!await cache.match(new URL(asset,BASE)))throw Error('Open the signed-in app online to prepare offline access.');}})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('sheetwise-offline-')&&key!==VERSION).map(key=>caches.delete(key)));await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==BASE.origin||request.cache==='reload')return;
 const isShell=request.mode==='navigate'&&(url.pathname===BASE.pathname||url.pathname===new URL('index.html',BASE).pathname);
 if(!isShell&&!allowed.has(url.pathname))return;
 event.respondWith((async()=>{const cache=await caches.open(VERSION),key=isShell?SHELL:new URL(url.pathname,BASE).href,cached=await cache.match(key);if(cached?.redirected){const headers=new Headers(cached.headers);headers.delete('content-encoding');headers.delete('content-length');return new Response(await cached.arrayBuffer(),{status:cached.status,headers});}return cached||fetch(request);})());
});
