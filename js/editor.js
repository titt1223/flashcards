'use strict';
/* Édition des cartes : rendu LaTeX, barre de mise en forme, import CSV / texte, paquet d'exemple */

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

/* ---------- barre de mise en forme ---------- */
const LATEX_SNIPPETS = [
  ['pow', 'x²', '^{}'], ['sqrt', '√', '\\sqrt{}'], ['frac', 'a/b', '\\frac{}{}'],
  ['sum', '∑', '\\sum_{i=1}^{n}'], ['int', '∫', '\\int_{}^{}'], ['greek', 'αβπ', '\\alpha \\beta \\pi'],
  ['ineq', '≤≥', '\\leq \\geq'], ['mat', '▦', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}'], ['dollar', '$…$', null],
];
const FORMATS = [['bold', '**'], ['under', '__'], ['hl', '==']];
const FIELD_IDS = ['eq', 'ea', 'mq', 'ma', 'ptext'];
async function insertSnippet(kind) {
  const el = $(FIELD_IDS.includes(state.lastField) ? state.lastField : 'eq');
  if (!el) return;
  el.focus();
  const s = el.selectionStart, e = el.selectionEnd;
  let sel = el.value.slice(s, e), insert, pos;
  const fm = FORMATS.find(x => x[0] === kind), isColor = kind === 'hlcolor';
  if (fm || isColor) {
    // sur mobile la sélection de texte est peu fiable : si rien n'est sélectionné, on demande le texte
    if (!sel) { sel = await askText('Texte à mettre en forme', '', 'Écris le texte…'); if (!sel) { el.focus(); return; } }
    if (isColor) { const col = ($('hlcolor') || {}).value || '#f2d64b'; insert = `[[${col}:${sel}]]`; }
    else insert = fm[1] + sel + fm[1];
    pos = s + insert.length;
  }
  else if (kind === 'dollar') { insert = sel ? `$${sel}$` : '$$'; pos = sel ? s + insert.length : s + 1; }
  else {
    insert = LATEX_SNIPPETS.find(x => x[0] === kind)[2];
    const b = insert.indexOf('{}');
    pos = s + (b >= 0 ? b + 1 : insert.length);
  }
  const val = el.value;
  el.focus();
  el.value = val.slice(0, s) + insert + val.slice(e);
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const latexToolbar = () => `<div class="ltb">
  ${ib('<b>G</b>', 'Gras (Ctrl+B)', 'data-a="latex" data-id="bold"')}${ib('<u>S</u>', 'Souligné (Ctrl+U)', 'data-a="latex" data-id="under"')}
  <span class="hlgrp">${ib('🖍️', 'Surligner', 'data-a="latex" data-id="hlcolor"')}<input type="color" id="hlcolor" value="#f2d64b" title="Couleur du surlignage" aria-label="Couleur du surlignage"></span>
  ${ib('Σ', 'Formules LaTeX', 'data-a="latexmenu"')}</div>`;

/* ---------- aperçus ---------- */
function updateEditPv() {
  const q = $('eq'), a = $('ea'), p = $('epv');
  if (!q) return; p.innerHTML = fmt(q.value) + '\n\n' + fmt(a.value); p.style.whiteSpace = 'pre-wrap'; typeset();
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

/* ---------- paquet d'exemple (première utilisation) ---------- */
function createSample() {
  const id = uid();
  db.decks[id] = { id, name: 'Découverte (exemple)', folderId: null, updatedAt: now() };
  [
    ['Bienvenue ! Touche la carte pour la **retourner**.', 'Puis dis si tu la connais : **Je connais** ou **Je ne connais pas**.'],
    ['Comment écrire des **formules** ?', 'En LaTeX : $E = mc^2$ ou $\\frac{a}{b}$. Le bouton **Σ** de l\'éditeur t\'aide.'],
    ['Dérivée de $x^2$ ?', '$2x$'],
    ['Intégrale de $\\int_0^1 x\\,dx$ ?', '$\\frac{1}{2}$'],
    ['Comment mettre un mot en ==surbrillance== ?', 'Sélectionne-le puis touche 🖍️ (la pastille à côté choisit la couleur).'],
    ['À quoi sert le drapeau 🚩 ?', 'À marquer une carte difficile. Retrouve-les avec « Cartes marquées » dans **Réviser**.'],
    ['Que fait « Revoir en boucle » ?', 'Elle te redonne les cartes « je ne connais pas » jusqu\'à ce qu\'il n\'en reste plus.'],
    ['Comment retrouver mes paquets sur mon téléphone ?', '⚙️ Réglages → **Se connecter avec Google**, sur chaque appareil.'],
  ].forEach(([q, a]) => addCard(id, q, a));
  save();
  return id;
}
