/* SoundWich APP Ver4 のお知らせ（2026-11-29）。v4.js の newsTry が読み込む。中身と見た目は news.html が正（ここはそれを差し込んでめくれるようにするだけ）。
   役目を終えたら news/ ごと消す。 */
(function () {
  var B = new URL('./', document.currentScript.src).href;
  window.swnGo = function (d) {
    var I = window.swnI = Math.max(0, Math.min(2, (window.swnI || 0) + d));
    document.getElementById('swnTr').style.transform = 'translateX(' + (-100 * I) + '%)';
    [].forEach.call(document.querySelectorAll('#swnD i'), function (e, i) { e.className = i === I ? 'on' : ''; });
    document.getElementById('swnP').disabled = I === 0;
    var sn = document.getElementById('swnS'), last = I === 2; sn.hidden = !last; document.getElementById('swnD').style.display = last ? 'none' : '';
    var n = document.getElementById('swnN');
    if (I === 2) { n.className = 'go'; n.textContent = 'はじめる'; n.onclick = swnClose; }
    else { n.className = 'nv'; n.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>'; n.onclick = function () { swnGo(1); }; }
  };
  window.swnClose = function () { var e = document.getElementById('swn'); if (!e) return; e.style.transition = 'opacity .25s'; e.style.opacity = 0; setTimeout(function () { e.remove(); }, 250); };
  document.addEventListener('keydown', function (e) { if (!document.getElementById('swn')) return; if (e.key === 'ArrowRight') swnGo(1); if (e.key === 'ArrowLeft') swnGo(-1); if (e.key === 'Escape') swnClose(); });
  function wire() {
    var el = document.getElementById('swn'), x0 = null;
    el.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) swnGo(dx < 0 ? 1 : -1); });
    window.swnI = 0; swnGo(0);
  }
  if (document.getElementById('swn')) { wire(); return; } /* news.html を直接開いたとき（見本） */
  fetch(B + 'news.html').then(function (r) { return r.text(); }).then(function (t) {
    var d = new DOMParser().parseFromString(t, 'text/html'), st = d.querySelector('style'), el = d.getElementById('swn');
    st.textContent = st.textContent.replace(/^body\{[^}]*\}$/m, '');
    [].forEach.call(el.querySelectorAll('.im'), function (x) { var m = /url\(["']?([^"')]+)/.exec(x.getAttribute('style') || ''); if (m) x.style.backgroundImage = 'url(' + B + m[1] + ')'; });
    document.head.appendChild(st); document.body.appendChild(el); wire();
  }).catch(function () { });
})();
