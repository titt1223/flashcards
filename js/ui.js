'use strict';
/* Couche interface : feuilles (menus), dialogues, notifications, effets (confettis, sons), thème */
const $app = $('app'), $sheet = $('sheet'), $dlg = $('dialog'), $toasts = $('toasts');

/* ---------- feuilles ---------- */
function showSheet(title, body, ctx) {
  $sheet.dataset.ctx = ctx || '';
  $sheet.innerHTML = `<div class="backdrop" data-a="closesheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title || 'Menu')}"><div class="grab"></div>${title ? `<h3>${esc(title)}</h3>` : ''}${body}</div>`;
  const first = $sheet.querySelector('.srow:not(.static), button, select, input');
  if (first && !matchMedia('(pointer: coarse)').matches) first.focus();
}
function closeSheet() { if ($sheet.innerHTML) { $sheet.innerHTML = ''; $sheet.dataset.ctx = ''; } }

/* ---------- notifications ---------- */
let toastSeq = 0; const toastActs = {};
// opt : kind ('err'), ms, action: ['Libellé', fn]
function toast(msg, opt = {}) {
  const id = ++toastSeq, el = document.createElement('div');
  el.className = 'toast' + (opt.kind ? ' ' + opt.kind : '');
  el.setAttribute('role', opt.kind === 'err' ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(msg)}</span>${opt.action ? `<button type="button" class="lnk" data-a="toastact" data-id="${id}">${esc(opt.action[0])}</button>` : ''}`;
  if (opt.action) toastActs[id] = opt.action[1];
  $toasts.appendChild(el);
  while ($toasts.children.length > 3) $toasts.firstChild.remove();
  const kill = () => { el.classList.add('out'); setTimeout(() => { el.remove(); delete toastActs[id]; }, 250); };
  setTimeout(kill, opt.ms || (opt.action ? 6500 : 3200));
  return el;
}
function toastAct(id, btn) {
  const f = toastActs[id]; delete toastActs[id];
  const t = btn && btn.closest('.toast'); if (t) t.remove();
  if (f) f();
}

/* ---------- dialogues (remplacent prompt / confirm / alert) ---------- */
let dlgDone = null;
// opts : title, msg, html, input, value, placeholder, ok, cancel (false = pas de bouton), danger
function dialog(opts) {
  return new Promise(res => {
    closeSheet();
    if (dlgDone) dlgDone(null);
    dlgDone = res;
    $dlg.innerHTML = `<div class="dlg-back" data-a="dlgno"></div><div class="dlg" role="dialog" aria-modal="true" ${opts.title ? 'aria-labelledby="dlgt"' : 'aria-label="Information"'}>
      ${opts.title ? `<h3 id="dlgt">${esc(opts.title)}</h3>` : ''}${opts.msg ? `<p>${esc(opts.msg)}</p>` : ''}${opts.html || ''}
      ${opts.input ? `<input id="dlgin" type="text" value="${esc(opts.value || '')}" placeholder="${esc(opts.placeholder || '')}" autocomplete="off" autocapitalize="sentences">` : ''}
      <div class="dlg-actions">${opts.cancel === false ? '' : `<button type="button" data-a="dlgno">${esc(opts.cancel || 'Annuler')}</button>`}<button type="button" class="${opts.danger ? 'ko' : 'pri'}" data-a="dlgok">${esc(opts.ok || 'OK')}</button></div></div>`;
    $dlg.classList.add('open');
    const i = $('dlgin'); if (i) { i.focus(); i.select(); } else $dlg.querySelector('[data-a=dlgok]').focus();
  });
}
function endDialog(v) { const f = dlgDone; dlgDone = null; $dlg.classList.remove('open'); $dlg.innerHTML = ''; if (f) f(v); }
const confirmDlg = o => dialog(o).then(v => v !== null);
const askText = (title, value = '', placeholder = '') => dialog({ title, input: true, value, placeholder, ok: 'Valider' }).then(v => (v === null ? null : String(v).trim()));

/* ---------- effets ---------- */
function confetti(count = 70) {
  if (reduceMotion()) return;
  const c = document.createElement('canvas'), dpr = Math.min(window.devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:95';
  c.width = W * dpr; c.height = H * dpr; document.body.appendChild(c);
  const x = c.getContext('2d'); x.scale(dpr, dpr);
  const colors = ['#4b8a63', '#7cc596', '#d9a21b', '#e8b94a', '#c4735f', '#3f7fd1', '#9d5fc0'];
  const ps = Array.from({ length: count }, () => ({ x: W / 2 + (Math.random() - .5) * 140, y: H * .45, vx: (Math.random() - .5) * 11, vy: -Math.random() * 13 - 4, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: colors[(Math.random() * colors.length) | 0], rect: Math.random() > .5 }));
  const t0 = performance.now(); let last = t0;
  (function frame(t) {
    const dt = Math.min(2, (t - last) / 16.7); last = t;
    x.clearRect(0, 0, W, H);
    ps.forEach(p => {
      p.vy += .35 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c;
      if (p.rect) x.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * .6); else { x.beginPath(); x.arc(0, 0, p.s / 2, 0, 7); x.fill(); }
      x.restore();
    });
    if (t - t0 < 2200) requestAnimationFrame(frame); else c.remove();
  })(t0);
}
let actx = null;
function beep(notes, dur = .09, type = 'sine', vol = .06) {
  if (!cfg.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    let t = actx.currentTime;
    notes.forEach(f => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.start(t); o.stop(t + dur + .02); t += dur * .9;
    });
  } catch (e) {}
}
const buzz = p => { if (cfg.sound && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } };
const sfx = {
  ok: () => { beep([660, 880]); buzz(10); },
  ko: () => { beep([200], .14, 'triangle', .07); buzz(25); },
  level: () => { beep([523, 659, 784, 1047], .13); buzz([40, 40, 80]); },
  badge: () => beep([784, 988, 1175], .1),
  done: () => beep([523, 784], .12),
};
// texte flottant « +12 XP » ancré sur la carte
function floatText(text, cls = '', dy = 0) {
  if (reduceMotion()) return;
  const card = document.querySelector('.fc'), r = card ? card.getBoundingClientRect() : { left: 0, width: innerWidth, top: innerHeight / 2 - 40 };
  const el = document.createElement('div');
  el.className = 'xpfloat ' + cls; el.textContent = text;
  el.style.left = (r.left + r.width / 2) + 'px'; el.style.top = (r.top + 56 + dy) + 'px';
  document.body.appendChild(el); setTimeout(() => el.remove(), 1200);
}

/* ---------- thème & connexion ---------- */
function applyTheme() {
  const t = cfg.theme === 'dark' || cfg.theme === 'light' ? cfg.theme : '';
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#0e1712' : '#4b8a63';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
function updateOnline() { const el = $('offline'); if (el) el.hidden = navigator.onLine; }
addEventListener('online', updateOnline); addEventListener('offline', updateOnline);
