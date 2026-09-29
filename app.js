'use strict';
const $app = document.getElementById('app');
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MATH_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/;
// **gras**  __souligné__  ==surligné== ; les segments LaTeX sont laissés intacts
function fmt(s) {
  return String(s ?? '').split(MATH_RE).map((p, i) => i % 2 ? esc(p)
    : esc(p)
        .replace(/\[\[(#[0-9a-fA-F]{3,8}):([\s\S]+?)\]\]/g, (_, col, txt) => `<u style="text-decoration-color:${col};text-decoration-thickness:2px;text-underline-offset:2px">${txt}</u>`)
        .replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>').replace(/__([\s\S]+?)__/g, '<u>$1</u>').replace(/==([\s\S]+?)==/g, '<mark>$1</mark>')).join('');
}
const opt = (v, l, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`;

/* ---------- stockage ---------- */
let db = { decks: {}, cards: {}, folders: {} };
let cfg = { signedIn: false, clientId: '', last: '' };
try { db = { ...db, ...JSON.parse(localStorage.getItem('fc_data')) }; } catch (e) {}
db.decks = db.decks || {}; db.cards = db.cards || {}; db.folders = db.folders || {};
try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem('fc_cfg')) }; } catch (e) {}
let syncTimer = null;
function save(sync = true) {
  try { localStorage.setItem('fc_data', JSON.stringify(db)); } catch (e) { alert('Stockage plein !'); }
  if (sync && cfg.signedIn) { clearTimeout(syncTimer); syncTimer = setTimeout(() => doSync(true), 3000); }
}
function saveCfg() { try { localStorage.setItem('fc_cfg', JSON.stringify(cfg)); } catch (e) {} }
const now = () => Date.now();
const decks = () => Object.values(db.decks).filter(d => !d.deleted).sort((a, b) => a.name.localeCompare(b.name));
const folders = () => Object.values(db.folders).filter(f => !f.deleted).sort((a, b) => a.name.localeCompare(b.name));
const cardsOf = id => Object.values(db.cards).filter(c => !c.deleted && c.deckId === id);
function stats(id) {
  const s = { total: 0, known: 0, unknown: 0, new: 0, flag: 0 };
  for (const c of cardsOf(id)) { s.total++; s[c.status]++; if (c.flag) s.flag++; }
  return s;
}
function sumStats(list) {
  const s = { total: 0, known: 0, unknown: 0, new: 0, flag: 0 };
  list.forEach(d => { const x = stats(d.id); s.total += x.total; s.known += x.known; s.unknown += x.unknown; s.new += x.new; s.flag += x.flag; });
  return s;
}
function addCard(deckId, q, a, status = 'new') {
  const id = uid();
  db.cards[id] = { id, deckId, q, a, status, updatedAt: now() };
}
function touch(o) { o.updatedAt = now(); }

/* ---------- état UI ---------- */
const state = { view: 'home', deckId: null, studyFolderId: null, filter: 'all', study: null, shuffle: true, editId: null, editFrom: null, addCount: 0, msg: '', lastField: 'eq', closedFolders: new Set(),
  imp: { tab: 'csv', deckId: '', newName: '', text: '', delim: 'auto', header: false, cardSep: 'nl', fieldSep: 'tab', customCard: '', customField: '', which: 'first', addCount: 0 } };
const go = (view, extra = {}) => { Object.assign(state, { view }, extra); render(); window.scrollTo(0, 0); };

/* ---------- LaTeX ---------- */
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
const LATEX_SNIPPETS = [
  ['pow', 'x²', '^{}'], ['sqrt', '√', '\\sqrt{}'], ['frac', 'a/b', '\\frac{}{}'],
  ['sum', '∑', '\\sum_{i=1}^{n}'], ['int', '∫', '\\int_{}^{}'], ['greek', 'αβπ', '\\alpha \\beta \\pi'],
  ['ineq', '≤≥', '\\leq \\geq'], ['mat', '▦', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}'], ['dollar', '$…$', null],
];
const FORMATS = [['bold', '<b>G</b>', '**', 'Gras (Ctrl+B)'], ['under', '<u>S</u>', '__', 'Souligné (Ctrl+U)'], ['hl', '<mark>Surligner</mark>', '==', 'Surligner']];
const FIELD_IDS = ['eq', 'ea', 'mq', 'ma', 'ptext'];
function insertSnippet(kind) {
  const fid = FIELD_IDS.includes(state.lastField) ? state.lastField : 'eq';
  const el = document.getElementById(fid);
  if (!el) return;
  el.focus();
  const s = el.selectionStart, e = el.selectionEnd, val = el.value;
  let sel = val.slice(s, e);
  let insert, pos;
  const fm = FORMATS.find(x => x[0] === kind);
  const isColor = kind === 'ucolor';
  if (fm || isColor) {
    // sur mobile la sélection de texte est peu fiable : si rien n'est sélectionné, on demande le texte
    if (!sel) { sel = window.prompt('Texte à formater ?'); if (!sel) return; }
    if (isColor) { const col = (document.getElementById('ucolor') || {}).value || '#3f7fd1'; insert = `[[${col}:${sel}]]`; }
    else insert = fm[2] + sel + fm[2];
    pos = s + insert.length;
  }
  else if (kind === 'dollar') { insert = sel ? `$${sel}$` : '$$'; pos = sel ? s + insert.length : s + 1; }
  else {
    insert = LATEX_SNIPPETS.find(x => x[0] === kind)[2];
    const b = insert.indexOf('{}');
    pos = s + (b >= 0 ? b + 1 : insert.length);
  }
  el.value = val.slice(0, s) + insert + val.slice(e);
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const latexToolbar = () => `<div class="bar ltb">${FORMATS.map(x => `<button type="button" title="${x[3]}" data-a="latex" data-id="${x[0]}">${x[1]}</button>`).join('')}
  <span style="display:inline-flex;align-items:center;gap:4px">
    <input type="color" id="ucolor" value="#3f7fd1" title="Couleur du soulignement" style="width:38px;height:38px;padding:2px;border-radius:10px;border:1.5px solid var(--bd);background:var(--card);cursor:pointer">
    <button type="button" title="Souligner avec cette couleur" data-a="latex" data-id="ucolor">🖌️S</button>
  </span>
  ${LATEX_SNIPPETS.map(x => `<button type="button" data-a="latex" data-id="${x[0]}">${x[1]}</button>`).join('')}</div>`;

/* ---------- vues ---------- */
function bar(s) {
  const t = s.total || 1;
  return `<div class="prog"><i class="g" style="width:${s.known / t * 100}%"></i><i class="r" style="width:${s.unknown / t * 100}%"></i></div>`;
}
const chips = s => `<div class="chips"><span class="chip">${s.total} cartes</span><span class="chip g">✓ ${s.known}</span><span class="chip r">✗ ${s.unknown}</span><span class="chip">○ ${s.new}</span>${s.flag ? `<span class="chip f">🚩 ${s.flag}</span>` : ''}</div>`;
function deckBox(d) {
  const s = stats(d.id);
  return `<div class="box deck" data-a="open" data-id="${d.id}"><b>${esc(d.name)}</b>
    ${chips(s)}${bar(s)}</div>`;
}
function folderBox(f) {
  const ds = decks().filter(d => d.folderId === f.id);
  const s = sumStats(ds);
  const closed = state.closedFolders.has(f.id);
  return `<div class="box folder">
    <div class="cl" data-a="togglefolder" data-id="${f.id}" style="cursor:pointer">
      <div style="flex:1"><b>📁 ${esc(f.name)}</b> <span class="mut">· ${ds.length} paquet(s)</span>${chips(s)}</div>
      <span class="fold-ico">${closed ? '▸' : '▾'}</span>
    </div>
    <div class="bar" style="margin:6px 0 0">
      <button class="pri" data-a="foldstudy" data-id="${f.id}" data-mode="new" ${s.new ? '' : 'disabled'}>▶ Continuer le tri (${s.new})</button>
      <button class="ko" data-a="foldstudy" data-id="${f.id}" data-mode="unknown" ${s.unknown ? '' : 'disabled'}>🔁 Revoir « je ne connais pas » (${s.unknown})</button>
      <button data-a="foldstudy" data-id="${f.id}" data-mode="all" ${s.total ? '' : 'disabled'}>Tout réviser le classeur</button>
      <button data-a="foldstudy" data-id="${f.id}" data-mode="flag" ${s.flag ? '' : 'disabled'}>🚩 Revoir les marquées (${s.flag})</button></div>
    <div class="bar" style="margin:6px 0 0"><button data-a="renamefolder" data-id="${f.id}">✏️ Renommer</button><button class="danger" data-a="delfolder" data-id="${f.id}">🗑️ Supprimer</button></div>
    ${closed ? '' : `<div style="margin-top:10px;display:grid;gap:10px">${ds.map(deckBox).join('') || '<p class="mut">Classeur vide. Ouvre un paquet et choisis ce classeur.</p>'}</div>`}
  </div>`;
}
const views = {
  home() {
    const all = decks();
    const noFolder = all.filter(d => !d.folderId || !db.folders[d.folderId] || db.folders[d.folderId].deleted);
    const fs = folders();
    const list = fs.map(folderBox).join('') + noFolder.map(deckBox).join('');
    return `<div class="hero"><div class="logo"><img src="icon-192.png" alt=""></div><div><h1>Flashcards</h1><div class="mut">${all.length} paquet(s)${cfg.signedIn ? ' · 🔄 synchro auto' : ''}</div></div></div>${!cfg.signedIn && clientId() ? '<div class="banner"><span>☁️ Retrouve tes paquets sur tous tes appareils.</span><button class="pri" data-a="connect">Continuer avec Google</button></div>' : ''}${state.needLogin ? '<div class="banner">Session Google expirée. <button class="pri" data-a="relogin">Se reconnecter</button></div>' : ''}
      <div class="bar"><button class="pri" data-a="newdeck">+ Nouveau paquet</button><button data-a="newfolder">📁 Nouveau classeur</button><button data-a="import">⬇️ Importer</button><span class="sp"></span><button data-a="settings">☁️ Sync / Sauvegarde</button></div>
      ${list || '<div class="empty"><div class="big">🌱</div><p class="mut">Aucun paquet pour l\'instant.<br>Crée-en un ou importe des cartes.</p></div>'}`;
  },
  deck() {
    const d = db.decks[state.deckId]; if (!d) return go('home'), '';
    const s = stats(d.id);
    let cs = cardsOf(d.id);
    if (state.filter !== 'all') cs = cs.filter(c => state.filter === 'flag' ? c.flag : c.status === state.filter);
    const tab = (f, l) => `<button class="${state.filter === f ? 'pri' : ''}" data-a="filter" data-id="${f}">${l}</button>`;
    const folderSel = `<select data-f="deckFolder">${opt('', '📁 Sans classeur', d.folderId || '')}${folders().map(f => opt(f.id, esc(f.name), d.folderId || '')).join('')}</select>`;
    return `<div class="bar"><button data-a="home">← Retour</button><span class="sp"></span><button data-a="rename">✏️ Renommer</button><button class="danger" data-a="deldeck">🗑️</button></div>
      <h1>${esc(d.name)}</h1>
      <div class="box">${chips(s)}${bar(s)}
        <div class="bar" style="margin-top:12px">
          <button class="pri" data-a="study" data-id="new" ${s.new ? '' : 'disabled'}>▶ Continuer le tri (${s.new})</button>
          <button class="ko" data-a="study" data-id="unknown" ${s.unknown ? '' : 'disabled'}>🔁 Revoir « je ne connais pas » (${s.unknown})</button>
          <button data-a="study" data-id="all" ${s.total ? '' : 'disabled'}>Tout réviser</button>
          <button data-a="study" data-id="flag" ${s.flag ? '' : 'disabled'}>🚩 Revoir les marquées (${s.flag})</button></div>
        <label style="font-weight:400;display:flex;gap:8px;align-items:center;margin:0"><input type="checkbox" data-a="shuffle" ${state.shuffle ? 'checked' : ''}> Mélanger</label>
        <label style="font-weight:400;display:flex;gap:8px;align-items:center;margin:6px 0 0"><input type="checkbox" data-a="autoflag" ${cfg.autoFlag !== false ? 'checked' : ''}> 🚩 Marquer automatiquement mes erreurs</label>
        <div class="row" style="margin:10px 0 0;align-items:center"><div class="bar" style="margin:0"><button data-a="reset">↺ Réinitialiser le tri</button><button data-a="import" data-id="${d.id}">⬇️ Importer dans ce paquet</button></div>${folderSel}</div></div>
      <div class="bar"><button class="pri" data-a="addcard">+ Ajouter une carte</button><span class="sp"></span></div>
      <div class="bar tabs">${tab('all', 'Toutes')}${tab('new', '⚪ Non triées')}${tab('unknown', '❌ À revoir')}${tab('known', '✅ Connues')}${tab('flag', '🚩 Marquées')}</div>
      ${cs.map(c => `<div class="box"><div class="cl"><span class="dot ${c.status}"></span><div class="math"><b>${fmt(c.q)}</b><br>${fmt(c.a)}</div>
        <button data-a="flagcard" data-id="${c.id}" title="Marquer / démarquer">${c.flag ? '🚩' : '⚐'}</button><button data-a="editcard" data-id="${c.id}">✏️</button></div></div>`).join('') || '<p class="mut">Rien ici.</p>'}`;
  },
  edit() {
    const c = state.editId ? db.cards[state.editId] : null;
    const fresh = !c && state.editFrom !== 'study';
    return `<h1>${c ? 'Modifier' : 'Nouvelle'} carte</h1>
      ${fresh && state.addCount ? `<p class="mut">✅ ${state.addCount} carte(s) ajoutée(s) cette session.</p>` : ''}
      ${latexToolbar()}
      <label>Question</label><textarea id="eq" placeholder="Texte + LaTeX, ex : dérivée de $x^2$ ?">${esc(c ? c.q : '')}</textarea>
      <label>Réponse</label><textarea id="ea" placeholder="ex : $2x$">${esc(c ? c.a : '')}</textarea>
      <label>Aperçu</label><div class="box math" id="epv"></div>
      <div class="bar">${fresh
        ? `<button class="pri" data-a="savecard">Enregistrer et ajouter une autre</button><button data-a="canceledit">Terminer</button>`
        : `<button class="pri" data-a="savecard">Enregistrer</button><button data-a="canceledit">Annuler</button><span class="sp"></span>${c ? '<button class="danger" data-a="delcard">Supprimer</button>' : ''}`}</div>`;
  },
  study() {
    const st = state.study;
    const scopeName = st.folderId ? `📁 ${esc((db.folders[st.folderId] || {}).name || '')}` : esc((db.decks[st.deckId] || {}).name || '');
    if (st.i >= st.queue.length) {
      const k = Object.values(st.res).filter(x => x === 'known').length, u = Object.values(st.res).filter(x => x === 'unknown').length;
      const s = st.folderId ? sumStats(decks().filter(d => d.folderId === st.folderId)) : stats(st.deckId);
      return `<h1>Session terminée 🎉</h1><div class="box">✅ Connues : <b>${k}</b><br>❌ À revoir : <b>${u}</b><br><span class="mut">Le tri est sauvegardé.</span></div>
        <div class="bar"><button class="ko" data-a="study" data-id="unknown" ${s.unknown ? '' : 'disabled'}>🔁 Revoir les « je ne connais pas » (${s.unknown})</button>
        <button data-a="study" data-id="new" ${s.new ? '' : 'disabled'}>Continuer le tri (${s.new})</button>
        <button data-a="study" data-id="flag" ${s.flag ? '' : 'disabled'}>🚩 Revoir les marquées (${s.flag})</button><button data-a="studyback">Retour</button></div>`;
    }
    const c = db.cards[st.queue[st.i]];
    return `<div class="bar"><button data-a="studyback">✕ Quitter</button><span class="sp"></span><span class="mut">${scopeName} · ${st.i + 1}/${st.queue.length}</span></div>
      <div class="prog" style="margin:0 0 12px"><i class="g" style="width:${st.i / st.queue.length * 100}%"></i></div>
      <div class="box fc math" data-a="flip"><span class="lab">${st.flip ? 'Réponse' : 'Question'}${c.flag ? ' 🚩' : ''}</span><div class="fc-in">${fmt(st.flip ? c.a : c.q)}</div></div>
      ${st.flip ? `<div class="ans"><button class="ko" data-a="ans" data-id="unknown">❌ Je ne connais pas</button><button class="ok" data-a="ans" data-id="known">✅ Je connais</button></div>`
        : `<div class="ans"><button class="pri" data-a="flip">Retourner (espace)</button></div>`}
      <div class="bar" style="margin-top:12px"><button data-a="back" ${st.i ? '' : 'disabled'}>↩ Précédente</button><button data-a="flagstudy">${c.flag ? '🚩 Marquée' : '⚐ Marquer'}</button><button data-a="editstudy">✏️ Modifier cette carte</button><span class="sp"></span><span class="mut">← à revoir · → connue · F marquer</span></div>`;
  },
  import() {
    const i = state.imp;
    const target = `<label>Paquet de destination</label><select data-f="deckId">${opt('', '➕ Nouveau paquet…', i.deckId)}${decks().map(d => opt(d.id, esc(d.name), i.deckId)).join('')}</select>
      ${i.deckId ? '' : `<label>Nom du nouveau paquet</label><input type="text" data-f="newName" value="${esc(i.newName)}">`}`;
    const csv = `<label>Fichier CSV (colonne 1 = question, colonne 2 = réponse)</label><input type="file" id="csvfile" accept=".csv,.txt,.tsv">
      <div class="row"><div><label>Séparateur de colonnes</label><select data-f="delim">${opt('auto', 'Automatique', i.delim)}${opt(';', 'Point-virgule ;', i.delim)}${opt(',', 'Virgule ,', i.delim)}${opt('\t', 'Tabulation', i.delim)}</select></div>
      <div><label>&nbsp;</label><label style="font-weight:400"><input type="checkbox" data-f="header" ${i.header ? 'checked' : ''}> 1ʳᵉ ligne = en-têtes</label></div></div>`;
    const paste = `<label>Colle ton texte</label>${latexToolbar()}<textarea id="ptext" data-f="text" style="min-height:160px">${esc(i.text)}</textarea>
      <div class="row"><div><label>Entre deux cartes</label><select data-f="cardSep">${opt('nl', 'Nouvelle ligne', i.cardSep)}${opt('blank', 'Ligne vide', i.cardSep)}${opt('custom', 'Personnalisé…', i.cardSep)}</select>
      ${i.cardSep === 'custom' ? `<input type="text" data-f="customCard" value="${esc(i.customCard)}" placeholder="ex: ;;  (\\n = retour ligne)">` : ''}</div>
      <div><label>Entre question et réponse</label><select data-f="fieldSep">${opt('tab', 'Tabulation', i.fieldSep)}${opt(';', 'Point-virgule ;', i.fieldSep)}${opt(',', 'Virgule ,', i.fieldSep)}${opt(' - ', 'Tiret « - »', i.fieldSep)}${opt(' : ', 'Deux-points « : »', i.fieldSep)}${opt('|', 'Barre |', i.fieldSep)}${opt('=', 'Égal =', i.fieldSep)}${opt('custom', 'Personnalisé…', i.fieldSep)}</select>
      ${i.fieldSep === 'custom' ? `<input type="text" data-f="customField" value="${esc(i.customField)}" placeholder="ex: ->  ou  ???">` : ''}</div></div>
      <label>Si le séparateur apparaît plusieurs fois</label><select data-f="which">${opt('first', 'Couper au premier', i.which)}${opt('last', 'Couper au dernier', i.which)}</select>`;
    const manual = `${i.addCount ? `<p class="mut">✅ ${i.addCount} carte(s) ajoutée(s) dans cette session.</p>` : ''}
      ${latexToolbar()}
      <label>Question</label><textarea id="mq" placeholder="Texte + LaTeX, ex : dérivée de $x^2$ ?"></textarea>
      <label>Réponse</label><textarea id="ma" placeholder="ex : $2x$"></textarea>
      <label>Aperçu</label><div class="box math" id="mpv"></div>
      <button class="pri" data-a="addmanual">+ Ajouter cette carte</button>`;
    return `<div class="bar"><button data-a="${state.deckId ? 'opendeck' : 'home'}">← Retour</button></div><h1>Importer des cartes</h1>
      <div class="bar tabs"><button class="${i.tab === 'csv' ? 'on' : ''}" data-a="imptab" data-id="csv">📄 Fichier CSV</button><button class="${i.tab === 'paste' ? 'on' : ''}" data-a="imptab" data-id="paste">📋 Copier-coller</button><button class="${i.tab === 'manual' ? 'on' : ''}" data-a="imptab" data-id="manual">✍️ Carte par carte</button></div>
      <div class="box">${target}${i.tab === 'csv' ? csv : i.tab === 'paste' ? paste : manual}</div>
      ${i.tab !== 'manual' ? `<div class="box"><b id="impcount"></b><div class="pv math" id="imppv"></div></div>
      <button class="pri" data-a="doimport">Importer</button>` : ''}`;
  },
  settings() {
    const need = !clientId();
    return `<div class="bar"><button data-a="home">← Retour</button></div><h1>☁️ Synchronisation</h1>
      <div class="box"><p>Connecte-toi avec ton compte Google : tes paquets sont stockés dans ton propre Google Drive (dossier caché de l'app) et se synchronisent automatiquement sur tous tes appareils connectés au même compte — après chaque modification, à l'ouverture, quand tu reviens sur l'app et toutes les 90 secondes tant qu'elle est ouverte.</p>
      ${cfg.signedIn ? `<div class="bar"><button class="pri" data-a="sync">🔄 Synchroniser maintenant</button><button data-a="unlink">Se déconnecter</button></div>`
        : `<div class="bar"><button class="pri" data-a="connect">Se connecter avec Google</button></div>`}
      <div class="mut" id="syncmsg">${esc(state.msg || (cfg.last ? 'Dernière synchro : ' + new Date(cfg.last).toLocaleString() : ''))}</div></div>
      <details class="box" ${need ? 'open' : ''}><summary><b>Configuration Google (une seule fois)</b></summary>
        <ol class="mut"><li>Va sur console.cloud.google.com → crée un projet.</li>
        <li>« API et services » → « Bibliothèque » → active <b>Google Drive API</b>.</li>
        <li>« Écran de consentement OAuth » → Externe → ajoute ton adresse Gmail comme utilisateur test.</li>
        <li>« Identifiants » → Créer → ID client OAuth → <b>Application Web</b>. Dans « Origines JavaScript autorisées » ajoute <code>${esc(location.origin)}</code>.</li>
        <li>Colle l'ID client ci-dessous (ou dans <code>GOOGLE_CLIENT_ID</code> en haut de <code>app.js</code>).</li></ol>
        <label>ID client Google</label><input type="text" id="cid" value="${esc(clientId())}" placeholder="123-abc.apps.googleusercontent.com"></details>
      <div class="box"><b>Sauvegarde manuelle</b><div class="bar" style="margin-top:8px"><button data-a="export">⬆️ Exporter (JSON)</button><label class="btn" style="margin:0;font-weight:400">⬇️ Importer un JSON<input type="file" id="jsonfile" accept=".json" hidden></label></div></div>`;
  },
};
function render() {
  $app.innerHTML = views[state.view]();
  if (state.view === 'import') { if (state.imp.tab === 'manual') updateManualPv(); else updatePreview(); }
  if (state.view === 'edit') { updateEditPv(); const el = document.getElementById(state.lastField === 'ea' ? 'ea' : 'eq'); if (el && !state.editId) el.focus(); }
  typeset();
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
  const r = getRows();
  document.getElementById('impcount').textContent = `${r.length} carte(s) détectée(s)`;
  document.getElementById('imppv').innerHTML = r.slice(0, 5).map(x => `Q : ${fmt(x[0])}\nR : ${fmt(x[1])}`).join('\n──────\n'); typeset();
}
function updateEditPv() {
  const q = document.getElementById('eq'), a = document.getElementById('ea'), p = document.getElementById('epv');
  if (!q) return; p.innerHTML = fmt(q.value) + '\n\n' + fmt(a.value); p.style.whiteSpace = 'pre-wrap'; typeset();
}
function updateManualPv() {
  const q = document.getElementById('mq'), a = document.getElementById('ma'), p = document.getElementById('mpv');
  if (!q) return; p.innerHTML = fmt(q.value) + '\n\n' + fmt(a.value); p.style.whiteSpace = 'pre-wrap'; typeset();
}
async function readFile(f) {
  const buf = await f.arrayBuffer();
  let t = new TextDecoder('utf-8').decode(buf);
  if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
  return t;
}

/* ---------- étude ---------- */
function studyCardsBase() {
  if (state.studyFolderId) {
    const ids = decks().filter(d => d.folderId === state.studyFolderId).map(d => d.id);
    return Object.values(db.cards).filter(c => !c.deleted && ids.includes(c.deckId));
  }
  return cardsOf(state.deckId);
}
function startStudy(mode) {
  let cs = studyCardsBase().filter(c => mode === 'all' || (mode === 'flag' ? c.flag : c.status === mode));
  if (state.shuffle) for (let i = cs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cs[i], cs[j]] = [cs[j], cs[i]]; }
  if (!cs.length) return;
  state.study = { deckId: state.deckId, folderId: state.studyFolderId, queue: cs.map(c => c.id), i: 0, flip: false, res: {}, mode };
  go('study');
}
function answer(k) {
  const st = state.study, c = db.cards[st.queue[st.i]];
  c.status = k; touch(c); st.res[c.id] = k;
  if (k === 'unknown' && cfg.autoFlag !== false) c.flag = true;
  else if (k === 'known' && st.mode === 'flag') c.flag = false;
  save();
  st.i++; st.flip = false; render();
}

/* ---------- synchro (Google Drive) ---------- */
function merge(a, b) {
  const out = { decks: {}, cards: {}, folders: {} };
  for (const k of ['decks', 'cards', 'folders']) {
    out[k] = { ...(a[k] || {}) };
    for (const id in (b[k] || {})) { const x = out[k][id], y = b[k][id]; if (!x || y.updatedAt > x.updatedAt) out[k][id] = y; }
  }
  return out;
}
const GOOGLE_CLIENT_ID = '357404140201-h93hvb0gqv6us3fvetc3tfj7p3fj7vce.apps.googleusercontent.com';
const clientId = () => cfg.clientId || GOOGLE_CLIENT_ID;
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
let tok = null, tokExp = 0, gis = null, syncing = false, syncInterval = null;
function loadGis() {
  return gis || (gis = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client';
    s.onload = res; s.onerror = () => { gis = null; rej(new Error('Google injoignable (hors ligne ?)')); }; document.head.appendChild(s);
  }));
}
async function getToken(prompt) {
  if (tok && now() < tokExp - 60000) return tok;
  if (!clientId()) throw new Error('Client ID Google manquant');
  await loadGis();
  return new Promise((res, rej) => {
    google.accounts.oauth2.initTokenClient({ client_id: clientId(), scope: SCOPE,
      callback: r => { if (r.error) return rej(new Error(r.error)); tok = r.access_token; tokExp = now() + r.expires_in * 1000; res(tok); },
      error_callback: e => rej(new Error(e.type || 'Connexion annulée')) }).requestAccessToken({ prompt });
  });
}
const setMsg = m => { state.msg = m; const e = document.getElementById('syncmsg'); if (e) e.textContent = m; };
async function drive(path, opt = {}, upload = false) {
  const r = await fetch('https://www.googleapis.com/' + (upload ? 'upload/' : '') + 'drive/v3/' + path, { ...opt, headers: { Authorization: 'Bearer ' + tok, ...(opt.headers || {}) } });
  if (r.status === 401) { tok = null; throw new Error('Session expirée'); }
  if (!r.ok) throw new Error('Erreur Drive ' + r.status);
  return r;
}
// prompt: 'none' = silencieux (auto), '' = normal, 'select_account' = choix du compte
async function doSync(auto, prompt = 'none') {
  if (!cfg.signedIn || syncing) return;
  syncing = true;
  try {
    setMsg('Synchronisation…');
    await getToken(auto ? 'none' : prompt);
    const list = await (await drive("files?spaces=appDataFolder&q=name%3D'flashcards.json'&fields=files(id)")).json();
    const id = list.files[0] && list.files[0].id;
    let remote = { decks: {}, cards: {}, folders: {} };
    if (id) { try { remote = await (await drive('files/' + id + '?alt=media')).json(); } catch (e) {} }
    db = merge(db, remote); save(false);
    const body = JSON.stringify(db);
    if (body !== JSON.stringify(merge(remote, remote))) {
      if (id) await drive('files/' + id + '?uploadType=media', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }, true);
      else {
        const b = '----fc', meta = JSON.stringify({ name: 'flashcards.json', parents: ['appDataFolder'] });
        await drive('files?uploadType=multipart', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b },
          body: `--${b}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--` }, true);
      }
    }
    cfg.last = now(); state.needLogin = false; saveCfg();
    setMsg('✅ Synchronisé à ' + new Date().toLocaleTimeString());
    if (state.view === 'home' || state.view === 'deck') render();
  } catch (e) {
    if (auto) state.needLogin = true;
    setMsg('⚠️ ' + e.message + (auto ? ' — clique sur « Se reconnecter »' : ''));
    if (auto && state.view === 'home') render();
  }
  syncing = false;
}
function startAutoSyncLoop() {
  clearInterval(syncInterval);
  syncInterval = setInterval(() => { if (cfg.signedIn && !document.hidden && state.view !== 'study') doSync(true); }, 90000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && cfg.signedIn && state.view !== 'study') doSync(true); });
window.addEventListener('online', () => { if (cfg.signedIn) doSync(true); });

/* ---------- événements ---------- */
const A = {
  home: () => go('home'), settings: () => go('settings'),
  newdeck() { const n = prompt('Nom du paquet ?'); if (!n) return; const id = uid(); db.decks[id] = { id, name: n.trim(), folderId: null, updatedAt: now() }; save(); go('deck', { deckId: id, filter: 'all' }); },
  open: id => { state.studyFolderId = null; go('deck', { deckId: id, filter: 'all' }); },
  opendeck: () => go('deck'),
  studyback() { const st = state.study; go(st && st.folderId ? 'home' : 'deck'); },
  rename() { const d = db.decks[state.deckId]; const n = prompt('Nouveau nom ?', d.name); if (n) { d.name = n.trim(); touch(d); save(); render(); } },
  deldeck() {
    if (!confirm('Supprimer ce paquet et toutes ses cartes ?')) return;
    const d = db.decks[state.deckId]; d.deleted = true; touch(d);
    cardsOf(d.id).forEach(c => { c.deleted = true; touch(c); }); save(); go('home');
  },
  newfolder() { const n = prompt('Nom du classeur ?'); if (!n) return; const id = uid(); db.folders[id] = { id, name: n.trim(), updatedAt: now() }; save(); render(); },
  renamefolder(id) { const f = db.folders[id]; const n = prompt('Nouveau nom ?', f.name); if (n) { f.name = n.trim(); touch(f); save(); render(); } },
  delfolder(id) {
    if (!confirm('Supprimer ce classeur ? Les paquets qu\'il contient ne seront pas supprimés, juste sortis du classeur.')) return;
    const f = db.folders[id]; f.deleted = true; touch(f);
    decks().filter(d => d.folderId === id).forEach(d => { d.folderId = null; touch(d); });
    save(); render();
  },
  togglefolder(id) { if (state.closedFolders.has(id)) state.closedFolders.delete(id); else state.closedFolders.add(id); render(); },
  filter: id => go('deck', { filter: id }),
  shuffle(id, el) { state.shuffle = el.checked; },
  study: id => { state.studyFolderId = null; startStudy(id); },
  foldstudy(folderId, t) { state.studyFolderId = folderId; state.deckId = null; startStudy(t.dataset.mode); },
  reset() { if (!confirm('Remettre toutes les cartes en « non triées » ?')) return; cardsOf(state.deckId).forEach(c => { c.status = 'new'; touch(c); }); save(); render(); },
  flagcard(id) { const c = db.cards[id]; c.flag = !c.flag; touch(c); save(); render(); },
  flagstudy() { const st = state.study, c = db.cards[st.queue[st.i]]; c.flag = !c.flag; touch(c); save(); render(); },
  addcard: () => go('edit', { editId: null, editFrom: null, addCount: 0 }),
  editcard: id => go('edit', { editId: id, editFrom: null }),
  editstudy() { const st = state.study; go('edit', { editId: st.queue[st.i], editFrom: 'study' }); },
  canceledit: () => go(state.editFrom === 'study' ? 'study' : 'deck'),
  latex: id => insertSnippet(id),
  savecard() {
    const q = document.getElementById('eq').value.trim(), a = document.getElementById('ea').value.trim();
    if (!q || !a) return alert('Question et réponse requises.');
    if (state.editId) {
      const c = db.cards[state.editId]; c.q = q; c.a = a; touch(c); save();
      go(state.editFrom === 'study' ? 'study' : 'deck');
    } else {
      addCard(state.deckId, q, a); save();
      state.addCount++; render();
    }
  },
  delcard() { if (!confirm('Supprimer cette carte ?')) return; const c = db.cards[state.editId]; c.deleted = true; touch(c); save();
    if (state.editFrom === 'study') { const st = state.study; st.queue.splice(st.i, 1); st.flip = false; go('study'); } else go('deck'); },
  flip() { state.study.flip = !state.study.flip; render(); },
  ans: id => answer(id),
  back() { const st = state.study; if (st.i > 0) { st.i--; st.flip = false; render(); } },
  import(id) { state.imp.deckId = id || state.deckId || ''; state.imp.text = ''; state.imp.addCount = 0; go('import'); },
  imptab(id) { state.imp.tab = id; state.imp.text = ''; if (id === 'manual') state.lastField = 'mq'; if (id === 'paste') state.lastField = 'ptext'; render(); },
  addmanual() {
    const i = state.imp;
    const q = document.getElementById('mq').value.trim(), a = document.getElementById('ma').value.trim();
    if (!q || !a) return alert('Question et réponse requises.');
    let deckId = i.deckId;
    if (!deckId) {
      const n = i.newName.trim(); if (!n) return alert('Donne un nom au nouveau paquet.');
      deckId = uid(); db.decks[deckId] = { id: deckId, name: n, folderId: null, updatedAt: now() };
      i.deckId = deckId;
    }
    addCard(deckId, q, a); save();
    i.addCount = (i.addCount || 0) + 1;
    render();
  },
  doimport() {
    const i = state.imp, rows = getRows();
    if (!rows.length) return alert('Aucune carte à importer.');
    let deckId = i.deckId;
    if (!deckId) {
      const n = i.newName.trim(); if (!n) return alert('Donne un nom au nouveau paquet.');
      deckId = uid(); db.decks[deckId] = { id: deckId, name: n, folderId: null, updatedAt: now() };
    }
    rows.forEach(r => addCard(deckId, r[0], r[1]));
    save(); alert(rows.length + ' cartes importées.');
    go('deck', { deckId, filter: 'all' });
  },
  async connect() {
    const c = document.getElementById('cid'); if (c) { cfg.clientId = c.value.trim(); saveCfg(); }
    try { await getToken('select_account'); cfg.signedIn = true; saveCfg(); startAutoSyncLoop(); await doSync(false); } catch (e) { setMsg('⚠️ ' + e.message); }
  },
  async relogin() { try { await getToken(''); state.needLogin = false; await doSync(false); render(); } catch (e) { setMsg('⚠️ ' + e.message); } },
  sync: () => doSync(false, ''),
  unlink() { cfg.signedIn = false; cfg.last = ''; tok = null; clearInterval(syncInterval); saveCfg(); state.msg = 'Déconnecté.'; render(); },
  export() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db)], { type: 'application/json' }));
    a.download = 'flashcards-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  },
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-a]'); if (!t || t.tagName === 'INPUT') return;
  const f = A[t.dataset.a]; if (f) f(t.dataset.id, t);
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.a === 'shuffle') return A.shuffle(null, t);
  if (t.dataset.a === 'autoflag') { cfg.autoFlag = t.checked; saveCfg(); return; }
  if (t.dataset.f === 'deckFolder') { const d = db.decks[state.deckId]; d.folderId = t.value || null; touch(d); save(); render(); return; }
  if (t.id === 'csvfile' && t.files[0]) { state.imp.text = await readFile(t.files[0]); updatePreview(); return; }
  if (t.id === 'jsonfile' && t.files[0]) {
    try { db = merge(db, JSON.parse(await readFile(t.files[0]))); save(); alert('Sauvegarde fusionnée.'); go('home'); } catch (err) { alert('Fichier invalide.'); }
    return;
  }
  if (t.dataset.f) {
    const f = t.dataset.f; state.imp[f] = t.type === 'checkbox' ? t.checked : t.value;
    if (t.tagName === 'SELECT' && ['deckId', 'cardSep', 'fieldSep'].includes(f)) render(); else updatePreview();
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.f) { state.imp[t.dataset.f] = t.value; updatePreview(); }
  if (t.id === 'eq' || t.id === 'ea') updateEditPv();
  if (t.id === 'mq' || t.id === 'ma') updateManualPv();
});
document.addEventListener('focus', e => { if (FIELD_IDS.includes(e.target.id)) state.lastField = e.target.id; }, true);
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && FIELD_IDS.includes(e.target.id) && (e.key === 'b' || e.key === 'u')) { e.preventDefault(); state.lastField = e.target.id; insertSnippet(e.key === 'b' ? 'bold' : 'under'); return; }
  if (state.view !== 'study' || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  const st = state.study; if (st.i >= st.queue.length) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); A.flip(); }
  else if (e.key === 'ArrowRight' && st.flip) answer('known');
  else if (e.key === 'ArrowLeft' && st.flip) answer('unknown');
  else if (e.key === 'f' || e.key === 'F') A.flagstudy();
});

// reconnexion automatique : dès le 1er clic/toucher, si la session Google a expiré
document.addEventListener('pointerdown', async () => {
  if (!state.needLogin || !cfg.signedIn) return;
  state.needLogin = false;
  try { await getToken(''); await doSync(false); } catch (e) { state.needLogin = true; }
}, { capture: true });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
if (cfg.signedIn) { doSync(true); startAutoSyncLoop(); }
