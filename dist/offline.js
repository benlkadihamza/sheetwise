(async()=>{
 const status=document.getElementById('offline-status'),update=document.getElementById('offline-update');
 if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='OFFLINE_SETUP_ERROR')console.error('Sheetwise offline setup: '+event.data.message);});
 if(!('serviceWorker' in navigator)||!window.isSecureContext){status.textContent='Offline mode requires Safari over HTTPS.';return;}
 try{
 const existing=await navigator.serviceWorker.getRegistration('./');
 try{
 const configResponse=await fetch('./offline-config.json',{cache:'reload',credentials:'same-origin'});if(!configResponse.ok)throw Error('Sign in online to prepare offline access.');
 const config=await configResponse.json();if(!/^sheetwise-offline-[a-f0-9]{16}$/.test(config.version)||!Array.isArray(config.assets))throw Error('Invalid offline configuration.');
 const cache=await caches.open(config.version);for(const asset of config.assets){const url=new URL(asset,location.href);if(url.origin!==location.origin)throw Error('Unexpected offline asset.');const response=await fetch(url,{cache:'reload',credentials:'same-origin'});if(!response.ok||new URL(response.url).origin!==location.origin)throw Error('Could not save '+asset);const type=response.headers.get('content-type')||'';if(asset.endsWith('index.html')){if(!(await response.clone().text()).includes('<title>Sheetwise'))throw Error('Please sign in again.');}else if(type.includes('text/html'))throw Error('Unexpected sign-in page.');const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');await cache.put(url,new Response(await response.arrayBuffer(),{status:response.status,statusText:response.statusText,headers}));}
 }catch(error){if(!existing?.active){console.error('Sheetwise offline preparation: '+error.message);throw error;}}
 const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
 const ready=()=>{status.textContent=navigator.onLine?'Offline ready on this device':'Offline · changes saved on this device';};
 const offerUpdate=()=>{if(registration.waiting){update.hidden=false;update.onclick=()=>{update.disabled=true;registration.waiting.postMessage('ACTIVATE_UPDATE');};}};
 let reloadForUpdate=false;update.addEventListener('click',()=>reloadForUpdate=true);navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloadForUpdate)location.reload();else ready();});
 if(registration.active)ready();offerUpdate();registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker.addEventListener('statechange',()=>{if(worker.state==='installed'){if(registration.active)offerUpdate();else ready();}if(worker.state==='redundant'&&!registration.active)status.textContent='Offline setup incomplete. Reopen online to try again.';});});
 navigator.serviceWorker.ready.then(ready);window.addEventListener('online',ready);window.addEventListener('offline',()=>{if(registration.active)ready();});registration.update().catch(()=>{});
 }catch{status.textContent='Offline setup unavailable. Reopen online to retry.';}
})();
