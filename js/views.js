'use strict';
/* Vues : chaque écran est une fonction qui renvoie du HTML ; render() l'affiche. */

const go = (view, extra = {}) => {
  closeSheet();
  if (view !== 'deck') { state.selMode = false; state.sel = new Set(); }
  if (view !== 'study' && state.timer) { clearInterval(state.timer); state.timer = null; }
  if (view === 'home' && !('gsearch' in extra)) state.gsearch = '';   // revenir à l'accueil repart d'une recherche vide
  Object.assign(state, { view }, extra);
  render(); window.scrollTo(0, 0);
  $app.classList.remove('vin'); void $app.offsetWidth; $app.classList.add('vin');
};

/* ---------- éléments communs ---------- */
function bar(s) {
  const t = s.total || 1;
  return `<div class="prog"><i class="g" style="width:${s.known / t * 100}%"></i><i class="r" style="width:${s.unknown / t * 100}%"></i></div>`;
}
const chips = s => `<div class="chips"><span class="chip">${s.total} ${plural(s.total, 'carte', 'cartes')}</span><span class="chip g">✓ ${s.known}</span><span class="chip r">✗ ${s.unknown}</span><span class="chip">○ ${s.new}</span>${s.flag ? `<span class="chip f">🚩 ${s.flag}</span>` : ''}</div>`;
function deckBox(d) {
  const s = stats(d.id);
  return `<div class="box deck" role="button" tabindex="0" data-a="open" data-id="${d.id}"><b>${esc(d.name)}</b>${chips(s)}${bar(s)}</div>`;
}
function folderBox(f) {
  const ds = decks().filter(d => d.folderId === f.id), s = sumStats(ds), closed = state.closedFolders.has(f.id);
  return `<div class="box folder">
    <div class="fhead" role="button" tabindex="0" aria-expanded="${!closed}" data-a="togglefolder" data-id="${f.id}">
      <div class="grow"><b>📁 ${esc(f.name)}</b> <span class="mut">· ${ds.length} ${plural(ds.length, 'paquet', 'paquets')}</span>${chips(s)}</div>
      <span class="fold-ico">${closed ? '▸' : '▾'}</span>
    </div>
    <div class="bar" style="margin:10px 0 0"><button class="pri sm" data-a="studymenu" data-id="f:${f.id}" ${s.total ? '' : 'disabled'}>▶ Réviser</button><span class="sp"></span>${ib('⋯', 'Options du classeur', `data-a="foldermenu" data-id="${f.id}"`)}</div>
    ${closed ? '' : `<div style="margin-top:10px;display:grid;gap:10px">${ds.map(deckBox).join('') || '<p class="mut">Classeur vide. Ouvre un paquet et choisis ce classeur.</p>'}</div>`}
  </div>`;
}
function searchResults() {
  const rs = Object.values(db.cards).filter(c => !c.deleted && db.decks[c.deckId] && !db.decks[c.deckId].deleted && matches(c, state.gsearch));
  if (!rs.length) return '<p class="mut" style="text-align:center;padding:24px 0">Aucune carte trouvée.</p>';
  return `<p class="mut">${rs.length} ${plural(rs.length, 'résultat', 'résultats')}</p>` + rs.slice(0, 100).map(c =>
    `<div class="crow" role="button" tabindex="0" data-a="gopen" data-id="${c.id}"><span class="dot ${c.status}"></span><div class="math grow"><div class="mut" style="font-size:.78rem">${esc(db.decks[c.deckId].name)}</div><b>${fmt(c.q)}</b><div class="ans-line">${fmt(c.a)}</div></div></div>`).join('')
    + (rs.length > 100 ? '<p class="mut">… affine ta recherche pour voir la suite.</p>' : '');
}
function homeBody() {
  if (state.gsearch.trim()) return searchResults();
  const noFolder = decks().filter(d => !d.folderId || !db.folders[d.folderId] || db.folders[d.folderId].deleted);
  const list = folders().map(folderBox).join('') + noFolder.map(deckBox).join('');
  return list || '<div class="empty"><div class="big">🌱</div><p class="mut">Aucun paquet pour l\'instant.<br>Appuie sur + pour en créer un ou importer des cartes.</p></div>';
}
function updateCloud() {
  const c = $('cloudbtn'), r = $('relink'), bad = cfg.signedIn && state.needLogin;
  if (c) c.classList.toggle('alert', bad);
  if (r) r.hidden = !bad;
}

