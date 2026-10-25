'use strict';
/* Utilitaires partagés : DOM, texte, dates, mise en forme des cartes */
const APP_VERSION = '2.0.0';
const $ = id => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const now = () => Date.now();
const plural = (n, one, many) => (n > 1 ? many : one);   // français : 0 et 1 au singulier
const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ---------- mise en forme des cartes ---------- */
const MATH_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/;
// **gras**  __souligné__  ==surligné==  [[#couleur:surligné en couleur]] ; les segments LaTeX sont laissés intacts
function fmt(s) {
  return String(s ?? '').split(MATH_RE).map((p, i) => i % 2 ? esc(p)
    : esc(p)
        .replace(/\[\[(#[0-9a-fA-F]{3,8}):([\s\S]+?)\]\]/g, (_, col, txt) => `<mark style="background:color-mix(in srgb, ${col} 55%, transparent)">${txt}</mark>`)
        .replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>').replace(/__([\s\S]+?)__/g, '<u>$1</u>').replace(/==([\s\S]+?)==/g, '<mark>$1</mark>')).join('');
}
// texte brut sans marques, sans accents ni majuscules : sert à la recherche
const norm = s => String(s ?? '').replace(/\*\*|__|==|\[\[#[0-9a-fA-F]{3,8}:|\]\]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function matches(c, q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(c.q) + ' ' + norm(c.a);
  return words.every(w => hay.includes(w));
}

/* ---------- dates (jours locaux) ---------- */
const pad2 = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dayNum = k => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };

/* ---------- petits morceaux de HTML ---------- */
const opt = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`;
const ib = (icon, label, attrs = '', cls = '') => `<button type="button" class="ib ${cls}" title="${esc(label)}" aria-label="${esc(label)}" ${attrs}>${icon}</button>`;
const srow = (label, sub, attrs, cls = '') => `<button type="button" class="srow ${cls}" ${attrs}><span>${label}</span>${sub !== '' && sub != null ? `<small>${sub}</small>` : ''}</button>`;
const setrow = (label, sub, control) => `<label class="setrow"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span>${control}</label>`;
const switchCtl = (key, on) => `<input type="checkbox" class="sw" role="switch" data-s="${key}" ${on ? 'checked' : ''}>`;
const setact = (label, sub, ctl) => `<div class="setrow" style="cursor:default"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span>${ctl}</div>`;
