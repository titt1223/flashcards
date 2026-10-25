'use strict';
/* Vues : chaque écran est une fonction qui renvoie du HTML ; render() l'affiche. Conception inspirée d'iOS :
   grands titres, listes groupées, barre d'onglets, contrôles segmentés. */

const go = (view, extra = {}) => {
  closeSheet(); closeCompose(); hidePill();
  if (view !== 'deck') { state.selMode = false; state.sel = new Set(); }
  if (view !== 'study' && state.timer) { clearInterval(state.timer); state.timer = null; }
  if (view === 'home' && !('gsearch' in extra)) state.gsearch = '';   // revenir à l'accueil repart d'une recherche vide
  Object.assign(state, { view }, extra);
  render(); window.scrollTo(0, 0);
  $app.classList.remove('vin'); void $app.offsetWidth; $app.classList.add('vin');
};

/* ---------- éléments communs ---------- */
const goneFolder = f => !f || f.deleted;
const folderOf = d => (d.folderId && !goneFolder(db.folders[d.folderId]) ? db.folders[d.folderId] : null);
function progBar(s) {
  const t = s.total || 1;
  return `<div class="prog" role="img" aria-label="${s.known} connues, ${s.unknown} à revoir, ${s.new} non triées"><i class="g" style="width:${s.known / t * 100}%"></i><i class="r" style="width:${s.unknown / t * 100}%"></i></div>`;
}
function deckSub(s) {
  if (!s.total) return 'Aucune carte';
  return `${s.total} ${plural(s.total, 'carte', 'cartes')}${s.unknown ? ` · <span class="bad">${s.unknown} à revoir</span>` : ''}`;
}
const deckRow = d => `<div class="row ic" role="button" tabindex="0" data-a="open" data-id="${d.id}">${tile('layers', 'g')}<span class="rt"><b>${esc(d.name)}</b><small class="c1">${deckSub(stats(d.id))}</small></span><span class="trail">${icon('chev-r', 18)}</span></div>`;
function folderRow(f) {
  const ds = decks().filter(d => d.folderId === f.id), s = sumStats(ds);
  return `<div class="row ic" role="button" tabindex="0" data-a="openfolder" data-id="${f.id}">${tile('folder', 'o')}<span class="rt"><b>${esc(f.name)}</b><small class="c1">${ds.length} ${plural(ds.length, 'paquet', 'paquets')} · ${s.total} ${plural(s.total, 'carte', 'cartes')}</small></span><span class="trail">${icon('chev-r', 18)}</span></div>`;
}
function searchResults() {
  const rs = Object.values(db.cards).filter(c => !c.deleted && db.decks[c.deckId] && !db.decks[c.deckId].deleted && matches(c, state.gsearch));
  if (!rs.length) return '<div class="empty">Aucune carte trouvée.</div>';
  return `<div class="grp-h" style="margin-top:6px">${rs.length} ${plural(rs.length, 'résultat', 'résultats')}</div><div class="list">${rs.slice(0, 100).map(c =>
    `<div class="row" role="button" tabindex="0" data-a="gopen" data-id="${c.id}"><span class="dot ${c.status}"></span><div class="rt math"><small>${esc(db.decks[c.deckId].name)}</small><b class="c2">${fmt(c.q)}</b><small class="c1">${fmt(c.a)}</small></div><span class="trail">${icon('chev-r', 18)}</span></div>`).join('')}</div>`
    + (rs.length > 100 ? '<p class="grp-f">… affine ta recherche pour voir la suite.</p>' : '');
}
function homeBody() {
  if (state.gsearch.trim()) return searchResults();
  const fs = folders(), loose = decks().filter(d => !folderOf(d));
  if (!fs.length && !loose.length) return '<div class="empty"><div class="big">🌱</div><p>Aucun paquet pour l\'instant.<br>Touche + pour en créer un ou importer des cartes.</p></div>';
  let h = '';
  if (fs.length) h += `${loose.length ? '<div class="grp-h">Classeurs</div>' : ''}<div class="list">${fs.map(folderRow).join('')}</div>`;
  if (loose.length) h += `${fs.length ? '<div class="grp-h">Paquets</div>' : ''}<div class="list">${loose.map(deckRow).join('')}</div>`;
  return h;
}
// pastille « cloud » : signale (point rouge sur l'onglet Réglages) qu'une reconnexion est nécessaire
function updateCloud() {
  const bad = cfg.signedIn && state.needLogin, t = $('tab-settings'), r = $('relink');
  if (t) t.classList.toggle('alert', bad);
  if (r) r.hidden = !bad;
}
function renderTabbar() {
  const tb = $('tabbar'), show = ['home', 'folder', 'deck', 'stats', 'settings'].includes(state.view);
  $app.classList.toggle('notab', !show);
  if (!show) { tb.innerHTML = ''; return; }
  const cur = state.view === 'stats' ? 'stats' : state.view === 'settings' ? 'settings' : 'home';
  tb.innerHTML = [['home', 'Bibliothèque', 'book'], ['stats', cfg.game ? 'Profil' : 'Progrès', 'chart'], ['settings', 'Réglages', 'sliders']]
    .map(([id, l, ic]) => `<button type="button" id="tab-${id}" class="${cur === id ? 'on' : ''}" data-a="tab" data-id="${id}" aria-current="${cur === id ? 'page' : 'false'}">${icon(ic, 24)}<span>${l}</span></button>`).join('');
  updateCloud();
}

