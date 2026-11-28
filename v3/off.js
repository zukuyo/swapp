// 見るだけの控え（2026-11-20 天田さん「見るだけの控え作って。『控えに入れる』ボタンは必須」）
// アプリ（Googleの画面）が30分ごとに渡してくる案件の要点と、「控えに入れる」で渡してくるファイルを、この端末の中（IndexedDB）に取っておく。
// ネットがないとき・アプリが開かないときは、それを「〇時〇分時点」として見せる。見るだけで、書く・送るはできない
(function () {
  const DB = 'swapp-off', esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let dbp = null;
  // 2：案件の画面の写し（snaps）を足した（2026-11-21 天田さん「オフラインでもこの画面の情報は全て保存されてて、おなじ表示形式でみれるように」）
  const db = () => dbp || (dbp = new Promise((ok, ng) => { const r = indexedDB.open(DB, 2); r.onupgradeneeded = () => { const d = r.result, has = n => d.objectStoreNames.contains(n); if (!has('kv')) d.createObjectStore('kv'); if (!has('files')) d.createObjectStore('files', { keyPath: 'id' }); if (!has('snaps')) d.createObjectStore('snaps', { keyPath: 'id' }); }; r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); }));
  const tx = (st, mode, fn) => db().then(d => new Promise((ok, ng) => { const t = d.transaction(st, mode), s = t.objectStore(st); const r = fn(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => ng(t.error); }));
  const kvGet = k => tx('kv', 'readonly', s => s.get(k));
  const kvPut = (k, v) => tx('kv', 'readwrite', s => s.put(v, k));
  const fAll = () => tx('files', 'readonly', s => s.getAll());
  const fPut = f => tx('files', 'readwrite', s => s.put(f));
  const fDel = id => tx('files', 'readwrite', s => s.delete(id));
  const sAll = () => tx('snaps', 'readonly', s => s.getAll());
  const sPut = x => tx('snaps', 'readwrite', s => s.put(x));
  const sDel = id => tx('snaps', 'readwrite', s => s.delete(id));
  // 外れた案件（本番の7日後・オフライン保存をやめた）の写しとファイルを、この端末から消す。アプリが渡す ids（保存する案件の全部）にないものだけ
  function prune(ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    const keep = {}; ids.forEach(x => { keep[x] = 1; });
    sAll().then(ss => (ss || []).forEach(x => { if (!keep[x.id]) sDel(x.id).catch(() => { }); })).catch(() => { });
    fAll().then(fs => (fs || []).forEach(f => { if (f.caseId && !keep[f.caseId]) fDel(f.id).catch(() => { }); })).catch(() => { });
  }
  const b64Blob = (b64, mime) => { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime || 'application/octet-stream' }); };

  // ===== アプリからの知らせ =====
  // swapp:boot：入口ページを開いてから ready までの時間をアプリに返す（2026-11-28 開く速さの計測。アプリ側が12/5まで記録）
  let READY = false;
  function onMsg(e) {
    const d = e.data;
    if (d === 'swapp:ready') { try { e.source.postMessage({ t: 'swapp:boot', o: Math.round(performance.timeOrigin), now: Date.now(), ms: Math.round(performance.now()), sp: !!document.getElementById('sp') }, '*'); } catch (er) { } READY = true; whenFree(hide); sendInfo(e.source, e.origin); return; } // 押さなくてもアプリに戻す（2026-11-28 天田さん）。ファイルを見ている途中だけ、閉じてから戻す
    if (!d || typeof d !== 'object') return;
    const reply = m => { try { e.source.postMessage(m, e.origin); } catch (er) { } };
    if (d.t === 'swapp:pack' && d.pack) { kvPut('pack', d.pack).catch(() => { }); prune(d.pack.ids); }
    if (d.t === 'swapp:css' && d.css) kvPut('css', { css: String(d.css), html: String(d.html || ''), body: String(d.body || ''), at: Date.now() }).catch(() => { });
    if (d.t === 'swapp:snap' && d.id && d.html) sPut({ id: String(d.id), html: String(d.html), at: d.at || Date.now() }).catch(() => { });
    if (d.t === 'swapp:file' && d.file && d.file.id) {
      const f = d.file;
      /* 大きいファイルは、アプリが分けて読んで Blob にしてから渡す（2026-11-21 天田さん「大きかろうと保存する方向に」） */
      fPut({ id: f.id, caseId: f.caseId || '', name: f.name || '', mime: f.mime || '', at: f.at || Date.now(), blob: f.blob instanceof Blob ? f.blob : b64Blob(f.data, f.mime) })
        .then(() => reply({ t: 'swapp:filesaved', id: f.id, name: f.name })).catch(er => reply({ t: 'swapp:fileerr', id: f.id, msg: '端末に入りませんでした（空きが足りないかもしれません）' }));
    }
    if (d.t === 'swapp:filedel' && d.id) fDel(d.id).then(() => reply({ t: 'swapp:filegone', id: d.id })).catch(() => { });
  }
  function sendInfo(src, origin) { Promise.all([fAll(), sAll().catch(() => [])]).then(([fs, ss]) => { try { src.postMessage({ t: 'swapp:offinfo', files: fs.map(f => ({ id: f.id, name: f.name, caseId: f.caseId })), snaps: (ss || []).map(x => ({ id: x.id, at: x.at })) }, origin); } catch (e) { } }).catch(() => { }); }

  // ===== 見せる =====
  const css = `
#off{position:fixed;inset:0;z-index:4;background:#1c1c1e;color:#f2f2f7;display:none;flex-direction:column;font-size:15px;-webkit-text-size-adjust:100%}
#off.on{display:flex}
#off .oh{padding:calc(10px + env(safe-area-inset-top)) 16px 10px;background:#2c2c2e;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#off .oh b{font-size:16px;flex:1;min-width:0}
#off .oh .at{font-size:12px;color:#ffd60a;width:100%}
#off .oh .at.old{color:#ff453a;font-weight:600}
#off .ob{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:6px 16px calc(80px + env(safe-area-inset-bottom))}
#off .lk{color:#0a84ff;cursor:pointer;font-weight:600;font-size:14px;white-space:nowrap}
#off .tabs{display:flex;gap:6px;padding:8px 16px;background:#1c1c1e;border-bottom:1px solid #38383a}
#off .tabs span{padding:6px 14px;border-radius:999px;background:#2c2c2e;font-size:13.5px;cursor:pointer}
#off .tabs span.on{background:#0a84ff;color:#fff}
#off h4{font-size:12px;color:#8e8e93;margin:18px 0 6px;font-weight:600;letter-spacing:.04em}
#off .it{background:#2c2c2e;border-radius:12px;padding:12px 14px;margin:8px 0;cursor:pointer}
#off .it .t{font-weight:600}
#off .it .s{font-size:13px;color:#aeaeb2;margin-top:3px}
#off .kv{display:grid;grid-template-columns:84px 1fr;gap:6px 12px;background:#2c2c2e;border-radius:12px;padding:12px 14px;font-size:14px}
#off .kv>span{color:#8e8e93;font-size:12.5px;padding-top:2px}
#off .kv>div{white-space:pre-wrap;word-break:break-word;line-height:1.5}
#off a{color:#0a84ff}
#off .cue{display:flex;gap:12px;padding:9px 12px;background:#2c2c2e;border-radius:10px;margin:5px 0}
#off .cue b{font-family:ui-monospace,Menlo,monospace;color:#64d2ff;min-width:46px}
#off .msg{background:#2c2c2e;border-radius:12px;padding:10px 12px;margin:6px 0;font-size:13.5px;white-space:pre-wrap;word-break:break-word;line-height:1.5}
#off .msg.R{background:#0a3d62}
#off .msg small{display:block;color:#8e8e93;font-size:11.5px;margin-bottom:4px}
#off .fl{display:flex;align-items:center;gap:10px;background:#2c2c2e;border-radius:10px;padding:10px 12px;margin:6px 0}
#off .fl span{flex:1;min-width:0;word-break:break-all;font-size:14px}
#off .fl.no{opacity:.45}
#off .note{color:#8e8e93;font-size:13px;line-height:1.6;margin:14px 0}
#offv{position:fixed;inset:0;z-index:6;background:#000;display:flex;flex-direction:column}
#offv .vh{padding:calc(10px + env(safe-area-inset-top)) 16px 10px;background:#1c1c1e;color:#f2f2f7;display:flex;gap:12px;align-items:center}
#offv .vh b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
#offv iframe,#offv img{flex:1;width:100%;border:0;background:#fff;object-fit:contain}
#offbar{position:fixed;left:50%;bottom:calc(76px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:3;background:#ff9f0a;color:#1c1c1e;font-weight:700;font-size:13.5px;padding:9px 16px;border-radius:999px;box-shadow:0 6px 18px rgba(0,0,0,.35);display:none;cursor:pointer;white-space:nowrap}
#offbar.on{display:block}
/* ふだんのアプリと同じ枠で出す（2026-11-21 天田さん「控えの画面を基本通常の枠と画面で出る感じに。オフラインだと使えない機能は暗くして、控えてあるところは表示される」） */
#off{flex-direction:row}
#off .nv{flex:none;width:68px;background:#232325;display:flex;flex-direction:column;gap:2px;padding:calc(12px + env(safe-area-inset-top)) 6px 12px;overflow-y:auto;border-right:1px solid #38383a}
#off .nv a{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 0 6px;border-radius:9px;color:#aeaeb2;font-size:10.5px;cursor:pointer;user-select:none;position:relative}
#off .nv a svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
#off .nv a.on{background:rgba(79,179,176,.18);color:#5ac8c4}
#off .nv a.na{opacity:.28;cursor:not-allowed}
#off .nv a.na:after{content:'';position:absolute;top:7px;right:12px;width:7px;height:7px;border-radius:50%;border:1.5px solid #8e8e93}
#off .nv a.set{margin-top:auto}
#off .mn{flex:1;min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column}
#off .oh{flex:none}
#off .oh{background:#1c1c1e;border-bottom:1px solid #38383a}
#off .oh .lg{width:28px;height:28px;border-radius:7px}
#off .oh .ver{font-weight:400;color:#8e8e93}
#off .oh .at{width:auto;flex-basis:100%;display:flex;align-items:center;gap:8px;color:#aeaeb2;font-size:12px}
#off .oh .pill{white-space:nowrap;flex:none}
#off .oh .pill{display:inline-block;background:rgba(255,159,10,.16);color:#ffb340;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600}
#off .oh .at.old .pill{background:rgba(255,69,58,.18);color:#ff6961}
#off .vt{font-size:20px;font-weight:700;margin:14px 0 4px}
#off .hnt{font-size:12px;color:#8e8e93;margin:0 0 6px}
#off .day{display:flex;gap:10px;align-items:center;background:#0f3d5e;border-radius:12px;padding:12px 14px;margin:8px 0;cursor:pointer}
#off .day em{font-style:normal;background:#5ac8c4;color:#0b2233;font-weight:700;font-size:12px;border-radius:7px;padding:3px 8px;flex:none}
#off .day b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#offtoast{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:7;background:#3a3a3c;color:#f2f2f7;font-size:13px;padding:9px 16px;border-radius:999px;box-shadow:0 6px 18px rgba(0,0,0,.4);white-space:nowrap;pointer-events:none;transition:opacity .2s}
#off .ob.snap{padding:0;display:flex;flex-direction:column;overflow:hidden}
#off .snapbar{flex:none;display:flex;gap:12px;align-items:center;padding:8px 16px;font-size:12px;color:#aeaeb2;border-bottom:1px solid #38383a}
#off .snapf{flex:1;width:100%;border:0;background:#fff;min-height:0}
@media (max-width:760px){
  #off{flex-direction:column-reverse}
  #off .nv{width:auto;flex-direction:row;overflow-x:auto;overflow-y:hidden;padding:6px 4px calc(6px + env(safe-area-inset-bottom));border-right:0;border-top:1px solid #38383a;gap:0;scrollbar-width:none}
  #off .nv::-webkit-scrollbar{display:none}
  #off .nv a{flex:0 0 calc(100% / 6);font-size:10px;padding:6px 0 4px}
  #off .nv a.on{background:transparent}
  #off .nv a.set{margin-top:0}
  #off .ob{padding-bottom:24px}
}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'off'; document.body.appendChild(el);
  const bar = document.createElement('div'); bar.id = 'offbar'; bar.textContent = 'ネットにつながっていません・オフライン保存を見る'; bar.onclick = () => show('圏外'); document.body.appendChild(bar);
  let V = { tab: 'home', id: '', why: '', from: '' }, P = null, FILES = [], SNAPS = {}, CSS = null;
  const wd = d => { try { const x = new Date(d + 'T00:00:00+09:00'); return (x.getMonth() + 1) + '/' + x.getDate() + '（' + '日月火水木金土'[x.getDay()] + '）'; } catch (e) { return d; } };
  const ymd = n => { const x = new Date(Date.now() + 9 * 3600000 + n * 86400000); return x.toISOString().slice(0, 10); };
  const hm = ms => { const x = new Date(ms); return (x.getMonth() + 1) + '/' + x.getDate() + ' ' + String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };
  const telA = s => esc(s).replace(/(\+?\d[\d\-‐ー−]{8,14}\d)/g, m => '<a href="tel:' + m.replace(/[^\d+]/g, '') + '">' + m + '</a>');
  const hh = h => h == null ? '' : String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60)).padStart(2, '0');
  function show(why) {
    V.why = why || V.why;
    Promise.all([kvGet('pack').catch(() => null), fAll().catch(() => []), sAll().catch(() => []), kvGet('css').catch(() => null)]).then(([p, fs, ss, cs]) => {
      P = p; FILES = fs || []; SNAPS = {}; (ss || []).forEach(x => { SNAPS[x.id] = x; }); CSS = cs; el.classList.add('on'); bar.classList.remove('on');
      const s = document.getElementById('sp'); if (s) s.remove();
      draw();
    });
  }
  // ファイルのプレビュー（#offv）を開いている間は待ち、閉じたら fn を行う
  let AFTER = null;
  function whenFree(fn) { if (document.getElementById('offv')) AFTER = fn; else fn(); }
  function hide() { el.classList.remove('on'); bar.classList.remove('on'); const v = document.getElementById('offv'); if (v) v.remove(); }
  // メニュー：アプリと同じ並び。控えで見られるもの（ホーム・カレンダー・案件・ファイル）だけ押せる。ほかは暗くして、押すと「ネットがないと使えません」
  const NI = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>', time: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h4M13 17h4"/>',
    todo: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>', case: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
    inbox: '<path d="M4 13l2-8h12l2 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>', form: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    quote: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>', fix: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    file: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', ppl: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.9.2 5 2.6 5 5.8"/>',
    crm: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/>', line: '<path d="M12 4C7 4 3 7.2 3 11.2c0 3.6 3.2 6.6 7.6 7.1l-.4 2.4c-.1.5.4.8.8.5l3.6-2.6c3.9-.9 6.4-3.8 6.4-7.4C21 7.2 17 4 12 4z"/>',
    ig: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/>', set: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
  };
  const OK_TABS = ['home', 'time', 'case', 'file'];
  function navHtml() {
    const boss = P && P.who === '天田';
    const items = [['home', 'ホーム'], ['time', 'カレンダー'], ['todo', 'やること'], ['case', '案件'], ['inbox', '受信'], ['form', 'フォーム']].concat(boss ? [['quote', '見積'], ['fix', '修正指示']] : [], [['file', 'ファイル'], ['ppl', '人'], ['crm', 'CRM'], ['line', '公式LINE'], ['ig', 'インスタ'], ['set', '設定']]);
    return '<nav class="nv">' + items.map(([k, l]) => { const ok = OK_TABS.indexOf(k) >= 0; return '<a data-t="' + k + '" class="' + (V.tab === k ? 'on' : '') + (ok ? '' : ' na') + (k === 'set' ? ' set' : '') + '"' + (ok ? '' : ' title="ネットがないと使えません"') + '><svg viewBox="0 0 24 24">' + NI[k] + '</svg><span>' + l + (k === 'file' && FILES.length ? ' ' + FILES.length : '') + '</span></a>'; }).join('') + '</nav>';
  }
  function offToast(t) { let x = document.getElementById('offtoast'); if (!x) { x = document.createElement('div'); x.id = 'offtoast'; document.body.appendChild(x); } x.textContent = t; x.style.opacity = '1'; clearTimeout(offToast.t); offToast.t = setTimeout(() => { x.style.opacity = '0'; }, 1800); }
  function homeHtml() {
    const cs = (P.cases || []).slice().sort((a, b) => (a.date || '9') < (b.date || '9') ? -1 : 1), t0 = ymd(0), t1 = ymd(1), t7 = ymd(7);
    const day = (lb, c) => '<div class="day" data-c="' + esc(c.id) + '"><em>' + lb + '</em><b>' + esc(c.title || c.subject || c.name) + '</b></div>';
    // 何日も続く本番（11/15〜11/22 など）は、その間ずっと今日・明日・今週に出す（2026-11-21）
    const last = c => c.dateTo && c.dateTo > c.date ? c.dateTo : c.date, on = (c, d) => c.date && c.date <= d && last(c) >= d;
    const td = cs.filter(c => on(c, t0)), tm = cs.filter(c => on(c, t1) && !on(c, t0)), wk = cs.filter(c => c.date && c.date <= t7 && last(c) > t1 && !on(c, t0) && !on(c, t1));
    return '<div class="vt">' + esc(wd(t0)) + '</div><div class="hnt">オフライン保存した分だけを出しています</div>' + td.map(c => day('今日', c)).join('') + tm.map(c => day('明日', c)).join('') +
      (!td.length && !tm.length ? '<div class="note">今日・明日の現場は、オフライン保存にありません</div>' : '') +
      '<h4>今週の現場</h4>' + (wk.map(c => '<div class="it" data-c="' + esc(c.id) + '"><div class="s">' + esc(wd(c.date)) + '</div><div class="t">' + esc(c.title || c.subject || c.name) + '</div><div class="s">' + esc([c.name, c.venue, c.status].filter(Boolean).join('・')) + '</div></div>').join('') || '<div class="note">ありません</div>');
  }
  function draw() {
    const old = P && Date.now() - P.at > 24 * 3600000;
    if (OK_TABS.indexOf(V.tab) < 0) V.tab = 'home';
    const head = '<div class="oh"><img class="lg" src="../apple-touch-icon.png" alt=""><b>SoundWich <span class="ver">Ver3</span></b>' + (READY ? '<span class="lk" id="offBack">アプリに戻る</span>' : '<span class="lk" id="offRe">つなぎ直す</span>') +
      '<div class="at' + (old ? ' old' : '') + '"><span class="pill">' + (P ? (old ? '古いオフライン保存・' : 'オフライン保存・') + hm(P.at) + ' 時点' : 'まだオフライン保存がありません') + '</span><span>' + (V.why === '圏外' ? 'ネットにつながっていません。見るだけで、書く・送るはできません' : V.why === '起動' ? '最新を読み込んでいます（準備ができたら切り替わります）' : 'アプリが開かないので、オフライン保存した分を出しています') + '</span></div></div>';
    let body = '';
    const snap = V.tab === 'case' && V.id && SNAPS[V.id] && CSS ? SNAPS[V.id] : null;
    if (snap) body = '<div class="snapbar"><span class="lk" data-back="1">‹ 戻る</span><span>アプリと同じ画面の写し・' + esc(hm(snap.at)) + ' 時点。見るだけです</span></div><iframe class="snapf" id="offSnap" title="案件の画面"></iframe>';
    else if (!P) body ='<div class="note">ネットがあるときにアプリを開くと、今日〜2週間先の案件の要点を、この端末に自動で取っておきます（30分ごと）。ファイルは、プレビューの「オフライン保存」で保存したものだけ入ります。</div>';
    else if (V.tab === 'case' && V.id) body = caseHtml((P.cases || []).find(c => c.id === V.id) || {});
    else if (V.tab === 'case') body = '<div class="vt">案件</div><div class="hnt">今日〜2週間先の案件と、オフライン保存した案件</div>' + listHtml();
    else if (V.tab === 'time') body = '<div class="vt">カレンダー</div><div class="hnt">2週間分（スケジュール帳と案件）</div>' + calHtml();
    else if (V.tab === 'home') body = homeHtml();
    else body = '<div class="vt">ファイル</div>' + filesHtml(FILES);
    el.innerHTML = navHtml() + '<div class="mn">' + head + '<div class="ob' + (snap ? ' snap' : '') + '" id="offB">' + body + '</div></div>';
    if (snap) mountSnap(snap);
    el.querySelector('.nv').onclick = e => { const t = e.target.closest('[data-t]'); if (!t) return; if (t.classList.contains('na')) { offToast('ネットがないと使えません'); return; } V.tab = t.dataset.t; V.id = ''; draw(); };
    const bk = document.getElementById('offBack'); if (bk) bk.onclick = hide;
    const re = document.getElementById('offRe'); if (re) re.onclick = () => location.reload();
    document.getElementById('offB').onclick = e => {
      const c = e.target.closest('[data-c]'); if (c) { V.from = V.tab; V.tab = 'case'; V.id = c.dataset.c; draw(); document.getElementById('offB').scrollTop = 0; return; }
      const f = e.target.closest('[data-f]'); if (f) openFile(f.dataset.f);
      if (e.target.closest('[data-back]')) { V.id = ''; if (V.from && V.from !== 'case') V.tab = V.from; V.from = ''; draw(); }
    };
  }
  // アプリの案件の画面を、アプリの見た目（CSS）ごと枠の中に出す。中の仕掛け（ボタンの動き）は外してあるので見るだけ。
  // ファイルの札は、この端末に保存したものだけ開ける（保存していないものは薄く出し、押すと知らせる）
  const SNAP_FIX = 'html,body{height:100%;margin:0;overflow:hidden}.app{display:block!important;height:100%!important;width:100%!important;grid-template-columns:none!important}.app>.side,.app>.gut,.tolatest,.toasts{display:none!important}' +
    '.main{display:flex!important;flex-direction:column;height:100%!important;width:100%!important;max-width:none!important}.rp,.newbar,.ed,.cmtb,.use,.vtools,.edl,.back,#f-status:empty{display:none!important}.gut{pointer-events:none}' +
    'a.file.offno{opacity:.42}a.file.offok .pvw:after{content:"保存済み";position:absolute;left:4px;top:4px;background:#34c759;color:#fff;font-size:10px;font-weight:700;border-radius:5px;padding:1px 5px}a.file .pvw{position:relative}';
  function mountSnap(s) {
    const f = document.getElementById('offSnap'); if (!f) return;
    const saved = {}; FILES.forEach(x => { saved[x.id] = 1; });
    f.srcdoc = '<!doctype html><html' + (CSS.html ? ' ' + CSS.html : '') + '><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + CSS.css.replace(/<\/style/gi, '') + '</style><style>' + SNAP_FIX + '</style></head><body' + (CSS.body ? ' class="' + esc(CSS.body) + '"' : '') + '><div class="app detail" id="app"><main class="main" id="main">' + s.html + '</main></div></body></html>';
    f.onload = () => {
      let doc; try { doc = f.contentDocument; } catch (e) { return; } if (!doc) return;
      doc.querySelectorAll('a.file[data-fpv]').forEach(a => a.classList.add(saved[a.dataset.fpv] ? 'offok' : 'offno'));
      doc.addEventListener('click', e => {
        const a = e.target.closest('a'); if (!a) return; e.preventDefault(); e.stopPropagation();
        const id = a.dataset.fpv;
        if (id) { if (saved[id]) openFile(id); else offToast('このファイルはオフライン保存していません'); return; }
        const h = a.getAttribute('href') || '';
        if (/^tel:|^mailto:/.test(h)) { location.href = h; return; }
        if (/^https?:/.test(h)) { if (navigator.onLine) window.open(h, '_blank', 'noopener'); else offToast('ネットがないと開けません'); }
      }, true);
    };
  }
  function listHtml() {
    const cs = (P.cases || []).slice().sort((a, b) => (a.date || '9') < (b.date || '9') ? -1 : 1), t0 = ymd(0), t1 = ymd(1);
    let h = '', last = null;
    cs.forEach(c => {
      const g = !c.date ? '日にち未定' : c.date < t0 ? '前の日' : c.date === t0 ? '今日 ' + wd(c.date) : c.date === t1 ? '明日 ' + wd(c.date) : wd(c.date);
      if (g !== last) { h += '<h4>' + esc(g) + '</h4>'; last = g; }
      h += '<div class="it" data-c="' + esc(c.id) + '"><div class="t">' + esc(c.title || c.subject || c.name) + '</div><div class="s">' + esc([c.name, c.company !== c.name ? c.company : '', c.venue, c.status].filter(Boolean).join('・')) + '</div></div>';
    });
    return h || '<div class="note">オフライン保存した案件がありません</div>';
  }
  function caseHtml(c) {
    const sh = c.sheet || {}, row = (k, v, tel) => v ? '<span>' + k + '</span><div>' + (tel ? telA(v) : esc(v)) + '</div>' : '';
    const cues = String(sh.tt || '').split(/\n+/).map(x => x.trim()).filter(Boolean).map(x => { const m = x.match(/^(\d{1,2}[:：]\d{2})\s*[〜~-]?\s*(.*)$/); return '<div class="cue"><b>' + esc(m ? m[1] : '') + '</b><span>' + esc(m ? m[2] : x) + '</span></div>'; }).join('');
    const mine = FILES.filter(f => f.caseId === c.id), mineIds = {}; mine.forEach(f => { mineIds[f.id] = 1; });
    const fid = u => (String(u || '').match(/[-\w]{25,}/) || [''])[0];
    return '<p><span class="lk" data-back="1">‹ 戻る</span></p><h4>' + esc(c.date ? wd(c.date) : '日にち未定') + '・' + esc(c.id) + '</h4>' +
      '<div style="font-size:19px;font-weight:700;margin:4px 0 10px">' + esc(c.title || c.subject || c.name) + '</div>' +
      '<div class="kv">' + row('お客さま', [c.name, c.company !== c.name ? c.company : ''].filter(Boolean).join('・')) + row('電話', (c.tels || []).join('\n'), true) + row('メール', c.mail) +
      row('会場', [c.venue, sh.addr || c.venueAddr].filter(Boolean).join('\n')) + row('状態', c.status) + '</div>' +
      ((sh.meet || sh.load || sh.contact || sh.park) ? '<h4>現場シート</h4><div class="kv">' + row('集合', sh.meet) + row('搬入', sh.load) + row('会場の連絡先', sh.contact, true) + row('駐車場', sh.park) + '</div>' : '') +
      (cues ? '<h4>タイムテーブル</h4>' + cues : '') +
      ((c.crew || []).length ? '<h4>人の手配</h4><div class="kv">' + c.crew.map(x => '<span>' + esc(x.role) + '</span><div>' + esc(x.who || '未定') + (x.st ? '（' + esc(x.st) + '）' : '') + '</div>').join('') + '</div>' : '') +
      (sh.gear ? '<h4>機材</h4><div class="msg">' + esc(sh.gear) + '</div>' : '') + (sh.note ? '<h4>そのほか</h4><div class="msg">' + esc(sh.note) + '</div>' : '') +
      (c.memo ? '<h4>社内メモ</h4><div class="msg">' + esc(c.memo) + '</div>' : '') + (c.summary ? '<h4>要約</h4><div class="msg">' + esc(c.summary) + '</div>' : '') +
      '<h4>ファイル（オフライン保存したものだけ開けます）</h4>' + (mine.map(f => '<div class="fl"><span>' + esc(f.name) + '</span><span class="lk" data-f="' + esc(f.id) + '" style="flex:none">開く</span></div>').join('') +
        (c.files || []).filter(f => !mineIds[fid(f.url)]).map(f => '<div class="fl no"><span>' + esc(f.name) + '</span><small>保存していません</small></div>').join('') || '<div class="note">ファイルはありません</div>') +
      ((c.msgs || []).length ? '<h4>最後のやりとり（' + c.msgs.length + '通）</h4>' + c.msgs.slice().reverse().map(m => '<div class="msg ' + (m.dir === 'R' ? 'R' : '') + '"><small>' + esc(String(m.at || '').replace('T', ' ').slice(5, 16)) + '　' + esc(m.via) + (m.who ? '　' + esc(m.who) : '') + '</small>' + esc(m.text) + '</div>').join('') : '');
  }
  function calHtml() {
    const by = {}; (P.sched || []).forEach(o => { (by[o.d] = by[o.d] || []).push(o); });
    (P.cases || []).forEach(c => { if (!c.date) return; const e = c.dateTo && c.dateTo > c.date ? c.dateTo : c.date; for (let d = c.date, i = 0; d <= e && i < 15; i++) { (by[d] = by[d] || []).push({ d, res: '案件', t: c.title || c.name, c: c.id }); const x = new Date(d + 'T00:00:00+09:00'); x.setDate(x.getDate() + 1); d = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); } }); // 何日も続く本番は毎日に
    const days = Object.keys(by).sort(); if (!days.length) return '<div class="note">2週間分の予定がありません</div>';
    return days.map(d => '<h4>' + esc(wd(d)) + (d === ymd(0) ? '・今日' : '') + '</h4>' + by[d].sort((a, b) => (a.res === '案件' ? -1 : 0) - (b.res === '案件' ? -1 : 0) || String(a.res).localeCompare(String(b.res)) || (a.h0 || 0) - (b.h0 || 0))
      .map(o => '<div class="it"' + (o.c ? ' data-c="' + esc(o.c) + '"' : ' style="cursor:default"') + '><div class="s">' + esc(o.res) + (o.all ? '・終日' : o.h0 != null ? '・' + hh(o.h0) + (o.h1 != null ? '〜' + hh(o.h1) : '') : '') + '</div><div class="t" style="font-weight:500">' + esc(o.t) + '</div></div>').join('')).join('');
  }
  function filesHtml(fs) {
    if (!fs.length) return '<div class="note">オフライン保存したファイルはありません。ネットがあるときに、ファイルのプレビューの上の「オフライン保存」を押すと入ります。</div>';
    const nm = id => ((P && P.cases || []).find(c => c.id === id) || {}).title || id;
    return fs.sort((a, b) => b.at - a.at).map(f => '<div class="fl"><span>' + esc(f.name) + '<br><small style="color:#8e8e93">' + esc(nm(f.caseId)) + '</small></span><span class="lk" data-f="' + esc(f.id) + '" style="flex:none">開く</span></div>').join('');
  }
  function openFile(id) {
    const f = FILES.find(x => x.id === id); if (!f) return;
    const u = URL.createObjectURL(f.blob), v = document.createElement('div'); v.id = 'offv';
    const img = /^image\//.test(f.mime || f.blob.type);
    v.innerHTML = '<div class="vh"><span class="lk" id="offvx" style="color:#0a84ff">閉じる</span><b>' + esc(f.name) + '</b><a class="lk" style="color:#0a84ff" href="' + u + '" download="' + esc(f.name) + '">保存</a></div>' + (img ? '<img src="' + u + '" alt="">' : '<iframe src="' + u + '"></iframe>');
    document.body.appendChild(v); document.getElementById('offvx').onclick = () => { v.remove(); URL.revokeObjectURL(u); const a = AFTER; AFTER = null; if (a) a(); };
  }

  // ===== いつ出すか =====
  function start() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
    if (!navigator.onLine) { show('圏外'); return; }
    // 開いた直後に控えを先に見せるのはやめた（2026-11-20 天田さん「この控えの時間なしでいいや、やっぱり起動画面に戻して」）。ふだんは今までの起動画面のまま。
    // 電波が弱くて12秒たってもアプリが開かないときだけ、控えがあれば出す。アプリが開いたら自動で消える
    setTimeout(() => { if (READY || el.classList.contains('on')) return; kvGet('pack').then(p => { if (p && !READY) show('遅い'); }).catch(() => { }); }, 12000);
  }
  window.addEventListener('offline', () => { if (!el.classList.contains('on')) bar.classList.add('on'); });
  // 圏外で出したあと電波が戻ったら、押さなくてもつなぎ直す（2026-11-28 天田さん「押さなくても繋げたらなってほしい」）。ファイルを見ている途中だけ、閉じてから
  window.addEventListener('online', () => { bar.classList.remove('on'); if (!el.classList.contains('on')) return; if (READY) whenFree(hide); else if (V.why === '圏外') whenFree(() => location.reload()); });
  window.SWOFF = { onMsg, start, show }; // show：確かめる用（ネットがあっても控えを出す）
})();
