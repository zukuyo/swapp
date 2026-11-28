/* SoundWich APP の GitHub版（試し。2026-11-28 天田さん「今から作ってみて、どっちが早いか検証してから、どっちにするか決めようか」）
   v4/index.html は v3/index.html をもとに build.mjs が作る（起動画面・合言葉・招待・2画面・控え off.js は v3 と同じ）。v3 の open() の先頭で V4.open() を呼び、
   ここで開けたら v3 の開き方（Googleの画面を枠に入れる）は使わない。
   開き方：端末に取っておいた画面の束（暗号）と前回の一覧ですぐ描く。Googleは見えない枠の受け渡し役（doGet ?bridge=1）だけで、画面の google.script.* をそこへ流す。
   v3 に回すとき：合言葉がない・許可されていない端末・束がGoogleの版に追いついていない（自宅Macの自動修正が出したあと、メインMacで束を作るまで） */
window.V4 = (function () {
  const GORG = /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/;
  const BOOT_FN = ['listCases', 'listAuto', 'refreshAll'];
  const W = window.SW4 = { src: null, org: '', q: [], pend: {}, id: 0, tb: 0, tr: 0, tf: 0, cached: false, started: false, off: false };
  let K = '', br = null;
  const lsGet = k => { try { return localStorage.getItem('swapp.' + k) || ''; } catch (e) { return ''; } };
  const lsSet = (k, v) => { try { v ? localStorage.setItem('swapp.' + k, v) : localStorage.removeItem('swapp.' + k); } catch (e) { } };

  // ===== 受け渡し役 =====
  W.call = function (fn, args, s, f, u) {
    const id = ++W.id; W.pend[id] = { s, f, u, fn };
    // 受け渡し役が一緒に持ってきた最新の一覧があれば、開いた直後の読み直しはそれで答える（往復1回ぶん早い）
    if (W.early && BOOT_FN.includes(fn) && fn !== 'refreshAll') { const r = W.early; W.early = null; setTimeout(() => W.done({ id, ok: 1, r }), 0); return; }
    const m = { t: 'swapp:call', id, fn, args };
    if (W.src) W.post(m); else W.q.push(m);
  };
  W.post = function (m) { try { W.src.postMessage(m, W.org); } catch (e) { W.done({ id: m.id, ok: 0, m: 'NetworkError: ' + e }); } };
  W.done = function (d) {
    const p = W.pend[d.id]; if (!p) return; delete W.pend[d.id];
    if (d.ok) {
      if (BOOT_FN.includes(p.fn) && d.r && d.r.list) { saveBoot(d.r); if (W.tr && !W.tf) { W.tf = Math.round(performance.now()); logFresh(); } }
      if (p.s) try { p.s(d.r, p.u); } catch (e) { console.error(e); }
    } else { const er = new Error(d.m); if (p.f) try { p.f(er, p.u); } catch (e) { console.error(e); } else console.error(er); }
  };
  W.hist = function (kind, st, pa) {
    const q = new URLSearchParams(pa || {}); const so = new URLSearchParams(location.search).get('solo'); if (so && !q.get('solo')) q.set('solo', so);
    const u = location.pathname + (q.toString() ? '?' + q.toString() : '') + location.hash;
    try { kind === 'replace' ? history.replaceState(st, '', u) : history.pushState(st, '', u); } catch (e) { }
  };
  function bridge() {
    if (br) return;
    br = document.createElement('iframe'); br.style.display = 'none'; br.title = 'つなぎ';
    br.src = EXEC + '?bridge=1&k=' + encodeURIComponent(K) + '&d=' + encodeURIComponent(dev) + '&ua=' + encodeURIComponent(devName());
    document.body.appendChild(br);
    setTimeout(() => { if (W.src) return; W.q.splice(0).forEach(m => W.done({ id: m.id, ok: 0, m: 'NetworkError: つなぎが答えません' })); }, 25000);
  }
  window.addEventListener('message', e => {
    const d = e.data; if (!GORG.test(e.origin) || !d || typeof d !== 'object') return;
    if (d.t === 'swapp:bridge') {
      if (!d.ok) { lsSet('v4ak', ''); toV3(d.why === 'key' ? '合言葉が違います' : ''); return; }
      W.src = e.source; W.org = e.origin; W.tb = Math.round(performance.now());
      lsSet('v4ak', d.ak); lsSet('v4who', d.who); lsSet('v4build', d.build); lsSet('v4cw', d.cw ? '1' : ''); lsSet('v4cs', d.cs ? '1' : '');
      if (d.boot && d.boot.list) { saveBoot(d.boot); if (!d.boot.stale) { W.early = d.boot; setTimeout(() => { W.early = null; }, 15000); } }
      W.q.splice(0).forEach(m => { if (W.early && BOOT_FN.includes(m.fn) && m.fn !== 'refreshAll') { const r = W.early; W.early = null; W.done({ id: m.id, ok: 1, r }); } else W.post(m); });
      checkBin(d.build);
      if (!W.started) start(false);
    } else if (d.t === 'swapp:res') W.done(d);
  });
  // v3 の開き方に戻す（受け渡し役・試しの画面を片付けてから）
  function toV3(msg) {
    W.off = true; W.started = true;
    ['app'].forEach(id => { const x = document.getElementById(id); if (x) x.remove(); });
    if (br) { br.remove(); br = null; }
    if (msg) { lsSet('k', ''); gate(msg); } else open();
  }

  // ===== 前回の一覧・画面の束 =====
  function saveBoot(v) { setTimeout(() => { try { const c = Object.assign({}, v); delete c.srv; delete c.stale; localStorage.setItem('swapp.v4boot', JSON.stringify(c)); } catch (e) { } }, 0); }
  function loadBoot() { try { return JSON.parse(localStorage.getItem('swapp.v4boot') || 'null'); } catch (e) { return null; } }
  const hex = s => new Uint8Array(s.match(/../g).map(x => parseInt(x, 16)));
  async function openBin(buf, ak) {
    const key = await crypto.subtle.importKey('raw', hex(ak), 'AES-GCM', false, ['decrypt']);
    const b = new Uint8Array(buf), gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, key, b.slice(12));
    return await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  async function cachedBin() { try { const c = await caches.open('swapp-v4'); const r = await c.match('app.bin'); return r ? await r.arrayBuffer() : null; } catch (e) { return null; } }
  const latest = async () => (await fetch('latest.json?t=' + Date.now(), { cache: 'no-store' })).json();
  async function netBin(l) {
    l = l || await latest();
    const r = await fetch(l.f); if (!r.ok) throw new Error('束がありません');
    const buf = await r.arrayBuffer();
    try { const c = await caches.open('swapp-v4'); await c.put('app.bin', new Response(buf)); lsSet('v4bin', l.b); } catch (e) { }
    return buf;
  }
  // Googleの版と束の版をそろえる。新しい束があれば次に開くときのために取っておく。束が追いついていなければ、次からは v3 で開く（古い画面を出さない）
  async function checkBin(gb) {
    if (!gb || lsGet('v4bin') === gb) { lsSet('v4lag', ''); return; }
    try { const l = await latest(); if (l.b === gb) { lsSet('v4lag', ''); await netBin(l); } else lsSet('v4lag', gb); } catch (e) { }
  }

  async function start(fromCache) {
    if (W.started) return; const ak = lsGet('v4ak'); if (!ak) return;
    let buf = await cachedBin(), boot = loadBoot();
    if (fromCache && (!buf || !boot)) return; // 取っておいた分がないときは、受け渡し役を待つ
    if (W.started) return; W.started = true; W.cached = !!(fromCache && buf && boot);
    try {
      if (!buf) buf = await netBin();
      let html; try { html = await openBin(buf, ak); } catch (e) { buf = await netBin(); html = await openBin(buf, ak); }
      if (!boot) boot = await new Promise((ok, ng) => W.call('listCases', [{ __k: K, __d: dev }], ok, ng));
      render(html, boot);
    } catch (e) { console.error(e); toV3(''); }
  }
  function render(html, boot) {
    const b = Object.assign({}, boot); if (W.cached) b.stale = 1;
    b.srv = { t0: 0, l: 0, url: EXEC, b: lsGet('v4bin') || lsGet('v4build') };
    const so = new URLSearchParams(location.search).get('solo') || '';
    const v = {
      key: JSON.stringify(K), who: JSON.stringify(lsGet('v4who')), dev: JSON.stringify(dev),
      boot: JSON.stringify(b).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, ''),
      canWrite: lsGet('v4cw') ? 'true' : 'false', canSend: lsGet('v4cs') ? 'true' : 'false',
      solo: JSON.stringify(/^[a-z]{2,10}$/.test(so) ? so : ''), ui3: 'true'
    };
    Object.keys(v).forEach(k => { html = html.split('@@SWAPP_' + k + '@@').join(v[k]); });
    const shim = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"><script>(' + shimFn.toString() + ')();<\/script>';
    html = html.replace(/<head>/i, '<head>' + shim);
    const f = document.createElement('iframe'); f.id = 'app'; f.title = 'SoundWich APP'; f.allow = 'clipboard-read; clipboard-write';
    f.addEventListener('load', () => setTimeout(spOff, 15000));
    f.src = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    document.body.appendChild(f);
    window.addEventListener('message', function rd(e) { if (e.source === f.contentWindow && e.data === 'swapp:ready') { W.tr = Math.round(performance.now()); window.removeEventListener('message', rd); } });
  }
  // 画面の中で google.script.* の代わりをする（中身は親の受け渡し役に流す。url・history は入口ページのアドレスを使う。Googleの画面のときと同じ）
  function shimFn() {
    var P = window.parent.SW4;
    function prm() { var o = {}; new URLSearchParams(window.parent.location.search).forEach(function (v, k) { o[k] = v; }); return o; }
    function runner() {
      var s, f, u; var p = new Proxy({}, { get: function (_, n) {
        if (n === 'withSuccessHandler') return function (x) { s = x; return p; };
        if (n === 'withFailureHandler') return function (x) { f = x; return p; };
        if (n === 'withUserObject') return function (x) { u = x; return p; };
        return function () { P.call(String(n), Array.prototype.slice.call(arguments), s, f, u); };
      } }); return p;
    }
    window.google = { script: {
      get run() { return runner(); },
      url: { getLocation: function (cb) { setTimeout(function () { cb({ parameter: prm(), parameters: {}, hash: '' }); }, 0); } },
      history: {
        push: function (st, pa) { P.hist('push', st, pa); }, replace: function (st, pa) { P.hist('replace', st, pa); },
        setChangeHandler: function (fn) { window.parent.addEventListener('popstate', function (e) { fn({ state: e.state, location: { parameter: prm(), parameters: {}, hash: '' } }); }); }
      },
      host: { close: function () { }, setHeight: function () { }, setWidth: function () { }, origin: location.origin, editor: { focus: function () { } } }
    } };
  }
  function logFresh() {
    W.call('logTiming', [devName(), { v4: 1, cached: W.cached ? 1 : 0, bridge: W.tb, ready: W.tr, fresh: W.tf, o: Math.round(performance.timeOrigin), w: innerWidth }, { __k: K, __d: dev }], null, null);
  }

  // v3 の open() の先頭から呼ばれる。true＝ここで開いた
  function openV4() {
    if (W.off) return false;
    K = lsGet('k'); if (!K) return false;
    if (lsGet('v4lag') && lsGet('v4lag') === lsGet('v4build')) { // 束が追いついていない：今回は v3。追いついたかは裏で見る
      latest().then(l => { if (l.b === lsGet('v4lag')) { lsSet('v4lag', ''); netBin(l).catch(() => { }); } }).catch(() => { });
      W.off = true; return false;
    }
    document.getElementById('gate').classList.remove('on');
    bridge(); start(true);
    return true;
  }
  return { open: openV4 };
})();