/* ---------- mode jeu : carte « Aujourd'hui » ---------- */
function ring(pct, label) {
  const C = 163.36;
  return `<div class="ring ${pct >= 1 ? 'done' : ''}"><svg width="54" height="54" viewBox="0 0 64 64" aria-hidden="true"><circle class="rbg" cx="32" cy="32" r="26"/><circle class="rfg" cx="32" cy="32" r="26" stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - Math.min(1, pct))).toFixed(2)}"/></svg><div class="num">${label}</div></div>`;
}
function todayCard() {
  const n = dayTotals(TODAY()).n, goal = cfg.goal || 20, pct = n / goal, sk = streakInfo(), total = allCards().length;
  return `<div class="today">${ring(pct, pct >= 1 ? '✓' : Math.round(pct * 100) + '%')}
    <div class="grow"><b>Aujourd'hui</b><div class="mut" style="font-size:15px">${n} sur ${goal}${sk.cur ? ` · 🔥 ${sk.cur}` : ''}</div></div>
    <button type="button" class="btn pri sm" data-a="run" data-mode="daily" ${total ? '' : 'disabled'}>Commencer</button></div>`;
}
function onboarding() {
  return `<div class="onb"><div class="big">👋</div><h2>Bienvenue</h2>
    <p class="mut" style="margin:0">Crée des paquets de cartes, trie-les en « je connais / je ne connais pas » et révise jusqu'à tout savoir.</p>
    <ol><li><b>Crée</b> un paquet ou <b>importe</b> un fichier CSV</li><li><b>Révise</b> et trie tes cartes</li><li><b>Synchronise</b> avec Google pour les retrouver partout</li></ol>
    <div class="btns wrap" style="justify-content:center;margin:0"><button type="button" class="btn pri" data-a="newdeck">Créer un paquet</button><button type="button" class="btn" data-a="sample">Essayer avec un exemple</button></div>
    ${clientId() ? '<p style="margin:16px 0 0"><button type="button" class="lnk" data-a="connect">Déjà utilisé sur un autre appareil ? Se connecter avec Google</button></p>' : ''}</div>`;
}

/* ---------- liste des cartes d'un paquet ---------- */
function visibleCards() {
  let cs = cardsOf(state.deckId);
  if (state.filter !== 'all') cs = cs.filter(c => state.filter === 'flag' ? c.flag : c.status === state.filter);
  return cs.filter(c => matches(c, state.search));
}
function cardRow(c) {
  const on = state.sel.has(c.id);
  return `<div class="row${on ? ' on' : ''}" role="button" tabindex="0" ${state.selMode ? `aria-pressed="${on}"` : ''} data-a="rowtap" data-id="${c.id}">${state.selMode ? `<span class="chk" aria-hidden="true">${icon(on ? 'check-circle' : 'circle', 24)}</span>` : `<span class="dot ${c.status}"></span>`}<div class="rt math"><b class="c2">${fmt(c.q)}</b><small class="c1">${fmt(c.a)}</small></div>${c.flag ? `<span class="flg" title="Marquée">${icon('flag-f', 16)}</span>` : ''}</div>`;
}
function cardList() {
  const cs = visibleCards();
  if (!cs.length) return `<div class="empty" style="padding:36px 16px">${state.search || state.filter !== 'all' ? 'Aucune carte trouvée.' : 'Aucune carte pour l\'instant.'}</div>`;
  const shown = cs.slice(0, state.limit), rest = cs.length - shown.length;
  return `<div class="list">${shown.map(cardRow).join('')}${rest > 0 ? `<button type="button" class="more" data-a="more">Afficher plus (${rest} ${plural(rest, 'restante', 'restantes')})</button>` : ''}</div>`;
}
function selBarHTML() {
  if (!state.selMode) return '';
  const n = state.sel.size;
  return `<div class="selbar"><b class="grow" aria-live="polite">${n} ${plural(n, 'sélectionnée', 'sélectionnées')}</b><button type="button" class="btn sm" data-a="selall">Tout</button><button type="button" class="btn sm ko" data-a="seldel" ${n ? '' : 'disabled'}>Supprimer</button></div>`;
}
function refreshDeckList() {
  const l = $('cardlist'), sb = $('selbar');
  if (l) l.innerHTML = cardList();
  if (sb) sb.innerHTML = selBarHTML();
  typeset();
}

