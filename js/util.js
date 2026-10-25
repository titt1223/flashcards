'use strict';
/* Utilitaires partagés : DOM, texte, dates, mise en forme des cartes */
const APP_VERSION = '2.1.0';
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

/* ---------- petits morceaux de HTML (composants d'interface) ---------- */
const opt = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`;
// bouton de barre de navigation (texte ou icône)
const nb = (inner, label, attrs = '', cls = '') => `<button type="button" class="nb ${cls}" ${label ? `title="${esc(label)}" aria-label="${esc(label)}"` : ''} ${attrs}>${inner}</button>`;
const nbi = (name, label, attrs = '', cls = '') => nb(icon(name, 24), label, attrs, 'ic ' + cls);
const back = (label, action) => nb(icon('chev-l', 26) + `<span>${esc(label)}</span>`, 'Retour', `data-a="${action}"`);
// barre de navigation : titre centré qui apparaît quand le grand titre sort de l'écran (solid = toujours visible)
const navbar = ({ left = '', title = '', right = '', solid = false }) => `<header class="nav ${solid ? 'solid' : ''}"><div class="nav-in"><div class="nav-l">${left}</div><div class="nav-t">${esc(title)}</div><div class="nav-r">${right}</div></div></header>`;
const tile = (name, color = 'g') => `<span class="ico ${color}">${icon(name, 18)}</span>`;
// ligne d'une feuille d'actions (icône + libellé + valeur facultative)
const srow = (ic, label, sub, attrs, cls = '') => `<button type="button" class="row srow ${cls}" ${attrs}>${ic ? icon(ic, 22) : ''}<span class="sl">${label}</span>${sub !== '' && sub != null ? `<small>${sub}</small>` : ''}</button>`;
// ligne de réglage (étiquette cliquable) et ligne d'action
const setrow = (tl, label, sub, control) => `<label class="row ic">${tl}<span class="rt"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span>${control}</label>`;
const setact = (tl, label, sub, control) => `<div class="row ic static">${tl}<span class="rt"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span>${control}</div>`;
const switchCtl = (key, on) => `<input type="checkbox" class="sw" role="switch" data-s="${key}" ${on ? 'checked' : ''}>`;
// ligne cliquable avec pastille d'icône et chevron (listes, réglages)
const navrow = (tl, label, sub, attrs, extra = '', cls = '') => `<button type="button" class="row ic ${cls}" ${attrs}>${tl}<span class="rt"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="trail">${extra}${icon('chev-r', 18)}</span></button>`;
const searchBox = (id, ph, value) => `<div class="search">${icon('search', 18)}<input type="search" id="${id}" aria-label="${esc(ph)}" placeholder="${esc(ph)}" value="${esc(value)}" autocomplete="off"></div>`;
