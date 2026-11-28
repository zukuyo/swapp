// GitHub版（試し。2026-11-28）：入口ページと読み込む部品を端末に取っておき、開くときは取っておいた分をすぐ出して、裏でネットから新しくする（次に開くときに効く）。
// 画面の束（*.bin）と latest.json は v4.js が自分で扱うので、ここでは触らない
const C = 'swapp-v4-page-1';
const FILES = ['./', './v4.js', '../v3/off.js', '../apple-touch-icon.png', '../favicon-32.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('swapp-v4-page-') && k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET' || /\.bin$|latest\.json$/.test(u.pathname)) return;
  const root = new URL('./', self.registration.scope).pathname, isRoot = u.pathname === root || u.pathname === root + 'index.html';
  const key = e.request.mode === 'navigate' && isRoot ? new Request(new URL('./', self.registration.scope).href) : new Request(u.origin + u.pathname);
  const net = fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(key, cp)); } return r; });
  e.respondWith(caches.match(key).then(r => { if (r) { e.waitUntil(net.catch(() => { })); return r; } return net; })
    .catch(() => new Response('オフラインです', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
});