/* ---------- étude : résumés ---------- */
const starsRow = n => `<div class="stars" role="img" aria-label="${n} étoile${n > 1 ? 's' : ''} sur 3">${[1, 2, 3].map(i => `<span class="star ${i <= n ? 'on' : ''}">★</span>`).join('')}</div>`;
function goalBlock() {
  const li = levelInfo(totalXp()), n = dayTotals(TODAY()).n, goal = cfg.goal || 20, sk = streakInfo();
  return `<div class="card"><div class="glvl" style="margin-top:0"><span class="lvlchip">Niv. ${li.level}</span><span class="mut">${esc(li.title)}</span><span class="sp"></span><span class="mut">${li.into} / ${li.need} XP</span></div>
    <div class="xpbar"><i style="width:${(li.pct * 100).toFixed(1)}%"></i></div>
    <div class="glvl"><span class="mut">Objectif du jour</span><span class="sp"></span><b>${Math.min(n, goal)} / ${goal}</b></div>
    <div class="xpbar"><i style="width:${Math.min(100, n / goal * 100).toFixed(1)}%"></i></div>
    <p class="mut" style="margin:12px 0 0">🔥 ${sk.cur} ${plural(sk.cur, 'jour', 'jours')} de suite</p></div>`;
}
const badgePills = list => list.length ? `<div class="card"><h2>Badges débloqués</h2>${list.map(b => `<span class="pill">${b.icon} ${esc(b.name)}</span>`).join('')}</div>` : '';
function summaryView(st) {
  const s = scopeStats(st.deckId, st.folderId), acc = st.na ? Math.round(st.nk / st.na * 100) : 0, done = st.mode === 'unknown' && !s.unknown;
  const title = done ? 'Bravo, plus rien à revoir' : 'Session terminée';
  const btns = `<div class="btns wrap">${s.unknown ? `<button type="button" class="btn ko grow" data-a="restudy" data-id="unknown">Revoir « je ne connais pas » (${s.unknown})</button>` : ''}${s.new ? `<button type="button" class="btn grow" data-a="restudy" data-id="new">Continuer le tri (${s.new})</button>` : ''}<button type="button" class="btn ${s.unknown || s.new ? '' : 'pri'} grow" data-a="studyback">Terminé</button></div>`;
  const nav = navbar({ title: 'Résumé', solid: true });
  if (!cfg.game) {
    return nav + `<h1 class="large center" style="margin-top:8px">${title} 🎉</h1><p class="subtitle center">${esc(scopeName(st))}</p>
      <div class="kpis"><div class="kpi"><b>${st.na}</b><span>${plural(st.na, 'carte révisée', 'cartes révisées')}</span></div><div class="kpi"><b>${acc} %</b><span>Précision (${st.nk}/${st.na})</span></div></div>${btns}`;
  }
  return nav + `<h1 class="large center" style="margin-top:8px">${title}</h1>${st.na ? starsRow(st.stars) : ''}
    <div class="kpis"><div class="kpi"><b>+${st.xp}</b><span>XP gagnés${st.bonus ? ` (dont ${st.bonus} de bonus)` : ''}</span></div>
      <div class="kpi"><b>${acc} %</b><span>Précision (${st.nk}/${st.na})</span></div>
      <div class="kpi"><b>×${st.bestCombo}</b><span>Meilleure série</span></div>
      <div class="kpi"><b>${st.round > 1 ? st.round : st.na}</b><span>${st.round > 1 ? 'tours' : plural(st.na, 'carte révisée', 'cartes révisées')}</span></div></div>
    ${badgePills(st.newBadges)}${goalBlock()}${btns}`;
}
function blitzView(st) {
  const quit = nbi('x', 'Quitter', 'data-a="studyback"');
  if (st.over) {
    const acc = st.na ? Math.round(st.nk / st.na * 100) : 0;
    return navbar({ title: 'Défi éclair', solid: true }) + `<h1 class="large center" style="margin-top:8px">Défi terminé</h1>
      <div class="card center"><div style="font-size:3.6rem;font-weight:700;line-height:1.1;letter-spacing:-.03em">${st.score}</div>
        <div class="mut">${plural(st.score, 'bonne réponse', 'bonnes réponses')} en 60 secondes</div>
        <p style="margin:10px 0 0;font-weight:600">${st.newRecord ? (st.prevBest ? '🏆 Nouveau record !' : '🏆 Premier record !') : st.prevBest ? `Record à battre : ${st.prevBest}` : ''}</p></div>
      <div class="kpis"><div class="kpi"><b>+${st.xp}</b><span>XP gagnés${st.bonus ? ` (dont ${st.bonus} de bonus)` : ''}</span></div><div class="kpi"><b>${acc} %</b><span>Précision (${st.nk}/${st.na})</span></div></div>
      ${badgePills(st.newBadges)}
      <div class="btns"><button type="button" class="btn pri grow" data-a="blitzagain">Rejouer</button><button type="button" class="btn grow" data-a="studyback">Terminé</button></div>`;
  }
  if (!st.ready) {
    const best = (db.game.records[scopeKey(st)] || {}).s;
    return navbar({ left: quit, title: 'Défi éclair', solid: true }) + `<div class="card center" style="margin-top:24px;padding:28px 20px"><div style="font-size:3rem;line-height:1.2">⚡</div><h2 style="font-size:24px;margin:4px 0 6px">60 secondes</h2>
        <p class="mut" style="margin:0 0 14px">Retourne la carte, puis dis si tu la connais. Fais un maximum de bonnes réponses.<br>Le défi ne modifie pas ton tri.</p>
        ${best ? `<p style="font-weight:600;margin:0 0 14px">🏆 Record : ${best}</p>` : ''}
        <button type="button" class="btn pri lg block" data-a="blitzgo">Go !</button></div>`;
  }
  const c = db.cards[st.queue[st.i]], left = Math.max(0, st.deadline - now());
  return navbar({ left: quit, title: `✓ ${st.score}`, right: `<span class="btime" id="btime">${Math.ceil(left / 1000)}</span>`, solid: true })
    + `<div class="tbar"><i id="bbar" style="width:${(left / 600).toFixed(1)}%"></i></div>
    <div class="fc math" role="button" tabindex="0" data-a="flip"><span class="lab">${st.flip ? 'Réponse' : 'Question'}</span><div class="fc-in">${fmt(st.flip ? c.a : c.q)}</div></div>
    ${st.flip ? `<div class="ans"><button type="button" class="btn ko lg" data-a="ans" data-id="unknown">Raté</button><button type="button" class="btn ok lg" data-a="ans" data-id="known">Connue</button></div>`
      : `<div class="ans"><button type="button" class="btn pri lg" data-a="flip">Retourner</button></div>`}`;
}

