// 見るだけの控え（2026-11-20 天田さん「見るだけの控え作って。『控えに入れる』ボタンは必須」）
// アプリ（Googleの画面）が30分ごとに渡してくる案件の要点と、「控えに入れる」で渡してくるファイルを、この端末の中（IndexedDB）に取っておく。
// ネットがないとき・アプリが開かないときは、それを「〇時〇分時点」として見せる。見るだけで、書く・送るはできない
(function () {
  const DB = 'swapp-off', esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((ok, ng) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('files', { keyPath: 'id' }); }; r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); }));
  const tx = (st, mode, fn) => db().then(d => new Promise((ok, ng) => { const t = d.transaction(st, mode), s = t.objectStore(st); const r = fn(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => ng(t.error); }));
  const kvGet = k => tx('kv', 'readonly', s => s.get(k));
  const kvPut = (k, v) => tx('kv', 'readwrite', s => s.put(v, k));
  const fAll = () => tx('files', 'readonly', s => s.getAll());
  const fPut = f => tx('files', 'readwrite', s => s.put(f));
  const fDel = id => tx('files', 'readwrite', s => s.delete(id));
  const b64Blob = (b64, mime) => { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime || 'application/octet-stream' }); };

  // ===== アプリからの知らせ =====
  let READY = false;
  function onMsg(e) {
    const d = e.data;
    if (d === 'swapp:ready') { READY = true; if (el.classList.contains('on') && V.why === '遅い') draw(); else hide(); sendInfo(e.source, e.origin); return; } // 控えを読んでいる途中なら、急に消さず「アプリに戻る」を出す
    if (!d || typeof d !== 'object') return;
    const reply = m => { try { e.source.postMessage(m, e.origin); } catch (er) { } };
    if (d.t === 'swapp:pack' && d.pack) kvPut('pack', d.pack).catch(() => { });
    if (d.t === 'swapp:file' && d.file && d.file.id) {
      const f = d.file;
      fPut({ id: f.id, caseId: f.caseId || '', name: f.name || '', mime: f.mime || '', at: f.at || Date.now(), blob: b64Blob(f.data, f.mime) })
        .then(() => reply({ t: 'swapp:filesaved', id: f.id, name: f.name })).catch(er => reply({ t: 'swapp:fileerr', id: f.id, msg: '端末に入りませんでした（空きが足りないかもしれません）' }));
    }
    if (d.t === 'swapp:filedel' && d.id) fDel(d.id).then(() => reply({ t: 'swapp:filegone', id: d.id })).catch(() => { });
  }
  function sendInfo(src, origin) { fAll().then(fs => { try { src.postMessage({ t: 'swapp:offinfo', files: fs.map(f => ({ id: f.id, name: f.name, caseId: f.caseId })) }, origin); } catch (e) { } }).catch(() => { }); }

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
#offbar.on{display:block}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'off'; document.body.appendChild(el);
  const bar = document.createElement('div'); bar.id = 'offbar'; bar.textContent = 'ネットにつながっていません・控えを見る'; bar.onclick = () => show('圏外'); document.body.appendChild(bar);
  let V = { tab: 'case', id: '', why: '' }, P = null, FILES = [];
  const wd = d => { try { const x = new Date(d + 'T00:00:00+09:00'); return (x.getMonth() + 1) + '/' + x.getDate() + '（' + '日月火水木金土'[x.getDay()] + '）'; } catch (e) { return d; } };
  const ymd = n => { const x = new Date(Date.now() + 9 * 3600000 + n * 86400000); return x.toISOString().slice(0, 10); };
  const hm = ms => { const x = new Date(ms); return (x.getMonth() + 1) + '/' + x.getDate() + ' ' + String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };
  const telA = s => esc(s).replace(/(\+?\d[\d\-‐ー−]{8,14}\d)/g, m => '<a href="tel:' + m.replace(/[^\d+]/g, '') + '">' + m + '</a>');
  const hh = h => h == null ? '' : String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60)).padStart(2, '0');
  function show(why) {
    V.why = why || V.why;
    Promise.all([kvGet('pack').catch(() => null), fAll().catch(() => [])]).then(([p, fs]) => {
      P = p; FILES = fs || []; el.classList.add('on'); bar.classList.remove('on');
      const s = document.getElementById('sp'); if (s) s.remove();
      draw();
    });
  }
  function hide() { el.classList.remove('on'); bar.classList.remove('on'); const v = document.getElementById('offv'); if (v) v.remove(); }
  function draw() {
    const old = P && Date.now() - P.at > 24 * 3600000;
    const head = '<div class="oh"><b>控え（見るだけ）</b>' + (READY ? '<span class="lk" id="offBack">アプリに戻る</span>' : '<span class="lk" id="offRe">つなぎ直す</span>') +
      '<div class="at' + (old ? ' old' : '') + '">' + (P ? (old ? '古い控えです。' : '') + hm(P.at) + ' 時点の控え・' + (V.why === '圏外' ? 'ネットにつながっていません' : 'アプリが開かないので控えを出しています') : 'まだ控えがありません') + '</div></div>' +
      '<div class="tabs"><span data-t="case" class="' + (V.tab === 'case' ? 'on' : '') + '">案件</span><span data-t="cal" class="' + (V.tab === 'cal' ? 'on' : '') + '">カレンダー</span><span data-t="file" class="' + (V.tab === 'file' ? 'on' : '') + '">ファイル ' + FILES.length + '</span></div>';
    let body = '';
    if (!P) body = '<div class="note">ネットがあるときにアプリを開くと、今日〜2週間先の案件の要点を、この端末に自動で取っておきます（30分ごと）。ファイルは、プレビューの「控えに入れる」で入れたものだけ入ります。</div>';
    else if (V.tab === 'case' && V.id) body = caseHtml((P.cases || []).find(c => c.id === V.id) || {});
    else if (V.tab === 'case') body = listHtml();
    else if (V.tab === 'cal') body = calHtml();
    else body = filesHtml(FILES);
    el.innerHTML = head + '<div class="ob" id="offB">' + body + '</div>';
    el.querySelector('.tabs').onclick = e => { const t = e.target.closest('[data-t]'); if (t) { V.tab = t.dataset.t; V.id = ''; draw(); } };
    const bk = document.getElementById('offBack'); if (bk) bk.onclick = hide;
    const re = document.getElementById('offRe'); if (re) re.onclick = () => location.reload();
    document.getElementById('offB').onclick = e => {
      const c = e.target.closest('[data-c]'); if (c) { V.tab = 'case'; V.id = c.dataset.c; draw(); document.getElementById('offB').scrollTop = 0; return; }
      const f = e.target.closest('[data-f]'); if (f) openFile(f.dataset.f);
      if (e.target.closest('[data-back]')) { V.id = ''; draw(); }
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
    return h || '<div class="note">控えに案件がありません</div>';
  }
  function caseHtml(c) {
    const sh = c.sheet || {}, row = (k, v, tel) => v ? '<span>' + k + '</span><div>' + (tel ? telA(v) : esc(v)) + '</div>' : '';
    const cues = String(sh.tt || '').split(/\n+/).map(x => x.trim()).filter(Boolean).map(x => { const m = x.match(/^(\d{1,2}[:：]\d{2})\s*[〜~-]?\s*(.*)$/); return '<div class="cue"><b>' + esc(m ? m[1] : '') + '</b><span>' + esc(m ? m[2] : x) + '</span></div>'; }).join('');
    const mine = FILES.filter(f => f.caseId === c.id), mineIds = {}; mine.forEach(f => { mineIds[f.id] = 1; });
    const fid = u => (String(u || '').match(/[-\w]{25,}/) || [''])[0];
    return '<p><span class="lk" data-back="1">‹ 案件の一覧</span></p><h4>' + esc(c.date ? wd(c.date) : '日にち未定') + '・' + esc(c.id) + '</h4>' +
      '<div style="font-size:19px;font-weight:700;margin:4px 0 10px">' + esc(c.title || c.subject || c.name) + '</div>' +
      '<div class="kv">' + row('お客さま', [c.name, c.company !== c.name ? c.company : ''].filter(Boolean).join('・')) + row('電話', (c.tels || []).join('\n'), true) + row('メール', c.mail) +
      row('会場', [c.venue, sh.addr || c.venueAddr].filter(Boolean).join('\n')) + row('状態', c.status) + '</div>' +
      ((sh.meet || sh.load || sh.contact || sh.park) ? '<h4>現場シート</h4><div class="kv">' + row('集合', sh.meet) + row('搬入', sh.load) + row('会場の連絡先', sh.contact, true) + row('駐車場', sh.park) + '</div>' : '') +
      (cues ? '<h4>タイムテーブル</h4>' + cues : '') +
      ((c.crew || []).length ? '<h4>人の手配</h4><div class="kv">' + c.crew.map(x => '<span>' + esc(x.role) + '</span><div>' + esc(x.who || '未定') + (x.st ? '（' + esc(x.st) + '）' : '') + '</div>').join('') + '</div>' : '') +
      (sh.gear ? '<h4>機材</h4><div class="msg">' + esc(sh.gear) + '</div>' : '') + (sh.note ? '<h4>そのほか</h4><div class="msg">' + esc(sh.note) + '</div>' : '') +
      (c.memo ? '<h4>社内メモ</h4><div class="msg">' + esc(c.memo) + '</div>' : '') + (c.summary ? '<h4>要約</h4><div class="msg">' + esc(c.summary) + '</div>' : '') +
      '<h4>ファイル（控えに入れたものだけ開けます）</h4>' + (mine.map(f => '<div class="fl"><span>' + esc(f.name) + '</span><span class="lk" data-f="' + esc(f.id) + '" style="flex:none">開く</span></div>').join('') +
        (c.files || []).filter(f => !mineIds[fid(f.url)]).map(f => '<div class="fl no"><span>' + esc(f.name) + '</span><small>控えにない</small></div>').join('') || '<div class="note">ファイルはありません</div>') +
      ((c.msgs || []).length ? '<h4>最後のやりとり（' + c.msgs.length + '通）</h4>' + c.msgs.slice().reverse().map(m => '<div class="msg ' + (m.dir === 'R' ? 'R' : '') + '"><small>' + esc(String(m.at || '').replace('T', ' ').slice(5, 16)) + '　' + esc(m.via) + (m.who ? '　' + esc(m.who) : '') + '</small>' + esc(m.text) + '</div>').join('') : '');
  }
  function calHtml() {
    const by = {}; (P.sched || []).forEach(o => { (by[o.d] = by[o.d] || []).push(o); });
    (P.cases || []).forEach(c => { if (c.date) (by[c.date] = by[c.date] || []).push({ d: c.date, res: '案件', t: c.title || c.name, c: c.id }); });
    const days = Object.keys(by).sort(); if (!days.length) return '<div class="note">2週間分の予定がありません</div>';
    return days.map(d => '<h4>' + esc(wd(d)) + (d === ymd(0) ? '・今日' : '') + '</h4>' + by[d].sort((a, b) => (a.res === '案件' ? -1 : 0) - (b.res === '案件' ? -1 : 0) || String(a.res).localeCompare(String(b.res)) || (a.h0 || 0) - (b.h0 || 0))
      .map(o => '<div class="it"' + (o.c ? ' data-c="' + esc(o.c) + '"' : ' style="cursor:default"') + '><div class="s">' + esc(o.res) + (o.all ? '・終日' : o.h0 != null ? '・' + hh(o.h0) + (o.h1 != null ? '〜' + hh(o.h1) : '') : '') + '</div><div class="t" style="font-weight:500">' + esc(o.t) + '</div></div>').join('')).join('');
  }
  function filesHtml(fs) {
    if (!fs.length) return '<div class="note">控えに入れたファイルはありません。ネットがあるときに、ファイルのプレビューの上の「控えに入れる」を押すと入ります。</div>';
    const nm = id => ((P && P.cases || []).find(c => c.id === id) || {}).title || id;
    return fs.sort((a, b) => b.at - a.at).map(f => '<div class="fl"><span>' + esc(f.name) + '<br><small style="color:#8e8e93">' + esc(nm(f.caseId)) + '</small></span><span class="lk" data-f="' + esc(f.id) + '" style="flex:none">開く</span></div>').join('');
  }
  function openFile(id) {
    const f = FILES.find(x => x.id === id); if (!f) return;
    const u = URL.createObjectURL(f.blob), v = document.createElement('div'); v.id = 'offv';
    const img = /^image\//.test(f.mime || f.blob.type);
    v.innerHTML = '<div class="vh"><span class="lk" id="offvx" style="color:#0a84ff">閉じる</span><b>' + esc(f.name) + '</b><a class="lk" style="color:#0a84ff" href="' + u + '" download="' + esc(f.name) + '">保存</a></div>' + (img ? '<img src="' + u + '" alt="">' : '<iframe src="' + u + '"></iframe>');
    document.body.appendChild(v); document.getElementById('offvx').onclick = () => { v.remove(); URL.revokeObjectURL(u); };
  }

  // ===== いつ出すか =====
  function start() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
    if (!navigator.onLine) { show('圏外'); return; }
    // 12秒たってもアプリが開かなければ、控えがある場合だけ出す（電波が弱いとき）。アプリが開いたら自動で消える
    setTimeout(() => { if (!READY) kvGet('pack').then(p => { if (p && !READY) show('遅い'); }).catch(() => { }); }, 12000);
  }
  window.addEventListener('offline', () => { if (!el.classList.contains('on')) bar.classList.add('on'); });
  window.addEventListener('online', () => { bar.classList.remove('on'); if (el.classList.contains('on')) { V.why = '遅い'; draw(); } }); // 読んでいる途中で勝手に開き直さない。上の「つなぎ直す」で開く
  window.SWOFF = { onMsg, start };
})();
