const CACHE = 'harada-20261111-account-sync-v2';
const FILES=['./','./index.html','./app.js','./app.js?v=17','./friends.js','./friends.js?v=5','./account-sync.js?v=2','./sprite.svg','./sprite-avatar.png','./push.js','./friends-config.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./monkus.png','./forest.svg','./monkus-swing.svg','./monkus-today.svg','./monkus-growth.svg','./monkus-goals.svg','./monkus-settings.svg'];

self.addEventListener('install', event => {
  const requests = FILES.map(path => new Request(path, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('harada-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  const refresh = request.mode === 'navigate' || request.destination === 'script';
  const network = fetch(request, refresh ? { cache: 'reload' } : {});
  event.waitUntil(network.then(response => {
    if (!response.ok) return;
    const copy = response.clone();
    return caches.open(CACHE).then(cache => cache.put(request, copy));
  }).catch(() => {}));
  event.respondWith(network.catch(async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(request);
    if (saved) return saved;
    if (request.mode === 'navigate') return (await cache.match('./')) || Response.error();
    return Response.error();
  }));
});

self.addEventListener('push',event=>{let data={};try{data=event.data?.json()||{}}catch{data={body:event.data?.text()||'You have a new nudge.'}};const title=String(data.title||'Harada');const body=String(data.body||'You have a new nudge.');event.waitUntil(self.registration.showNotification(title,{body,icon:'./icon-192.png',badge:'./icon-192.png',tag:data.tag||'harada-nudge',data:{url:'./'},renotify:false}))});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const dest=new URL('./',self.registration.scope).href;const clientsList=await clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clientsList){if(client.url.startsWith(self.registration.scope)){await client.focus();return}}await clients.openWindow(dest)})())});