/* ---------- mode jeu : tableau de bord ---------- */
function ring(pct, label) {
  const C = 163.36;
  return `<div class="ring ${pct >= 1 ? 'done' : ''}"><svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle class="rbg" cx="32" cy="32" r="26"/><circle class="rfg" cx="32" cy="32" r="26" stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - Math.min(1, pct))).toFixed(2)}"/></svg><div class="num">${label}</div></div>`;
}
function gameCard() {
  const t = gameTotals(), li = levelInfo(t.xp), sk = streakInfo(), n = dayTotals(TODAY()).n, goal = cfg.goal || 20, pct = n / goal;
  const total = allCards().length, due = Math.min(Math.max(5, goal), total);
  return `<div class="box gcard">
    <div class="gtop">${ring(pct, pct >= 1 ? '✓' : Math.round(pct * 100) + '%')}
      <div class="grow"><b>${n >= goal ? 'Objectif atteint 🎉' : 'Objectif du jour'}</b><div class="mut">${n} / ${goal} ${plural(goal, 'carte révisée', 'cartes révisées')}</div></div>
      <div class="gstreak ${sk.today ? 'on' : ''}" title="Jours de suite"><span>🔥</span><b>${sk.cur}</b></div></div>
    <div class="glvl"><span class="lvlchip">Niv. ${li.level}</span><span class="mut">${esc(li.title)}</span><span class="sp"></span><span class="mut">${li.into} / ${li.need} XP</span></div>
    <div class="xpbar" role="progressbar" aria-valuenow="${li.into}" aria-valuemax="${li.need}"><i style="width:${(li.pct * 100).toFixed(1)}%"></i></div>
    <div class="bar" style="margin:14px 0 0"><button class="pri grow" data-a="run" data-mode="daily" ${total ? '' : 'disabled'}>▶ Session du jour (${due} ${plural(due, 'carte', 'cartes')})</button><button data-a="stats">Profil</button></div></div>`;
}
function onboarding() {
  return `<div class="box onb"><div class="big">👋</div><h2>Bienvenue !</h2>
    <p class="mut" style="margin:0">Crée des paquets de cartes, trie-les en « je connais / je ne connais pas » et révise jusqu'à tout savoir.</p>
    <ol><li><b>Crée</b> un paquet ou <b>importe</b> un fichier CSV</li><li><b>Révise</b> et trie tes cartes</li><li><b>Synchronise</b> avec Google pour les retrouver partout</li></ol>
    <div class="bar" style="justify-content:center"><button class="pri" data-a="newdeck">+ Créer un paquet</button><button data-a="sample">✨ Essayer avec un exemple</button></div>
    ${clientId() ? '<button class="lnk" data-a="connect">Déjà utilisé sur un autre appareil ? Se connecter avec Google</button>' : ''}</div>`;
}

/* ---------- liste de cartes d'un paquet ---------- */
function visibleCards() {
  let cs = cardsOf(state.deckId);
  if (state.filter !== 'all') cs = cs.filter(c => state.filter === 'flag' ? c.flag : c.status === state.filter);
  return cs.filter(c => matches(c, state.search));
}
function cardRow(c) {
  const on = state.sel.has(c.id);
  return `<div class="crow${on ? ' on' : ''}" role="button" tabindex="0" ${state.selMode ? `aria-pressed="${on}"` : ''} data-a="rowtap" data-id="${c.id}">${state.selMode ? `<span class="chk" aria-hidden="true">${on ? '☑' : '☐'}</span>` : `<span class="dot ${c.status}"></span>`}<div class="math grow"><b>${fmt(c.q)}</b><div class="ans-line">${fmt(c.a)}</div></div>${c.flag ? '<span class="flg" title="Marquée">🚩</span>' : ''}</div>`;
}
function cardList() {
  const cs = visibleCards();
  if (!cs.length) return `<p class="mut" style="text-align:center;padding:24px 0">${state.search || state.filter !== 'all' ? 'Aucune carte trouvée.' : 'Aucune carte pour l\'instant.'}</p>`;
  const shown = cs.slice(0, state.limit), rest = cs.length - shown.length;
  return shown.map(cardRow).join('') + (rest > 0 ? `<button type="button" class="more" data-a="more">Afficher plus (${rest} ${plural(rest, 'restante', 'restantes')})</button>` : '');
}
function selBarHTML() {
  if (!state.selMode) return '';
  const n = state.sel.size;
  return `<div class="selbar">${ib('✕', 'Annuler la sélection', 'data-a="selcancel"')}<b class="grow" aria-live="polite">${n} ${plural(n, 'sélectionnée', 'sélectionnées')}</b><button class="sm" data-a="selall">Tout</button><button class="ko sm" data-a="seldel" ${n ? '' : 'disabled'}>Supprimer</button></div>`;
}
function refreshDeckList() {
  const l = $('cardlist'), sb = $('selbar');
  if (l) l.innerHTML = cardList();
  if (sb) sb.innerHTML = selBarHTML();
  typeset();
}

