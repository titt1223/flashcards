'use strict';
/* Édition des cartes : rendu LaTeX, mise en forme (gras, souligné, surlignage), import CSV / texte, paquet d'exemple */

function typeset() {
  if (!window.renderMathInElement) return;
  document.querySelectorAll('.math').forEach(el => {
    try {
      renderMathInElement(el, { throwOnError: false, delimiters: [
        { left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false }, { left: '$', right: '$', display: false }] });
    } catch (e) {}
  });
}
window.addEventListener('load', () => { typeset(); setTimeout(typeset, 500); });

/* ---------- barre d'outils ---------- */
const LATEX_SNIPPETS = [
  ['pow', 'x²', '^{}', 'Puissance'], ['sqrt', '√', '\\sqrt{}', 'Racine carrée'], ['frac', 'a⁄b', '\\frac{}{}', 'Fraction'],
  ['sum', '∑', '\\sum_{i=1}^{n}', 'Somme'], ['int', '∫', '\\int_{}^{}', 'Intégrale'], ['greek', 'αβπ', '\\alpha \\beta \\pi', 'Lettres grecques'],
  ['ineq', '≤≥', '\\leq \\geq', 'Inégalités'], ['mat', '▦', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', 'Matrice'], ['dollar', '$ $', null, 'Formule en ligne'],
];
const FIELD_IDS = ['eq', 'ea', 'mq', 'ma', 'ptext', 'qq', 'qa'];
const HL_COLORS = ['#ffd60a', '#30d158', '#ff6b9d', '#64a8ff', '#ff9f0a', '#bf5af2'];
const hlColor = () => cfg.hl || HL_COLORS[0];
// une seule rangée défilante, comme l'accessoire du clavier iOS : G · S · surligner · couleur | formules
const toolbar = () => `<div class="tb"><div class="tools" role="toolbar" aria-label="Mise en forme">
  <button type="button" class="tl" data-a="latex" data-id="bold" title="Gras (Ctrl+B)" aria-label="Gras"><b>G</b></button>
  <button type="button" class="tl" data-a="latex" data-id="under" title="Souligné (Ctrl+U)" aria-label="Souligné"><u>S</u></button>
  <button type="button" class="tl" data-a="latex" data-id="hl" title="Surligner le mot ou la sélection" aria-label="Surligner">${icon('highlighter', 20)}<span class="hlbar" style="background:${hlColor()}"></span></button>
  <button type="button" class="tl hlc" data-a="hlpal" title="Couleur du surlignage" aria-label="Couleur du surlignage"><i style="background:${hlColor()}"></i></button>
  <span class="tsep"></span>
  ${LATEX_SNIPPETS.map(x => `<button type="button" class="tl" data-a="latex" data-id="${x[0]}" title="${x[3]}" aria-label="${x[3]}">${x[1]}</button>`).join('')}
  </div><div class="hlpal" hidden>${HL_COLORS.map(c => `<button type="button" data-a="hlset" data-id="${c}" style="background:${c}" aria-label="Couleur ${c}" class="${c === hlColor() ? 'on' : ''}"></button>`).join('')}</div></div>`;
// garde la couleur courante partout où la barre est affichée
function syncToolbars() {
  document.querySelectorAll('.hlbar').forEach(x => { x.style.background = hlColor(); });
  document.querySelectorAll('.hlc i').forEach(x => { x.style.background = hlColor(); });
  document.querySelectorAll('.hlpal button').forEach(b => b.classList.toggle('on', b.dataset.id === hlColor()));
}
// ne pas enlever le focus du champ de texte quand on touche un bouton de la barre
document.addEventListener('mousedown', e => { if (e.target.closest('.tools, .hlpal, #hlpill')) e.preventDefault(); });

/* ---------- mise en forme : un geste suffit ---------- */
const WORDCH = /[\p{L}\p{N}_'’-]/u;
function wordAt(v, i) {   // étend la position i au mot qui l'entoure
  let s = i, e = i;
  while (s > 0 && WORDCH.test(v[s - 1])) s--;
  while (e < v.length && WORDCH.test(v[e])) e++;
  return [s, e];
}
// couches de mise en forme qui entourent déjà [s,e] (de l'intérieur vers l'extérieur) : gras, souligné, surlignage — imbriqués ou non
function layers(v, s, e) {
  const out = []; let b = s, a = e, m;
  for (;;) {
    const before = v.slice(0, b), after = v.slice(a);
    if (before.endsWith('**') && after.startsWith('**')) { out.push({ k: 'bold', os: b - 2, ol: 2, ce: a + 2, cl: 2 }); b -= 2; a += 2; }
    else if (before.endsWith('__') && after.startsWith('__')) { out.push({ k: 'under', os: b - 2, ol: 2, ce: a + 2, cl: 2 }); b -= 2; a += 2; }
    else if (before.endsWith('==') && after.startsWith('==')) { out.push({ k: 'hl', color: null, os: b - 2, ol: 2, ce: a + 2, cl: 2 }); b -= 2; a += 2; }
    else if ((m = before.match(/\[\[(#[0-9a-fA-F]{3,8}):$/)) && after.startsWith(']]')) { out.push({ k: 'hl', color: m[1], os: b - m[0].length, ol: m[0].length, ce: a + 2, cl: 2 }); b -= m[0].length; a += 2; }
    else break;
  }
  return out;
}
// applique (ou retire : « bascule ») une mise en forme. Renvoie [nouveau texte, début, fin] de la sélection
function formatText(v, s, e, kind) {
  const color = hlColor(), sel = v.slice(s, e), open = kind === 'hl' ? `[[${color}:` : kind === 'bold' ? '**' : '__', close = kind === 'hl' ? ']]' : open;
  let m;
  // 1) la sélection contient elle-même l'enveloppe (ex. « **mot** » sélectionné en entier)
  if (kind === 'hl' && (m = sel.match(/^\[\[#[0-9a-fA-F]{3,8}:([\s\S]*)\]\]$/))) return [v.slice(0, s) + m[1] + v.slice(e), s, s + m[1].length];
  if (kind !== 'hl' && sel.length > 2 * open.length && sel.startsWith(open) && sel.endsWith(close)) return [v.slice(0, s) + sel.slice(open.length, -close.length) + v.slice(e), s, e - 2 * open.length];
  // 2) déjà entourée (même sous d'autres mises en forme) : on retire, ou on change la couleur du surlignage
  const L = layers(v, s, e).find(l => l.k === kind);
  if (L) {
    if (kind === 'hl' && L.color && L.color.toLowerCase() !== color.toLowerCase())
      return [v.slice(0, L.os) + open + v.slice(L.os + L.ol), s - L.ol + open.length, e - L.ol + open.length];
    const noClose = v.slice(0, L.ce - L.cl) + v.slice(L.ce);
    return [noClose.slice(0, L.os) + noClose.slice(L.os + L.ol), s - L.ol, e - L.ol];
  }
  // 3) sinon on entoure
  return [v.slice(0, s) + open + sel + close + v.slice(e), s + open.length, e + open.length];
}
const hasTarget = el => el.selectionStart !== el.selectionEnd || wordAt(el.value, el.selectionStart)[1] > wordAt(el.value, el.selectionStart)[0];
// champ de texte visé par la barre d'outils : celui qui a le focus, sinon le dernier utilisé, sinon le premier présent à l'écran
function activeField() {
  const a = document.activeElement;
  if (a && FIELD_IDS.includes(a.id)) return a;
  const last = FIELD_IDS.includes(state.lastField) ? $(state.lastField) : null;
  if (last) return last;
  const inCompose = $compose.classList.contains('open');
  return (inCompose ? ['qq', 'qa'] : FIELD_IDS).map($).find(Boolean) || null;
}
async function insertSnippet(kind) {
  const el = activeField();
  if (!el) return;
  el.focus();
  let s = el.selectionStart, e = el.selectionEnd;
  if (kind === 'bold' || kind === 'under' || kind === 'hl') {
    if (s === e) {
      const [ws, we] = wordAt(el.value, s);
      if (we > ws) { s = ws; e = we; }                                 // le mot sous le curseur
      else {                                                           // aucun mot : on demande le texte
        const t = await askText('Texte à mettre en forme', '', 'Écris le texte…');
        if (!t) { el.focus(); return; }
        el.value = el.value.slice(0, s) + t + el.value.slice(s); e = s + t.length;
      }
    }
    const [val, ns, ne] = formatText(el.value, s, e, kind);
    el.value = val; el.focus(); el.setSelectionRange(ns, ne);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const sel = el.value.slice(s, e); let insert, pos;
  if (kind === 'dollar') { insert = sel ? `$${sel}$` : '$$'; pos = sel ? s + insert.length : s + 1; }
  else {
    insert = LATEX_SNIPPETS.find(x => x[0] === kind)[2];
    const b = insert.indexOf('{}');
    pos = s + (b >= 0 ? b + 1 : insert.length);
  }
  el.value = el.value.slice(0, s) + insert + el.value.slice(e);
  el.focus(); el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ---------- surligner directement sur la carte pendant la révision ---------- */
let pill = null, pillInfo = null, selTimer = null;
function hidePill() { if (pill) { pill.remove(); pill = null; pillInfo = null; } }
function onSelChange() {
  const st = state.study, sel = getSelection(), box = document.querySelector('.fc-in');
  if (state.view !== 'study' || !st || st.mode === 'blitz' || !box || !sel || sel.isCollapsed || !sel.rangeCount) return hidePill();
  const r = sel.getRangeAt(0);
  if (!box.contains(r.commonAncestorContainer)) return hidePill();
  const text = sel.toString().trim();
  if (!text) return hidePill();
  const pre = document.createRange(); pre.selectNodeContents(box); pre.setEnd(r.startContainer, r.startOffset);
  const before = pre.toString(); let k = 0, at = 0;                  // rang de cette occurrence dans le texte affiché
  while ((at = before.indexOf(text, at)) >= 0) { k++; at += text.length; }
  const rect = r.getBoundingClientRect();
  hidePill(); pillInfo = { text, k };
  pill = document.createElement('div'); pill.id = 'hlpill'; pill.setAttribute('role', 'toolbar'); pill.setAttribute('aria-label', 'Surligner la sélection');
  pill.innerHTML = HL_COLORS.slice(0, 5).map(c => `<button type="button" data-a="studyhl" data-id="${c}" style="background:${c}" aria-label="Surligner"></button>`).join('')
    + `<button type="button" data-a="studyhl" data-id="none" aria-label="Retirer le surlignage">${icon('x', 14)}</button>`;
  document.body.appendChild(pill);
  pill.style.left = Math.min(Math.max(rect.left + rect.width / 2, 100), innerWidth - 100) + 'px';
  pill.style.top = Math.max(rect.top - 10, 64) + 'px';
}
document.addEventListener('selectionchange', () => { clearTimeout(selTimer); selTimer = setTimeout(onSelChange, 140); });
function studyHighlight(color) {
  const info = pillInfo; hidePill();
  const st = state.study; if (!info || !st) return;
  const c = db.cards[st.queue[st.i]], field = st.flip ? 'a' : 'q', src = c[field];
  let idx = -1, from = 0;
  for (let n = 0; n <= info.k; n++) { idx = src.indexOf(info.text, from); if (idx < 0) break; from = idx + info.text.length; }
  if (idx < 0) idx = src.indexOf(info.text);
  if (idx < 0) { toast('Sélection non surlignable ici (formule ou texte déjà mis en forme).'); return; }
  let out;
  if (color === 'none') {   // « retirer » : n'enlève que s'il y avait un surlignage
    const before = src.slice(0, idx), after = src.slice(idx + info.text.length), m = before.match(/\[\[#[0-9a-fA-F]{3,8}:$/);
    if (m && after.startsWith(']]')) out = before.slice(0, -m[0].length) + info.text + after.slice(2);
    else if (before.endsWith('==') && after.startsWith('==')) out = before.slice(0, -2) + info.text + after.slice(2);
    else { toast('Aucun surlignage à retirer ici.'); return; }
  } else {                  // surligner avec la couleur touchée (la même couleur une 2e fois retire le surlignage)
    const prev = cfg.hl; cfg.hl = color;
    try { out = formatText(src, idx, idx + info.text.length, 'hl')[0]; } finally { cfg.hl = prev; }
  }
  c[field] = out; touch(c); save();
  if (getSelection()) getSelection().removeAllRanges();
  buzz(8); render();
}

/* ---------- aperçus ---------- */
function updateEditPv() {
  const q = $('eq'), a = $('ea'), p = $('epv');
  if (!q) return; p.innerHTML = fmt(q.value) + '\n\n' + fmt(a.value); typeset();
}
function updateManualPv() {
  const q = $('mq'), a = $('ma'), p = $('mpv');
  if (!q) return; p.innerHTML = fmt(q.value) + '\n\n' + fmt(a.value); p.style.whiteSpace = 'pre-wrap'; typeset();
}

/* ---------- import ---------- */
function parseCSV(t, d) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"' && cur === '') q = true;
    else if (ch === d) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const unesc = s => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
function getRows() {
  const i = state.imp; let out = [];
  if (i.tab === 'csv') {
    const t = i.text.replace(/^﻿/, '');
    let d = i.delim;
    if (d === 'auto') { const l = t.split('\n')[0] || ''; const n = c => l.split(c).length; d = [';', '\t', ','].sort((a, b) => n(b) - n(a))[0]; }
    let rows = parseCSV(t, d);
    if (i.header) rows = rows.slice(1);
    out = rows.map(r => [r[0], r.slice(1).join(d === '\t' ? '\t' : d)]);
  } else {
    const t = i.text.replace(/\r\n?/g, '\n');
    const cs = i.cardSep === 'nl' ? '\n' : i.cardSep === 'blank' ? '\n\n' : unesc(i.customCard);
    const fs = i.fieldSep === 'tab' ? '\t' : i.fieldSep === 'custom' ? unesc(i.customField) : i.fieldSep;
    if (!cs || !fs) return [];
    out = t.split(cs).map(x => {
      const k = i.which === 'last' ? x.lastIndexOf(fs) : x.indexOf(fs);
      return k < 0 ? [x, ''] : [x.slice(0, k), x.slice(k + fs.length)];
    });
  }
  return out.map(r => [(r[0] || '').trim(), (r[1] || '').trim()]).filter(r => r[0] && r[1]);
}
function updatePreview() {
  const r = getRows(), c = $('impcount'), p = $('imppv'); if (!c || !p) return;
  c.textContent = `${r.length} ${plural(r.length, 'carte détectée', 'cartes détectées')}`;
  p.innerHTML = r.slice(0, 5).map(x => `Q : ${fmt(x[0])}\nR : ${fmt(x[1])}`).join('\n──────\n'); typeset();
}
async function readFile(f) {
  const buf = await f.arrayBuffer();
  let t = new TextDecoder('utf-8').decode(buf);
  if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
  return t;
}
// export d'un paquet en CSV (« ; » + guillemets + BOM : s'ouvre dans Excel et se réimporte tel quel)
function deckToCsv(deckId) {
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  return '﻿' + cardsOf(deckId).map(c => q(c.q) + ';' + q(c.a)).join('\r\n');
}

/* ---------- paquet d'exemple (première utilisation) ---------- */
function createSample() {
  const id = uid();
  db.decks[id] = { id, name: 'Découverte (exemple)', folderId: null, updatedAt: now() };
  [
    ['Bienvenue ! Touche la carte pour la **retourner**.', 'Puis dis si tu la connais : **Je connais** ou **Je ne connais pas**.'],
    ['Comment écrire des **formules** ?', 'En LaTeX : $E = mc^2$ ou $\\frac{a}{b}$. La barre au-dessus du clavier t\'aide.'],
    ['Dérivée de $x^2$ ?', '$2x$'],
    ['Intégrale de $\\int_0^1 x\\,dx$ ?', '$\\frac{1}{2}$'],
    ['Comment mettre un mot en ==surbrillance== ?', 'Place le curseur dans le mot et touche le surligneur. Pendant une révision, sélectionne simplement le texte sur la carte.'],
    ['À quoi sert le drapeau ?', 'À marquer une carte difficile. Retrouve-les avec « Cartes marquées » dans **Réviser**.'],
    ['Que fait « Revoir en boucle » ?', 'Elle te redonne les cartes « je ne connais pas » jusqu\'à ce qu\'il n\'en reste plus.'],
    ['Comment ajouter une carte pendant une révision ?', 'Touche **+** en haut de l\'écran : la carte rejoint le paquet.'],
  ].forEach(([q, a]) => addCard(id, q, a));
  save();
  return id;
}