/* ---------- statistiques ---------- */
function recordsHTML() {
  const rows = Object.entries(db.game.records).map(([key, r]) => {
    let name = '';
    if (key === '*') name = 'Bibliothèque';
    else if (key.startsWith('f:')) { const f = db.folders[key.slice(2)]; if (f && !f.deleted) name = f.name; }
    else { const d = db.decks[key.slice(2)]; if (d && !d.deleted) name = d.name; }
    return name ? { name, s: r.s } : null;
  }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, 5);
  if (!rows.length) return '<p class="mut" style="margin:0">Aucun défi joué pour l\'instant. Lance un « Défi éclair » depuis Réviser.</p>';
  return rows.map(r => `<div class="row static" style="padding:10px 0;min-height:44px"><span class="rt"><b>${esc(r.name)}</b></span><b>${r.s}</b></div>`).join('');
}

/* ---------- les écrans ---------- */
const views = {
  home() {
    const first = !decks().length && !Object.keys(db.cards).length;
    return navbar({ left: '<button type="button" class="nb" id="relink" data-a="relogin" hidden>Reconnecter</button>', title: 'Bibliothèque', right: nbi('plus', 'Ajouter', 'data-a="addmenu"') })
      + `<h1 class="large">Bibliothèque</h1>`
      + (cfg.game && !first ? todayCard() : '')
      + (!cfg.signedIn && clientId() && !first ? `<div class="list" style="margin:0 0 14px">${navrow(tile('cloud', 'b'), 'Synchroniser avec Google', 'Retrouve tes paquets sur tous tes appareils', 'data-a="connect"')}</div>` : '')
      + (first ? onboarding() : searchBox('gsearch', 'Rechercher une carte', state.gsearch) + `<div id="gres">${homeBody()}</div>`);
  },
  folder() {
    const f = db.folders[state.folderId]; if (goneFolder(f)) return go('home'), '';
    const ds = decks().filter(d => d.folderId === f.id), s = sumStats(ds);
    return navbar({ left: back('Bibliothèque', 'home'), title: f.name, right: nbi('plus', 'Nouveau paquet dans ce classeur', 'data-a="newdeck"') + nbi('more', 'Options du classeur', `data-a="foldermenu" data-id="${f.id}"`) })
      + `<h1 class="large">${esc(f.name)}</h1><p class="subtitle">${ds.length} ${plural(ds.length, 'paquet', 'paquets')} · ${s.total} ${plural(s.total, 'carte', 'cartes')}</p>`
      + `<div class="btns"><button type="button" class="btn pri block" data-a="studymenu" data-id="f:${f.id}" ${s.total ? '' : 'disabled'}>${icon('play', 18)} Réviser le classeur</button></div>`
      + (ds.length ? `<div class="list">${ds.map(deckRow).join('')}</div>` : '<div class="empty"><div class="big">📂</div><p>Ce classeur est vide.<br>Touche + pour y créer un paquet.</p></div>');
  },
  deck() {
    const d = db.decks[state.deckId]; if (!d || d.deleted) return go('home'), '';
    const s = stats(d.id), f = folderOf(d), pct = s.total ? Math.round(s.known / s.total * 100) : 0;
    const F = state.filter, seg = [['all', 'Toutes'], ['unknown', 'À revoir'], ['new', 'Non triées'], ['known', 'Connues'], ['flag', icon('flag-f', 14)]];
    return navbar({ left: back(f ? f.name : 'Bibliothèque', 'deckback'), title: d.name,
        right: state.selMode ? nb('Terminé', 'Terminer la sélection', 'data-a="selcancel"', 'strong') : nbi('more', 'Options du paquet', 'data-a="deckmenu"') })
      + `<h1 class="large">${esc(d.name)}</h1><p class="subtitle" style="margin-bottom:${s.total ? 6 : 16}px">${s.total} ${plural(s.total, 'carte', 'cartes')}${s.total ? ` · ${pct} % maîtrisées` : ''}</p>`
      + (s.total ? `${progBar(s)}<div class="legend"><span><i class="dot known"></i>${s.known} ${plural(s.known, 'connue', 'connues')}</span><span><i class="dot unknown"></i>${s.unknown} à revoir</span><span><i class="dot"></i>${s.new} non ${plural(s.new, 'triée', 'triées')}</span></div>` : '')
      + `<div class="btns"><button type="button" class="btn pri grow" data-a="studymenu" data-id="d:${d.id}" ${s.total ? '' : 'disabled'}>${icon('play', 18)} Réviser</button><button type="button" class="btn" data-a="addcard">${icon('plus', 18)} Carte</button></div>`
      + searchBox('dsearch', 'Rechercher dans ce paquet', state.search)
      + `<div class="seg" role="group" aria-label="Filtrer les cartes">${seg.map(([k, l]) => `<button type="button" class="${F === k ? 'on' : ''}" data-a="setfilter" data-id="${k}" aria-pressed="${F === k}" ${k === 'flag' ? 'aria-label="Marquées"' : ''}>${l}</button>`).join('')}</div>`
      + `<div id="selbar">${selBarHTML()}</div><div id="cardlist">${cardList()}</div>`;
  },
  edit() {
    const c = state.editId ? db.cards[state.editId] : null, fresh = !c && state.editFrom !== 'study';
    return navbar({ solid: true, left: nb(fresh ? 'Terminer' : 'Annuler', '', 'data-a="canceledit"'), title: c ? 'Modifier la carte' : 'Nouvelle carte', right: nb(fresh ? 'Ajouter' : 'OK', '', 'data-a="savecard"', 'strong') })
      + `<div style="height:8px"></div>${fresh && state.addCount ? `<p class="subtitle center" style="margin-bottom:10px">${state.addCount} ${plural(state.addCount, 'carte ajoutée', 'cartes ajoutées')}</p>` : ''}`
      + toolbar()
      + `<div class="list"><div class="cell"><label for="eq">Question</label><textarea id="eq" placeholder="Texte, formules LaTeX…">${esc(c ? c.q : '')}</textarea></div>
          <div class="cell"><label for="ea">Réponse</label><textarea id="ea" placeholder="Texte, formules LaTeX…">${esc(c ? c.a : '')}</textarea></div></div>
        <div class="grp-h">Aperçu</div><div class="list"><div class="preview math" id="epv"></div></div>`
      + (c ? `<div class="grp-h"></div><div class="list"><button type="button" class="row ic tintx" data-a="flagedit">${tile(c.flag ? 'flag-f' : 'flag', 'r')}<span class="rt"><b>${c.flag ? 'Retirer la marque' : 'Marquer cette carte'}</b></span></button><button type="button" class="row ic danger" data-a="delcard">${tile('trash', 'r')}<span class="rt"><b>Supprimer la carte</b></span></button></div>` : '');
  },
  study() {
    const st = state.study;
    if (st.mode === 'blitz') return blitzView(st);
    if (st.i >= st.queue.length) return summaryView(st);
    const c = db.cards[st.queue[st.i]], li = cfg.game ? levelInfo(totalXp()) : null;
    return navbar({ solid: true, left: nbi('x', 'Quitter', 'data-a="studyback"'), title: `${scopeName(st)} · ${st.i + 1}/${st.queue.length}${st.round > 1 ? ` · tour ${st.round}` : ''}`,
        right: nbi('plus', 'Ajouter une carte', 'data-a="quickadd"') + nbi('more', 'Plus d\'options', 'data-a="studymore"') })
      + `<div class="sprog"><i style="width:${st.i / st.queue.length * 100}%"></i></div>`
      + (li ? `<div class="hud"><span class="lvlchip">Niv. ${li.level}</span><div class="xpbar"><i style="width:${(li.pct * 100).toFixed(1)}%"></i></div><span class="combo ${st.combo >= 2 ? 'on' : ''}" id="combo" aria-label="Série de bonnes réponses">🔥 ×${st.combo}</span></div>` : '')
      + `<div class="fc math" role="button" tabindex="0" data-a="flip"><span class="lab">${st.flip ? 'Réponse' : 'Question'}</span>${c.flag ? `<span class="flagmark" title="Marquée">${icon('flag-f', 20)}</span>` : ''}<div class="fc-in">${fmt(st.flip ? c.a : c.q)}</div></div>`
      + (st.flip ? `<div class="ans"><button type="button" class="btn ko lg" data-a="ans" data-id="unknown">Je ne connais pas</button><button type="button" class="btn ok lg" data-a="ans" data-id="known">Je connais</button></div>`
        : `<div class="ans"><button type="button" class="btn pri lg" data-a="flip">Retourner</button></div>`);
  },
  import() {
    const i = state.imp, tab = (k, l) => `<button type="button" class="${i.tab === k ? 'on' : ''}" data-a="imptab" data-id="${k}">${l}</button>`;
    const target = `<div class="list" style="margin-bottom:14px"><div class="row static"><span class="rt"><b>Paquet</b></span><select id="impdeck" data-f="deckId" aria-label="Paquet de destination">${opt('', 'Nouveau paquet…', i.deckId)}${decks().map(d => opt(d.id, esc(d.name), i.deckId)).join('')}</select></div>
      ${i.deckId ? '' : `<div class="cell"><label for="impname">Nom du nouveau paquet</label><input type="text" id="impname" data-f="newName" value="${esc(i.newName)}" placeholder="Ex : Chimie organique"></div>`}</div>`;
    const sel = (id, f, opts, cur, lab) => `<div class="row static"><span class="rt"><b>${lab}</b></span><select id="${id}" data-f="${f}" aria-label="${esc(lab)}">${opts.map(o => opt(o[0], o[1], cur)).join('')}</select></div>`;
    const csv = `<div class="list"><div class="cell"><label for="csvfile">Fichier CSV — colonne 1 : question, colonne 2 : réponse</label><input type="file" id="csvfile" accept=".csv,.txt,.tsv"></div>
      ${sel('impdelim', 'delim', [['auto', 'Automatique'], [';', 'Point-virgule ;'], [',', 'Virgule ,'], ['\t', 'Tabulation']], i.delim, 'Séparateur')}
      <label class="row static"><span class="rt"><b>1ʳᵉ ligne = en-têtes</b></span><input type="checkbox" class="sw" data-f="header" ${i.header ? 'checked' : ''}></label></div>`;
    const paste = `${toolbar()}<div class="list" style="margin-bottom:14px"><div class="cell"><label for="ptext">Colle ton texte</label><textarea id="ptext" data-f="text" style="min-height:130px">${esc(i.text)}</textarea></div></div>
      <div class="list">${sel('impcs', 'cardSep', [['nl', 'Nouvelle ligne'], ['blank', 'Ligne vide'], ['custom', 'Personnalisé…']], i.cardSep, 'Entre deux cartes')}
      ${i.cardSep === 'custom' ? `<div class="cell"><input type="text" aria-label="Séparateur de cartes" data-f="customCard" value="${esc(i.customCard)}" placeholder="Ex : ;;   (\\n = retour à la ligne)"></div>` : ''}
      ${sel('impfs', 'fieldSep', [['tab', 'Tabulation'], [';', 'Point-virgule ;'], [',', 'Virgule ,'], [' - ', 'Tiret « - »'], [' : ', 'Deux-points « : »'], ['|', 'Barre |'], ['=', 'Égal ='], ['custom', 'Personnalisé…']], i.fieldSep, 'Question / réponse')}
      ${i.fieldSep === 'custom' ? `<div class="cell"><input type="text" aria-label="Séparateur question/réponse" data-f="customField" value="${esc(i.customField)}" placeholder="Ex : ->   ou   ???"></div>` : ''}
      ${sel('impwhich', 'which', [['first', 'Au premier'], ['last', 'Au dernier']], i.which, 'Si le séparateur se répète')}</div>`;
    const manual = `${i.addCount ? `<p class="subtitle center" style="margin-bottom:10px">${i.addCount} ${plural(i.addCount, 'carte ajoutée', 'cartes ajoutées')}</p>` : ''}${toolbar()}
      <div class="list"><div class="cell"><label for="mq">Question</label><textarea id="mq" placeholder="Texte, formules LaTeX…"></textarea></div><div class="cell"><label for="ma">Réponse</label><textarea id="ma" placeholder="Texte, formules LaTeX…"></textarea></div></div>
      <div class="grp-h">Aperçu</div><div class="list"><div class="preview math" id="mpv"></div></div>
      <div class="btns" style="margin-top:16px"><button type="button" class="btn pri block" data-a="addmanual">${icon('plus', 18)} Ajouter cette carte</button></div>`;
    return navbar({ solid: true, left: nb('Retour', '', `data-a="${state.impFrom === 'deck' ? 'opendeck' : 'home'}"`), title: 'Importer des cartes' })
      + `<div style="height:8px"></div><div class="seg" role="group" aria-label="Méthode d'import">${tab('csv', 'Fichier CSV')}${tab('paste', 'Coller')}${tab('manual', 'Une par une')}</div>`
      + target + (i.tab === 'csv' ? csv : i.tab === 'paste' ? paste : manual)
      + (i.tab !== 'manual' ? `<div class="grp-h">Aperçu · <span id="impcount"></span></div><div class="list"><div class="preview math" id="imppv" style="font-size:15px"></div></div>
        <div class="btns" style="margin-top:16px"><button type="button" class="btn pri block" data-a="doimport">Importer</button></div>` : '');
  },
  stats() {
    const t = gameTotals(), li = levelInfo(t.xp), sk = streakInfo(), days = lastDays(14), max = Math.max(5, ...days.map(d => d.n));
    const s = sumStats(decks()), acc = t.n ? Math.round(t.k / t.n * 100) : 0, g = cfg.game, wk = days.slice(-7).reduce((a, d) => a + d.n, 0);
    return navbar({ title: g ? 'Profil' : 'Progrès' }) + `<h1 class="large">${g ? 'Profil' : 'Progrès'}</h1>`
      + (g ? `<div class="card"><div class="glvl" style="margin-top:0"><span class="lvlchip">Niv. ${li.level}</span><b>${esc(li.title)}</b><span class="sp"></span><span class="mut">${t.xp} XP</span></div>
        <div class="xpbar"><i style="width:${(li.pct * 100).toFixed(1)}%"></i></div><p class="mut" style="margin:8px 0 0;font-size:14px">${li.need - li.into} XP avant le niveau ${li.level + 1}</p></div>` : '')
      + `<div class="kpis"><div class="kpi"><b>${t.n}</b><span>Cartes révisées</span></div><div class="kpi"><b>${acc} %</b><span>Précision</span></div>
        <div class="kpi"><b>🔥 ${sk.cur}</b><span>Jours de suite (record ${sk.best})</span></div><div class="kpi"><b>${wk}</b><span>Révisions sur 7 jours</span></div></div>`
      + `<div class="card"><h2>14 derniers jours</h2><div class="chart" role="img" aria-label="Cartes révisées par jour sur 14 jours">${days.map(d => `<div class="cbar" title="${esc(d.label)} : ${d.n}"><div class="cb-track"><i class="${d.today ? 'today' : d.n ? 'on' : ''}" style="height:${d.n ? Math.max(6, d.n / max * 100) : 2}%"></i></div><span>${d.dow}</span></div>`).join('')}</div></div>`
      + `<div class="card"><h2>Ma bibliothèque</h2>${progBar(s)}<div class="legend" style="margin:0"><span><i class="dot known"></i>${s.known} connues</span><span><i class="dot unknown"></i>${s.unknown} à revoir</span><span><i class="dot"></i>${s.new} non triées</span></div>
        <p class="mut" style="margin:10px 0 0;font-size:14px">${s.total ? Math.round(s.known / s.total * 100) : 0} % maîtrisé · ${s.total} ${plural(s.total, 'carte', 'cartes')} · ${decks().length} ${plural(decks().length, 'paquet', 'paquets')}</p></div>`
      + (g ? `<div class="card"><h2>Badges · ${Object.keys(db.game.badges).filter(id => BADGES.some(b => b.id === id)).length} / ${BADGES.length}</h2><div class="badges">${BADGES.map(b => { const on = !!db.game.badges[b.id]; return `<div class="badge ${on ? 'on' : ''}"><span class="bi" aria-hidden="true">${on ? b.icon : '🔒'}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`; }).join('')}</div></div>
        <div class="card"><h2>Records du défi éclair</h2>${recordsHTML()}</div>`
        : `<div class="card"><h2>Envie de t'amuser en révisant ?</h2><p class="mut" style="margin:0 0 12px">Le mode jeu ajoute des XP, des niveaux, des séries de jours, un objectif quotidien, des badges et un défi chronométré. Tu peux le désactiver à tout moment.</p><button type="button" class="btn pri" data-a="gameon">Activer le mode jeu</button></div>`);
  },
  settings() {
    const g = !!cfg.game, bad = cfg.signedIn && state.needLogin, need = !clientId();
    const sel = (key, opts, cur, lab) => `<select data-s="${key}" aria-label="${lab}">${opts.map(o => opt(o[0], o[1], cur)).join('')}</select>`;
    return navbar({ title: 'Réglages' }) + `<h1 class="large">Réglages</h1>`
      + `<div class="grp-h">Jeu</div><div class="list">${setrow(tile('star', 'o'), 'Mode jeu', 'XP, niveaux, séries, badges et défi éclair', switchCtl('game', g))}
        ${g ? setrow(tile('check', 'g'), 'Objectif du jour', '', sel('goal', [10, 20, 30, 50, 100].map(n => [n, n + ' cartes']), cfg.goal || 20, 'Objectif quotidien')) : ''}
        ${g ? setrow(tile('bolt', 'y'), 'Sons et vibrations', '', switchCtl('sound', !!cfg.sound)) : ''}</div>`
      + `<div class="grp-h">Étude</div><div class="list">${setrow(tile('shuffle', 'b'), 'Mélanger les cartes', 'Ordre aléatoire à chaque session', switchCtl('shuffle', cfg.shuffle !== false))}
        ${setrow(tile('flag', 'r'), 'Marquer mes erreurs', 'Une carte « je ne connais pas » reçoit un drapeau', switchCtl('autoFlag', cfg.autoFlag !== false))}</div>`
      + `<div class="grp-h">Apparence</div><div class="list">${setrow(tile('sun', 'p'), 'Thème', '', sel('theme', [['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']], cfg.theme, 'Thème'))}
        ${setrow(tile('highlighter', 'g'), 'Couleur d\'accent', '', sel('accent', Object.entries(ACCENT_NAMES), cfg.accent || 'green', 'Couleur d\'accent'))}</div>`
      + `<div class="grp-h">Synchronisation</div><div class="list">${cfg.signedIn
          ? `<div class="row ic static">${tile('cloud', bad ? 'r' : 'b')}<span class="rt"><b>Google Drive</b><small>${bad ? 'Reconnexion nécessaire' : 'Connecté'}${cfg.email ? ' · ' + esc(cfg.email) : ''}</small></span>${bad ? '<button type="button" class="btn pri sm" data-a="relogin">Reconnecter</button>' : '<button type="button" class="btn sm" data-a="sync">Synchroniser</button>'}</div>
             <button type="button" class="row ic danger" data-a="unlink">${tile('x', 'r')}<span class="rt"><b>Se déconnecter</b></span></button>`
          : navrow(tile('cloud', 'b'), 'Se connecter avec Google', 'Ta bibliothèque est stockée dans un dossier caché de ton Google Drive', 'data-a="connect"')}</div>
        <p class="grp-f" id="syncmsg">${esc(state.msg || (cfg.last ? 'Dernière synchronisation : ' + new Date(cfg.last).toLocaleString('fr-FR') : ''))}</p>
        <details class="list" style="margin-top:12px" ${need ? 'open' : ''}><summary>Configuration Google et connexion durable</summary><div class="dbody">
          <p style="margin-top:0"><b style="color:var(--fg)">Pour ne jamais être déconnecté :</b> console Google Cloud → <i>Google Auth Platform</i> → <i>Audience</i> → <b>Publier l'application</b>. En mode « Test », Google coupe l'accès toutes les semaines.</p>
          <ol><li>console.cloud.google.com → crée un projet.</li><li>« API et services » → active <b>Google Drive API</b>.</li><li>« Écran de consentement OAuth » → Externe → ajoute ton Gmail comme utilisateur test.</li>
          <li>« Identifiants » → ID client OAuth → <b>Application Web</b> ; origine JavaScript autorisée : <code>${esc(location.origin)}</code>.</li><li>Colle l'ID client ci-dessous (ou dans <code>GOOGLE_CLIENT_ID</code> de <code>js/sync.js</code>).</li></ol>
          <label class="fl" for="cid">ID client Google</label><input type="text" id="cid" value="${esc(clientId())}" placeholder="123-abc.apps.googleusercontent.com"></div></details>`
      + `<div class="grp-h">Données</div><div class="list">${navrow(tile('upload', 'gr'), 'Exporter une sauvegarde', 'Fichier JSON de toute ta bibliothèque', 'data-a="export"')}
        <label class="row ic">${tile('download', 'gr')}<span class="rt"><b>Importer une sauvegarde</b><small>Fusionne un fichier JSON avec ta bibliothèque</small></span><span class="trail">${icon('chev-r', 18)}</span><input type="file" id="jsonfile" accept=".json" hidden></label>
        <button type="button" class="row ic danger" data-a="resetgame">${tile('undo', 'r')}<span class="rt"><b>Réinitialiser la progression du jeu</b><small>XP, badges, séries et records — tes cartes sont conservées</small></span></button></div>`
      + `<div class="grp-h">À propos</div><div class="list"><div class="row static" style="display:block;padding:14px 16px"><b>Flashcards</b> <span class="mut">version ${APP_VERSION}</span>
        <p class="mut" style="margin:6px 0 0;font-size:14px">Fonctionne hors ligne. Formules : KaTeX (MIT) · Police : Inter (OFL) · Icônes : Feather (MIT).</p>
        <p class="mut" style="margin:10px 0 0;font-size:14px"><kbd>Espace</kbd> retourner · <kbd>←</kbd> je ne connais pas · <kbd>→</kbd> je connais · <kbd>F</kbd> marquer · <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>U</kbd> gras / souligné</p></div></div>`;
  },
};
function render() {
  hidePill();
  $app.innerHTML = views[state.view]();
  renderTabbar(); setupNav();
  if (state.view === 'import') { if (state.imp.tab === 'manual') updateManualPv(); else updatePreview(); }
  if (state.view === 'edit') { updateEditPv(); state.lastField = 'eq'; const el = $('eq'); if (el && !state.editId) el.focus(); }
  typeset();
}