/* ---------- étude : résumés ---------- */
const starsRow = n => `<div class="stars" aria-label="${n} étoile${n > 1 ? 's' : ''} sur 3">${[1, 2, 3].map(i => `<span class="star ${i <= n ? 'on' : ''}">★</span>`).join('')}</div>`;
function goalBlock() {
  const li = levelInfo(totalXp()), n = dayTotals(TODAY()).n, goal = cfg.goal || 20, sk = streakInfo();
  return `<div class="box"><div class="glvl" style="margin-top:0"><span class="lvlchip">Niv. ${li.level}</span><span class="mut">${esc(li.title)}</span><span class="sp"></span><span class="mut">${li.into} / ${li.need} XP</span></div>
    <div class="xpbar"><i style="width:${(li.pct * 100).toFixed(1)}%"></i></div>
    <div class="glvl"><span class="mut">🎯 Objectif du jour</span><span class="sp"></span><b>${Math.min(n, goal)} / ${goal}</b></div>
    <div class="xpbar"><i style="width:${Math.min(100, n / goal * 100).toFixed(1)}%"></i></div>
    <p class="mut" style="margin:12px 0 0">🔥 ${sk.cur} ${plural(sk.cur, 'jour', 'jours')} de suite</p></div>`;
}
function summaryView(st) {
  const s = scopeStats(st.deckId, st.folderId);
  const acc = st.na ? Math.round(st.nk / st.na * 100) : 0;
  const done = st.mode === 'unknown' && !s.unknown;
  const title = done ? 'Bravo, plus rien à revoir 🎉' : 'Session terminée 🎉';
  const btns = `<div class="bar">${s.unknown ? `<button class="ko grow" data-a="restudy" data-id="unknown">🔁 Revoir « je ne connais pas » (${s.unknown})</button>` : ''}${s.new ? `<button class="grow" data-a="restudy" data-id="new">Continuer le tri (${s.new})</button>` : ''}<button class="${s.unknown || s.new ? '' : 'pri grow'}" data-a="studyback">Retour</button></div>`;
  if (!cfg.game) {
    return `<h1 class="sumtitle">${title}</h1>
      <div class="kpis"><div class="kpi"><b>${st.na}</b><span>${plural(st.na, 'carte révisée', 'cartes révisées')}</span></div><div class="kpi"><b>${acc}%</b><span>Précision (${st.nk}/${st.na})</span></div></div>${btns}`;
  }
  return `<h1 class="sumtitle" style="text-align:center">${title}</h1>${st.na ? starsRow(st.stars) : ''}
    <div class="kpis"><div class="kpi"><b>+${st.xp}</b><span>XP gagnés${st.bonus ? ` (dont ${st.bonus} de bonus)` : ''}</span></div>
      <div class="kpi"><b>${acc}%</b><span>Précision (${st.nk}/${st.na})</span></div>
      <div class="kpi"><b>×${st.bestCombo}</b><span>Meilleure série</span></div>
      <div class="kpi"><b>${st.round > 1 ? st.round : st.na}</b><span>${st.round > 1 ? 'tours' : plural(st.na, 'carte révisée', 'cartes révisées')}</span></div></div>
    ${st.newBadges.length ? `<div class="box"><h2>Badges débloqués</h2><div class="chips">${st.newBadges.map(b => `<span class="chip g">${b.icon} ${esc(b.name)}</span>`).join('')}</div></div>` : ''}
    ${goalBlock()}${btns}`;
}
function blitzView(st) {
  if (st.over) {
    const acc = st.na ? Math.round(st.nk / st.na * 100) : 0;
    return `<h1 class="sumtitle" style="text-align:center">⚡ Défi terminé</h1>
      <div class="box" style="text-align:center"><div style="font-size:3.4rem;font-weight:800;color:var(--pri2);line-height:1.1">${st.score}</div>
        <div class="mut">${plural(st.score, 'bonne réponse', 'bonnes réponses')} en 60 secondes</div>
        <p style="margin:10px 0 0;font-weight:800">${st.newRecord ? (st.prevBest ? '🏆 Nouveau record !' : '🏆 Premier record !') : st.prevBest ? `Record à battre : ${st.prevBest}` : ''}</p></div>
      <div class="kpis"><div class="kpi"><b>+${st.xp}</b><span>XP gagnés${st.bonus ? ` (dont ${st.bonus} de bonus)` : ''}</span></div><div class="kpi"><b>${acc}%</b><span>Précision (${st.nk}/${st.na})</span></div></div>
      ${st.newBadges.length ? `<div class="box"><h2>Badges débloqués</h2><div class="chips">${st.newBadges.map(b => `<span class="chip g">${b.icon} ${esc(b.name)}</span>`).join('')}</div></div>` : ''}
      <div class="bar"><button class="pri grow" data-a="blitzagain">⚡ Rejouer</button><button data-a="studyback">Retour</button></div>`;
  }
  if (!st.ready) {
    const best = (db.game.records[scopeKey(st)] || {}).s;
    return `<div class="topbar">${ib('✕', 'Quitter', 'data-a="studyback"')}<b class="ttl">⚡ Défi éclair</b></div>
      <div class="box" style="text-align:center"><div style="font-size:3rem;line-height:1.2">⚡</div><h2>60 secondes</h2>
        <p class="mut">Retourne la carte, puis dis si tu la connais. Fais un maximum de bonnes réponses !<br>Le défi ne modifie pas ton tri.</p>
        ${best ? `<p style="font-weight:800;margin:0 0 6px">🏆 Record : ${best}</p>` : ''}
        <button class="pri" data-a="blitzgo" style="width:100%;margin-top:8px">Go !</button></div>`;
  }
  const c = db.cards[st.queue[st.i]], left = Math.max(0, st.deadline - now());
  return `<div class="topbar">${ib('✕', 'Quitter', 'data-a="studyback"')}<b class="ttl">⚡ Défi éclair</b><span class="sp"></span><span class="score" aria-live="polite">✓ ${st.score}</span><span class="btime" id="btime">${Math.ceil(left / 1000)}</span></div>
    <div class="tbar"><i id="bbar" style="width:${(left / 600).toFixed(1)}%"></i></div>
    <div class="box fc math" role="button" tabindex="0" data-a="flip"><span class="lab">${st.flip ? 'Réponse' : 'Question'}</span><div class="fc-in">${fmt(st.flip ? c.a : c.q)}</div></div>
    ${st.flip ? `<div class="ans"><button class="ko" data-a="ans" data-id="unknown">❌ Raté</button><button class="ok" data-a="ans" data-id="known">✅ Connue</button></div>`
      : `<div class="ans"><button class="pri" data-a="flip">Retourner</button></div>`}`;
}

