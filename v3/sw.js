// 見るだけの控え（2026-11-20）：ネットがないときも、この入口のページ（と控えを出す off.js）が開けるように取っておく。
// いつもはネットから読み（5秒で返らなければ取っておいた分）、ネットがなければ取っておいた分を出す。アプリ本体（Googleの画面）はここでは扱わない
const C = 'swapp-v3-off-4';
const FILES = ['./', './off.js', '../apple-touch-icon.png', '../favicon-32.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C && k.indexOf('swapp-v3-off-') === 0).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  if (u.pathname.indexOf('/v4/') >= 0) return; // 新しい仕組み（v4）の束・v4.js・latest.json は v4 の控えに任せる（ここに溜めない・古いものを出さない。2026-11-29）
  if (e.request.mode === 'navigate' && /oauth\.html$/.test(u.pathname)) return; // Googleの確認の窓は取っておかない（2026-11-20）
  const root = new URL('./', self.registration.scope).pathname, isRoot = u.pathname === root || u.pathname === root + 'index.html';
  const key = e.request.mode === 'navigate' && isRoot ? new Request(new URL('./', self.registration.scope).href) : e.request;
  const fromCache = () => caches.match(key, { ignoreSearch: true });
  const net = fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(key, cp)); } return r; });
  e.respondWith(new Promise(ok => {
    let done = false;
    const t = setTimeout(() => fromCache().then(r => { if (r && !done) { done = true; ok(r); } }), 5000);
    net.then(r => { if (!done) { done = true; clearTimeout(t); ok(r); } })
      .catch(() => fromCache().then(r => { if (!done) { done = true; clearTimeout(t); ok(r || new Response('オフラインです', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })); } }));
  }));
});
