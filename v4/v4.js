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
  // どこで止まったかを画面に出す（2026-11-28 iPhoneのSafariでロード画面のまま止まり、Googleに何も届いていなかったため）
  W.stage = '始め'; const stg = s => { W.stage = s; };
  window.addEventListener('error', e => { stg('エラー：' + (e.message || e)); });
  window.addEventListener('unhandledrejection', e => { stg('エラー：' + ((e.reason && e.reason.message) || e.reason)); });
  function showStage() {
    if (W.tr || W.off) return; const sp = document.getElementById('sp'); if (!sp) return;
    let x = document.getElementById('v4st'); if (!x) { x = document.createElement('div'); x.id = 'v4st'; x.style.cssText = 'position:absolute;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));text-align:center;color:#8e8e93;font-size:12px;line-height:1.5;-webkit-user-select:text;user-select:text'; sp.appendChild(x); }
    x.textContent = '試し版：' + W.stage + '（つなぎ ' + (W.src ? '済' : 'まだ') + '・控え ' + (lsGet('v4bin') ? 'あり' : 'なし') + '・' + Math.round(performance.now() / 1000) + '秒）';
    setTimeout(showStage, 1000);
  }
  setTimeout(showStage, 10000);
  const lsGet = k => { try { return localStorage.getItem('swapp.' + k) || ''; } catch (e) { return ''; } };
  const lsSet = (k, v) => { try { v ? localStorage.setItem('swapp.' + k, v) : localStorage.removeItem('swapp.' + k); } catch (e) { } };

  // ===== 受け渡し役 =====
  W.call = function (fn, args, s, f, u) {
    if (CF_READ.includes(fn) && cfOk()) { // スピード計画フェーズ2：読む呼び出しは Cloudflare から。読めなければ Google へ
      cfRoute(fn, args).then(r => { if (r === undefined) return W.call0(fn, args, s, f, u); if (BOOT_FN.includes(fn) && W.tr && !W.tf) { W.tf = Math.round(performance.now()); logFresh(); } if (s) try { s(r, u); } catch (e) { console.error(e); } })
        .catch(e => { CF.down = Date.now() + 60000; console.warn('Cloudflare', e); W.call0(fn, args, s, f, u); });
      return;
    }
    if (WRITES.includes(fn)) { CF.dirty = Math.max(CF.dirty, Date.now() + (QUICKW.includes(fn) ? 20000 : 90000)); CF.dirtyBy = fn; } /* 急ぎの書き込み（3-3）は、画面を先に変えてあり、Cloudflare にも約10秒で写るので20秒だけ */ // 書いた直後の90秒は Google から読む（自分の操作をすぐ見せる。Cloudflare に写るのは最大1分ほどあと）
    W.call0(fn, args, s, f, u);
  };
  W.call0 = function (fn, args, s, f, u) {
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
    stg('つなぎを開いています'); br = document.createElement('iframe'); br.style.display = 'none'; br.title = 'つなぎ';
    br.src = EXEC + '?bridge=1&k=' + encodeURIComponent(K) + '&d=' + encodeURIComponent(dev) + '&ua=' + encodeURIComponent(devName());
    document.body.appendChild(br);
    setTimeout(() => { if (W.src) return; W.q.splice(0).forEach(m => W.done({ id: m.id, ok: 0, m: 'NetworkError: つなぎが答えません' })); }, 25000);
  }
  window.addEventListener('message', e => {
    const d = e.data; if (!GORG.test(e.origin) || !d || typeof d !== 'object') return;
    if (d.t === 'swapp:bridge') {
      stg(d.ok ? 'つながった' : 'つなぎが断った（' + d.why + '）'); if (!d.ok) { lsSet('v4ak', ''); toV3(d.why === 'key' ? '合言葉が違います' : ''); return; }
      W.src = e.source; W.org = e.origin; W.tb = Math.round(performance.now());
      lsSet('v4ak', d.ak); lsSet('v4who', d.who); lsSet('v4build', d.build); lsSet('v4cw', d.cw ? '1' : ''); if (d.ks) { lsSet('v4ks', d.ks); lsSet('v4ku', d.ku); } lsSet('v4cs', d.cs ? '1' : '');
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
    let buf = await cachedBin(), boot = null;
    // 2026-11-28 天田さん「最新じゃないものだったら逆に見せない方がマシ」：Cloudflare から最新の一覧を取ってから出す。取れなければ受け渡し役（Google）の一覧を待つ
    if (fromCache) { if (!buf) return; try { stg('最新の一覧を取っています'); boot = await cfSync(); W.tcf = Math.round(performance.now()); } catch (e) { console.warn('Cloudflare', e); return; } }
    if (W.started) return; W.started = true; W.cached = false;
    try {
      stg('束を取っています'); if (!buf) buf = await netBin();
      stg('束を開いています'); let html; try { html = await openBin(buf, ak); } catch (e) { buf = await netBin(); html = await openBin(buf, ak); }
      stg('一覧を待っています'); if (!boot) { try { boot = await cfSync(); } catch (e) { boot = await new Promise((ok, ng) => W.call0('listCases', [{ __k: K, __d: dev }], ok, ng)); } }
      stg('画面を描いています'); render(html, boot);
    } catch (e) { console.error(e); stg('エラー：' + (e && e.message || e)); W.started = false; setTimeout(() => { if (!W.tr) toV3(''); }, 20000); }
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
    window.addEventListener('message', function rd(e) { if (e.source === f.contentWindow && e.data === 'swapp:ready') { W.tr = Math.round(performance.now()); window.removeEventListener('message', rd); setTimeout(cfLive, 500); } });
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
    W.call('logTiming', [devName(), { v4: 1, cf: W.tcf || 0, cached: W.cached ? 1 : 0, bridge: W.tb, ready: W.tr, fresh: W.tf, o: Math.round(performance.timeOrigin), w: innerWidth }, { __k: K, __d: dev }], null, null);
  }

  // ===== スピード計画フェーズ2（2026-11-28。母艦 01_経営/SWAPP_スピード計画.md）：一覧・案件の中身は Cloudflare に暗号で置いてある =====
  // 自宅Mac（cfsync.mjs）が Google から写して暗号にしたもの。共通の鍵（v4ks）と自分の鍵（v4ku）は受け渡し役が渡す
  const API = 'https://swapp-api.laude-master.workers.dev';
  const CF_READ = ['listCases', 'listAuto', 'getCase', 'getCases', 'prefetch', 'pulse'];
  const RO = CF_READ.concat(['schedRange', 'uiPart', 'quoteList', 'replyChannels', 'takeNotices', 'searchLogs', 'inboxList', 'inboxThread', 'offlinePack', 'filesAll', 'logOpen', 'logErr', 'logTiming', 'ping', 'fixSeenLog',
    /* 自分の画面の中だけで済む書き込み（既読・設定・並び順・知らせの既読など）は、書いたあとも Cloudflare から読んでよい。
       2026-11-29：案件を開くたびの既読（setSeen）で90秒ずっと Google から読み、知らせ係の知らせも止まっていた */
    'setSeen', 'setPrefs', 'setFileOrder', 'tblSet', 'setMemoLen', 'setSchFill', 'setSchMap', 'setMemoOwn', 'popDone', 'popAct', 'askAnswer', 'siteNotified']);
  /* 書いたあと90秒は Google から読む操作（共有の一覧・案件を変えるもの）。2026-11-29：前は「読む以外は全部」としていて、読むだけの cmtList などでも知らせが止まった。
     ここにない書き込みは、自宅Mac が5〜10秒で Cloudflare に写すので、自分の操作が見えるまで数秒待つだけ */
  const QUICKW = ['saveField', 'decideProposal', 'saveStatusAs', 'lagDismiss', 'setCompany', 'addCase']; // App.html の RUN_QUICK と同じ
  const WRITES = ['saveField', 'saveStatusAs', 'decideProposal', 'lagDismiss', 'saveMemo', 'deleteMemo', 'setAssignee', 'setFlag', 'setNoReply', 'setTask', 'taskHand', 'addIdea', 'setIdea',
    'setCaseDate', 'saveSite', 'siteShare', 'saveHand', 'saveRel', 'setCompany', 'addCase', 'caseMerge', 'msgMove', 'msgCopy', 'umAssign', 'umAssignMsgs', 'umNewCase', 'umNote', 'umAiUndo',
    'cmtAdd', 'cmtDel', 'addFeedback', 'fbDecide', 'replyFeedback', 'schedOp', 'quoteSave', 'sendReply', 'chSend', 'inboxSend', 'cancelPlan', 'caseFileAdd', 'caseAlbumAdd', 'peopleOp', 'setNoGon', 'keepOff'];
  const CF = { st: null, keys: {}, cases: {}, dirty: 0, down: 0 };
  W.cf = CF; // 調べる用（診断・内蔵ブラウザから中の様子を見る）
  const CF_FRESH = 180000; // 最後に写してから3分を超えたら古いとみなす（写すのはふだん45〜60秒ごと）
  const cfOk = () => lsGet('v4ks') && lsGet('v4ku') && Date.now() > CF.dirty && Date.now() > CF.down;
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function unseal(s, h) {
    const key = CF.keys[h] || (CF.keys[h] = await crypto.subtle.importKey('raw', hex(h), 'AES-GCM', false, ['decrypt']));
    const b = b64(s), gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, key, b.slice(12));
    return JSON.parse(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  }
  async function cfPost(path, body, ms) { // 本文は文字（text/plain）で送る：前もっての確認（preflight）の往復を省く
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), ms || 4000);
    try { const r = await fetch(API + path, { method: 'POST', body: JSON.stringify(Object.assign({}, body, { k: K, d: dev })), signal: ac.signal }); const j = await r.json(); if (!j.ok) throw new Error('Cloudflare：' + (j.error || r.status)); return j; } finally { clearTimeout(tm); }
  }
  function cfLoad() {
    if (!CF.st) { try { CF.st = JSON.parse(localStorage.getItem('swapp.cfst') || 'null'); } catch (e) { CF.st = null; } }
    if (!CF.st || CF.st.who !== lsGet('v4who')) CF.st = { v: 0, L: {}, LM: null, U: null, who: lsGet('v4who') };
    return CF.st;
  }
  function cfSave() { setTimeout(() => { try { localStorage.setItem('swapp.cfst', JSON.stringify(CF.st)); } catch (e) { } }, 0); }
  async function cfSync() {
    const ks = lsGet('v4ks'), ku = lsGet('v4ku'); if (!ks || !ku) throw new Error('鍵がありません');
    const st = cfLoad(), j = await cfPost('/sync', { since: st.v }, 4000);
    if (!(Date.now() - (j.at || 0) < CF_FRESH)) throw new Error('Cloudflare の写しが古い'); // 自宅Mac が止まっているかもしれない：古い中身を最新として見せず Google から読む
    await Promise.all(j.items.map(async it => {
      const k = it.k;
      if (k === 'LM') st.LM = await unseal(it.data, ks);
      else if (k.indexOf('L:') === 0) { if (it.data) st.L[k.slice(2)] = await unseal(it.data, ks); else delete st.L[k.slice(2)]; }
      else if (k.indexOf('U:') === 0 && it.data) st.U = await unseal(it.data, ku);
    }));
    st.v = j.v; if (j.items.length) cfSave();
    if (!st.LM || !st.U) throw new Error('一覧がまだありません');
    const lm = st.LM;
    return { at: lm.at, ts: lm.ts, list: lm.order.map(id => st.L[id]).filter(Boolean), marks: lm.marks, v2: Object.assign({}, lm.v2, { fb: st.U.fb }), members: lm.members, mmails: lm.mmails, seen: st.U.seen, prefs: st.U.prefs };
  }
  // 案件の中身：画面が欲しい版（ver）と同じものがあれば返す。なければ undefined（Google へ）
  async function cfCases(ids) {
    const want = ids.filter(id => !CF.cases[id]);
    if (want.length) { const j = await cfPost('/cases', { ids: want.slice(0, 40) }, 4000); await Promise.all(j.items.map(async it => { if (it.data) CF.cases[it.k.slice(2)] = await unseal(it.data, lsGet('v4ks')); })); }
  }
  async function cfRoute(fn, args) {
    if (fn === 'listCases' || fn === 'listAuto') return await cfSync();
    if (fn === 'pulse') { const j = await cfPost('/ver', {}, 3000); if (!(Date.now() - (j.at || 0) < CF_FRESH)) return undefined; const lm = (CF.st && CF.st.LM) || {}; return 'cf' + j.v + '\t' + (lm.build || '') + '\t' + (lm.force || ''); }
    if (fn === 'prefetch') { const ids = (args[0] || []).map(x => String(x).split('|')[0]); cfCases(ids).catch(() => { }); return true; }
    if (fn === 'getCase') {
      const id = String(args[0] || ''), ver = String(args[1] || ''); delete CF.cases[id]; await cfCases([id]);
      const o = CF.cases[id]; return o && (!ver || o.v === ver) ? o.d : undefined;
    }
    if (fn === 'getCases') {
      const l = (args[0] || []).map(x => String(x).split('|')); await cfCases(l.map(x => x[0]));
      const out = l.map(([id, ver]) => { const o = CF.cases[id]; return o && (!ver || o.v === ver) ? { id, v: ver || '', d: o.d, chan: o.chan } : null; });
      return out.every(x => x === null) ? undefined : out;
    }
    return undefined;
  }

  // ===== 知らせ係とつなぎっぱなしにする（スピード計画フェーズ3-2。2026-11-29）=====
  // Cloudflare の中身が変わったら「変わった（番号）」が届く。自分の手元より新しければ、すぐ画面に読み直させる（15秒ごとの確認を待たない）
  function cfLive() {
    if (CF.ws && CF.ws.readyState < 2) return; if (!lsGet('v4ks')) return;
    let ws; try { ws = new WebSocket(API.replace(/^https/, 'wss') + '/ws'); } catch (e) { return; }
    CF.ws = ws;
    ws.onopen = () => { try { ws.send(JSON.stringify({ t: 'auth', k: K, d: dev })); } catch (e) { } CF.wsWait = 1000; clearInterval(CF.ping); CF.ping = setInterval(() => { try { ws.send('ping'); } catch (e) { } }, 45000); };
    ws.onmessage = e => {
      if (e.data === 'pong') return; let m = null; try { m = JSON.parse(e.data); } catch (x) { return; }
      if ((m.t === 'v' || m.t === 'hello') && m.v > ((CF.st && CF.st.v) || 0)) cfPoke();
    };
    ws.onclose = () => { clearInterval(CF.ping); if (CF.ws === ws) CF.ws = null; if (document.visibilityState === 'visible') setTimeout(cfLive, CF.wsWait = Math.min((CF.wsWait || 1000) * 2, 30000)); };
  }
  // 画面に「今すぐ一覧を読み直して」と頼む（開いている案件も、版が変わっていれば読み直される）
  function cfPoke() { if (Date.now() < CF.dirty) return; const f = document.getElementById('app'); try { f.contentWindow.eval('AR_BUSY = 0; autoRefresh();'); CF.pokes = (CF.pokes || 0) + 1; } catch (e) { } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && W.tr) cfLive(); });

  // v3 の open() の先頭から呼ばれる。true＝ここで開いた
  function openV4() {
    if (W.off) return false;
    K = lsGet('k'); if (!K) return false;
    if (lsGet('v4lag') && lsGet('v4lag') === lsGet('v4build')) { // 束が追いついていない：今回は v3。追いついたかは裏で見る
      latest().then(l => { if (Number(l.b) >= Number(lsGet('v4lag'))) { lsSet('v4lag', ''); netBin(l).catch(() => { }); } }).catch(() => { }); /* 版は日時の番号なので、同じか新しい束が出ていれば戻す（2026-11-28 ぴったり同じを待っていて、公開が続くと v3 のままになった） */
      W.off = true; return false;
    }
    document.getElementById('gate').classList.remove('on');
    bridge(); start(true);
    return true;
  }
  return { open: openV4 };
})();