/* ---------- statistiques ---------- */
function recordsHTML() {
  const rows = Object.entries(db.game.records).map(([key, r]) => {
    let name = '';
    if (key === '*') name = '📚 Bibliothèque';
    else if (key.startsWith('f:')) { const f = db.folders[key.slice(2)]; if (f && !f.deleted) name = '📁 ' + f.name; }
    else { const d = db.decks[key.slice(2)]; if (d && !d.deleted) name = d.name; }
    return name ? { name, s: r.s } : null;
  }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, 5);
  if (!rows.length) return '<p class="mut" style="margin:0">Aucun défi joué pour l\'instant. Lance un « ⚡ Défi éclair » depuis Réviser.</p>';
  return rows.map(r => `<div class="setrow" style="cursor:default"><span>${esc(r.name)}</span><b>${r.s}</b></div>`).join('');
}

/* ---------- les écrans ---------- */
const views = {
  home() {
    const first = !decks().length && !Object.keys(db.cards).length;
    const n = decks().length;
    return `<div class="hero"><div class="logo"><img src="icon-192.png" alt=""></div><div class="grow"><h1>Flashcards</h1><div class="mut">${n} ${plural(n, 'paquet', 'paquets')}</div></div>
      <button class="lnk" id="relink" data-a="relogin" hidden>Reconnecter</button>${ib('📊', 'Statistiques', 'data-a="stats"', 'bd')}${ib('⚙️', 'Réglages', 'data-a="settings" id="cloudbtn"', 'bd')}</div>
      ${cfg.game && !first ? gameCard() : ''}
      ${!cfg.signedIn && clientId() && !first ? '<div class="banner"><span>☁️ Retrouve tes paquets sur tous tes appareils.</span><button class="pri sm" data-a="connect">Se connecter</button></div>' : ''}
      ${first ? onboarding() : `<input type="search" id="gsearch" class="search" aria-label="Rechercher une carte" placeholder="🔍 Rechercher une carte…" value="${esc(state.gsearch)}" autocomplete="off"><div id="gres">${homeBody()}</div>`}
      <button class="fab" data-a="addmenu" title="Ajouter" aria-label="Ajouter">+</button>`;
  },
  deck() {
    const d = db.decks[state.deckId]; if (!d) return go('home'), '';
    const s = stats(d.id);
    return `<div class="topbar">${ib('←', 'Retour', 'data-a="home"')}<span class="sp"></span>${ib('⋯', 'Options du paquet', 'data-a="deckmenu"')}</div>
      <h1>${esc(d.name)}</h1>
      <div class="box">${chips(s)}${bar(s)}
        <div class="bar" style="margin:14px 0 0"><button class="pri grow" data-a="studymenu" data-id="d:${d.id}" ${s.total ? '' : 'disabled'}>▶ Réviser</button><button data-a="addcard">+ Carte</button></div></div>
      <div class="toolrow"><input type="search" id="dsearch" class="search" aria-label="Rechercher dans ce paquet" placeholder="🔍 Rechercher…" value="${esc(state.search)}" autocomplete="off">
        <select data-f="filter" aria-label="Filtrer les cartes">${opt('all', 'Toutes', state.filter)}${opt('new', 'Non triées', state.filter)}${opt('unknown', 'À revoir', state.filter)}${opt('known', 'Connues', state.filter)}${opt('flag', '🚩 Marquées', state.filter)}</select>
        ${ib('☑', 'Sélectionner plusieurs cartes', 'data-a="selmode"')}</div>
      <div id="selbar">${selBarHTML()}</div>
      <div id="cardlist">${cardList()}</div>`;
  },
  edit() {
    const c = state.editId ? db.cards[state.editId] : null;
    const fresh = !c && state.editFrom !== 'study';
    return `<div class="topbar">${ib('←', 'Retour', 'data-a="canceledit"')}<b class="ttl">${c ? 'Modifier la carte' : 'Nouvelle carte'}</b><span class="sp"></span>
        ${c ? `${ib(c.flag ? '🚩' : '⚐', 'Marquer cette carte', 'data-a="flagedit"')}${ib('🗑', 'Supprimer cette carte', 'data-a="delcard"', 'danger')}` : ''}</div>
      ${fresh && state.addCount ? `<p class="mut">✅ ${state.addCount} ${plural(state.addCount, 'carte ajoutée', 'cartes ajoutées')} — continue ou reviens avec ←</p>` : ''}
      ${latexToolbar()}
      <label for="eq">Question</label><textarea id="eq" placeholder="Texte + LaTeX, ex : dérivée de $x^2$ ?">${esc(c ? c.q : '')}</textarea>
      <label for="ea">Réponse</label><textarea id="ea" placeholder="ex : $2x$">${esc(c ? c.a : '')}</textarea>
      <label>Aperçu</label><div class="box math" id="epv"></div>
      <div class="bar"><button class="pri grow" data-a="savecard">${fresh ? 'Ajouter la carte' : 'Enregistrer'}</button></div>`;
  },
  study() {
    const st = state.study;
    if (st.mode === 'blitz') return blitzView(st);
    if (st.i >= st.queue.length) return summaryView(st);
    const c = db.cards[st.queue[st.i]], li = cfg.game ? levelInfo(totalXp()) : null;
    return `<div class="topbar">${ib('✕', 'Quitter', 'data-a="studyback"')}<span class="mut grow" style="text-align:center">${esc(scopeName(st))} · ${st.i + 1}/${st.queue.length}${st.round > 1 ? ` · tour ${st.round}` : ''}</span>
        ${ib('↩', 'Carte précédente', `data-a="back" ${st.i ? '' : 'disabled'}`)}${ib(c.flag ? '🚩' : '⚐', 'Marquer cette carte (F)', 'data-a="flagstudy"')}${ib('✏️', 'Modifier cette carte', 'data-a="editstudy"')}</div>
      ${li ? `<div class="hud"><span class="lvlchip">Niv. ${li.level}</span><div class="xpbar"><i style="width:${(li.pct * 100).toFixed(1)}%"></i></div><span class="combo ${st.combo >= 2 ? 'on' : ''}" id="combo" aria-label="Série de bonnes réponses">🔥 ×${st.combo}</span></div>` : ''}
      <div class="prog" style="margin:0 0 12px"><i class="g" style="width:${st.i / st.queue.length * 100}%"></i></div>
      <div class="box fc math" role="button" tabindex="0" data-a="flip"><span class="lab">${st.flip ? 'Réponse' : 'Question'}</span><div class="fc-in">${fmt(st.flip ? c.a : c.q)}</div></div>
      ${st.flip ? `<div class="ans"><button class="ko" data-a="ans" data-id="unknown">❌ Je ne connais pas</button><button class="ok" data-a="ans" data-id="known">✅ Je connais</button></div>`
        : `<div class="ans"><button class="pri" data-a="flip">Retourner</button></div>`}`;
  },
  import() {
    const i = state.imp;
    const target = `<label for="impdeck">Paquet de destination</label><select id="impdeck" data-f="deckId">${opt('', '➕ Nouveau paquet…', i.deckId)}${decks().map(d => opt(d.id, esc(d.name), i.deckId)).join('')}</select>
      ${i.deckId ? '' : `<label for="impname">Nom du nouveau paquet</label><input type="text" id="impname" data-f="newName" value="${esc(i.newName)}">`}`;
    const csv = `<label for="csvfile">Fichier CSV (colonne 1 = question, colonne 2 = réponse)</label><input type="file" id="csvfile" accept=".csv,.txt,.tsv">
      <div class="row"><div><label for="impdelim">Séparateur de colonnes</label><select id="impdelim" data-f="delim">${opt('auto', 'Automatique', i.delim)}${opt(';', 'Point-virgule ;', i.delim)}${opt(',', 'Virgule ,', i.delim)}${opt('\t', 'Tabulation', i.delim)}</select></div>
      <div><label>&nbsp;</label><label style="font-weight:400"><input type="checkbox" data-f="header" ${i.header ? 'checked' : ''}> 1ʳᵉ ligne = en-têtes</label></div></div>`;
    const paste = `<label for="ptext">Colle ton texte</label>${latexToolbar()}<textarea id="ptext" data-f="text" style="min-height:160px">${esc(i.text)}</textarea>
      <div class="row"><div><label for="impcs">Entre deux cartes</label><select id="impcs" data-f="cardSep">${opt('nl', 'Nouvelle ligne', i.cardSep)}${opt('blank', 'Ligne vide', i.cardSep)}${opt('custom', 'Personnalisé…', i.cardSep)}</select>
      ${i.cardSep === 'custom' ? `<input type="text" aria-label="Séparateur de cartes" data-f="customCard" value="${esc(i.customCard)}" placeholder="ex: ;;  (\\n = retour ligne)">` : ''}</div>
      <div><label for="impfs">Entre question et réponse</label><select id="impfs" data-f="fieldSep">${opt('tab', 'Tabulation', i.fieldSep)}${opt(';', 'Point-virgule ;', i.fieldSep)}${opt(',', 'Virgule ,', i.fieldSep)}${opt(' - ', 'Tiret « - »', i.fieldSep)}${opt(' : ', 'Deux-points « : »', i.fieldSep)}${opt('|', 'Barre |', i.fieldSep)}${opt('=', 'Égal =', i.fieldSep)}${opt('custom', 'Personnalisé…', i.fieldSep)}</select>
      ${i.fieldSep === 'custom' ? `<input type="text" aria-label="Séparateur question/réponse" data-f="customField" value="${esc(i.customField)}" placeholder="ex: ->  ou  ???">` : ''}</div></div>
      <label for="impwhich">Si le séparateur apparaît plusieurs fois</label><select id="impwhich" data-f="which">${opt('first', 'Couper au premier', i.which)}${opt('last', 'Couper au dernier', i.which)}</select>`;
    const manual = `${i.addCount ? `<p class="mut">✅ ${i.addCount} ${plural(i.addCount, 'carte ajoutée', 'cartes ajoutées')} dans cette session.</p>` : ''}
      ${latexToolbar()}
      <label for="mq">Question</label><textarea id="mq" placeholder="Texte + LaTeX, ex : dérivée de $x^2$ ?"></textarea>
      <label for="ma">Réponse</label><textarea id="ma" placeholder="ex : $2x$"></textarea>
      <label>Aperçu</label><div class="box math" id="mpv"></div>
      <button class="pri" data-a="addmanual">+ Ajouter cette carte</button>`;
    return `<div class="topbar">${ib('←', 'Retour', `data-a="${state.impFrom === 'deck' ? 'opendeck' : 'home'}"`)}<b class="ttl">Importer des cartes</b></div>
      <div class="bar tabs"><button class="${i.tab === 'csv' ? 'on' : ''}" data-a="imptab" data-id="csv">📄 Fichier CSV</button><button class="${i.tab === 'paste' ? 'on' : ''}" data-a="imptab" data-id="paste">📋 Copier-coller</button><button class="${i.tab === 'manual' ? 'on' : ''}" data-a="imptab" data-id="manual">✍️ Carte par carte</button></div>
      <div class="box">${target}${i.tab === 'csv' ? csv : i.tab === 'paste' ? paste : manual}</div>
      ${i.tab !== 'manual' ? `<div class="box"><b id="impcount"></b><div class="pv math" id="imppv"></div></div>
      <button class="pri" data-a="doimport">Importer</button>` : ''}`;
  },
  stats() {
    const t = gameTotals(), li = levelInfo(t.xp), sk = streakInfo(), days = lastDays(14), max = Math.max(5, ...days.map(d => d.n));
    const s = sumStats(decks()), acc = t.n ? Math.round(t.k / t.n * 100) : 0, g = cfg.game;
    const wk = days.slice(-7).reduce((a, d) => a + d.n, 0);
    return `<div class="topbar">${ib('←', 'Retour', 'data-a="home"')}<b class="ttl">${g ? 'Profil' : 'Statistiques'}</b></div>
      ${g ? `<div class="box gcard"><div class="glvl" style="margin-top:0"><span class="lvlchip">Niv. ${li.level}</span><b>${esc(li.title)}</b><span class="sp"></span><span class="mut">${t.xp} XP</span></div>
        <div class="xpbar"><i style="width:${(li.pct * 100).toFixed(1)}%"></i></div><p class="mut" style="margin:8px 0 0">${li.need - li.into} XP avant le niveau ${li.level + 1}</p></div>` : ''}
      <div class="kpis"><div class="kpi"><b>${t.n}</b><span>Cartes révisées</span></div><div class="kpi"><b>${acc}%</b><span>Précision</span></div>
        <div class="kpi"><b>🔥 ${sk.cur}</b><span>Jours de suite (record ${sk.best})</span></div><div class="kpi"><b>${wk}</b><span>Révisions sur 7 jours</span></div></div>
      <div class="box"><h2>14 derniers jours</h2><div class="chart" role="img" aria-label="Cartes révisées par jour sur 14 jours">${days.map(d => `<div class="cbar" title="${esc(d.label)} : ${d.n}"><div class="cb-track"><i class="${d.today ? 'today' : d.n ? 'on' : ''}" style="height:${d.n ? Math.max(6, d.n / max * 100) : 2}%"></i></div><span>${d.dow}</span></div>`).join('')}</div></div>
      <div class="box"><h2>Ma bibliothèque</h2>${bar(s)}<div class="chips"><span class="chip">${s.total} ${plural(s.total, 'carte', 'cartes')}</span><span class="chip g">✓ ${s.known} connues</span><span class="chip r">✗ ${s.unknown} à revoir</span><span class="chip">○ ${s.new} non triées</span></div>
        <p class="mut" style="margin:10px 0 0">${s.total ? Math.round(s.known / s.total * 100) : 0}% maîtrisé · ${decks().length} ${plural(decks().length, 'paquet', 'paquets')}</p></div>
      ${g ? `<div class="box"><h2>Badges · ${Object.keys(db.game.badges).filter(id => BADGES.some(b => b.id === id)).length} / ${BADGES.length}</h2><div class="badges">${BADGES.map(b => { const on = !!db.game.badges[b.id]; return `<div class="badge ${on ? 'on' : ''}"><span class="bi" aria-hidden="true">${on ? b.icon : '🔒'}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`; }).join('')}</div></div>
        <div class="box"><h2>⚡ Records du défi éclair</h2>${recordsHTML()}</div>`
        : `<div class="box"><b>🎮 Envie de t'amuser en révisant ?</b><p class="mut">Le mode jeu ajoute des XP, des niveaux, des séries de jours, un objectif quotidien, des badges et un défi chronométré. Tu peux le désactiver à tout moment.</p><button class="pri" data-a="gameon">Activer le mode jeu</button></div>`}`;
  },
  settings() {
    const need = !clientId(), g = !!cfg.game, bad = cfg.signedIn && state.needLogin;
    return `<div class="topbar">${ib('←', 'Retour', 'data-a="home"')}<b class="ttl">Réglages</b></div>
      <div class="sgroup">Jeu</div>
      <div class="setcard">${setrow('🎮 Mode jeu', 'XP, niveaux, séries, objectif du jour, badges et défi éclair', switchCtl('game', g))}
        ${g ? setrow('Objectif quotidien', 'Cartes à réviser chaque jour', `<select data-s="goal" aria-label="Objectif quotidien">${[10, 20, 30, 50, 100].map(n => opt(n, n + ' cartes', cfg.goal || 20)).join('')}</select>`) : ''}
        ${g ? setrow('Sons et vibrations', 'Retours sonores discrets pendant la révision', switchCtl('sound', !!cfg.sound)) : ''}</div>
      <div class="sgroup">Étude</div>
      <div class="setcard">${setrow('🔀 Mélanger les cartes', 'Ordre aléatoire à chaque session', switchCtl('shuffle', cfg.shuffle !== false))}
        ${setrow('🚩 Marquer mes erreurs', 'Une carte « je ne connais pas » est marquée automatiquement', switchCtl('autoFlag', cfg.autoFlag !== false))}</div>
      <div class="sgroup">Apparence</div>
      <div class="setcard">${setrow('Thème', '', `<select data-s="theme" aria-label="Thème">${opt('auto', 'Automatique', cfg.theme)}${opt('light', 'Clair', cfg.theme)}${opt('dark', 'Sombre', cfg.theme)}</select>`)}</div>
      <div class="sgroup">Compte et synchronisation</div>
      <div class="setcard"><div class="pad"><p class="mut" style="margin-top:0">Connecte-toi avec ton compte Google : ta bibliothèque est stockée dans le dossier caché de l'app sur ton Google Drive et se synchronise automatiquement entre tes appareils.</p>
        ${cfg.signedIn ? `<p style="margin:0 0 10px">${bad ? '⚠️ Reconnexion nécessaire' : '✅ Connecté'}${cfg.email ? ' · <b>' + esc(cfg.email) + '</b>' : ''}</p><div class="bar">${bad ? '<button class="pri" data-a="relogin">Se reconnecter</button>' : '<button class="pri" data-a="sync">🔄 Synchroniser maintenant</button>'}<button data-a="unlink">Se déconnecter</button></div>`
          : '<div class="bar"><button class="pri" data-a="connect">Se connecter avec Google</button></div>'}
        <div class="mut" id="syncmsg">${esc(state.msg || (cfg.last ? 'Dernière synchro : ' + new Date(cfg.last).toLocaleString('fr-FR') : ''))}</div></div></div>
      <details class="box" ${need ? 'open' : ''}><summary><b>Configuration Google & rester connecté</b></summary>
        <p class="mut"><b>💡 Pour ne jamais être déconnecté :</b> console Google Cloud → <i>Google Auth Platform</i> → <i>Audience</i> → <b>« Publier l'application »</b>. Tant que l'app est en mode « Test », Google coupe l'accès toutes les semaines.</p>
        <ol class="mut"><li>Va sur console.cloud.google.com → crée un projet.</li>
        <li>« API et services » → « Bibliothèque » → active <b>Google Drive API</b>.</li>
        <li>« Écran de consentement OAuth » → Externe → ajoute ton adresse Gmail comme utilisateur test.</li>
        <li>« Identifiants » → Créer → ID client OAuth → <b>Application Web</b>. Dans « Origines JavaScript autorisées » ajoute <code>${esc(location.origin)}</code>.</li>
        <li>Colle l'ID client ci-dessous (ou dans <code>GOOGLE_CLIENT_ID</code> en haut de <code>js/sync.js</code>).</li></ol>
        <label for="cid">ID client Google</label><input type="text" id="cid" value="${esc(clientId())}" placeholder="123-abc.apps.googleusercontent.com"></details>
      <div class="sgroup">Données</div>
      <div class="setcard">${setact('Exporter une sauvegarde', 'Fichier JSON de toute ta bibliothèque', '<button class="sm" data-a="export">Exporter</button>')}
        ${setact('Importer une sauvegarde', 'Fusionne un fichier JSON avec ta bibliothèque', '<label class="btn sm" style="margin:0;cursor:pointer">Importer<input type="file" id="jsonfile" accept=".json" hidden></label>')}
        ${setact('Réinitialiser la progression du jeu', 'XP, badges, séries et records — tes cartes sont conservées', '<button class="sm danger" data-a="resetgame">Réinitialiser</button>')}</div>
      <div class="sgroup">À propos</div>
      <div class="setcard"><div class="pad mut"><b style="color:var(--fg)">Flashcards</b> · version ${APP_VERSION}<br>Fonctionne hors ligne. Formules LaTeX avec KaTeX (MIT), police Nunito (OFL).
        <p style="margin:10px 0 0"><kbd>Espace</kbd> retourner · <kbd>←</kbd> je ne connais pas · <kbd>→</kbd> je connais · <kbd>F</kbd> marquer · <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>U</kbd> gras / souligné</p></div></div>`;
  },
};
function render() {
  $app.innerHTML = views[state.view]();
  if (state.view === 'home') updateCloud();
  if (state.view === 'import') { if (state.imp.tab === 'manual') updateManualPv(); else updatePreview(); }
  if (state.view === 'edit') { updateEditPv(); const el = $(state.lastField === 'ea' ? 'ea' : 'eq'); if (el && !state.editId) el.focus(); }
  typeset();
}
