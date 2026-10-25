'use strict';
/* Actions (boutons), événements globaux et démarrage */

const openDeck = (id, search = '') => go('deck', { deckId: id, filter: 'all', search, limit: 200 });

const A = {
  /* navigation */
  home: () => go('home', { gsearch: '' }), settings: () => go('settings'), stats: () => go('stats'),
  closesheet: () => closeSheet(),
  dlgok: () => endDialog($('dlgin') ? $('dlgin').value : true),
  dlgno: () => endDialog(null),
  toastact: (id, t) => toastAct(id, t),
  open: id => openDeck(id),
  gopen(id) { const c = db.cards[id]; openDeck(c.deckId, state.gsearch.trim()); },
  opendeck: () => go('deck'),
  studyback() { const st = state.study; go(st && st.folderId ? 'home' : 'deck'); },
  more() { state.limit += 200; refreshDeckList(); },

  /* menus */
  addmenu() {
    showSheet('Ajouter', srow('🗂️ Nouveau paquet', '', 'data-a="newdeck"') + srow('📁 Nouveau classeur', '', 'data-a="newfolder"') + srow('⬇️ Importer des cartes', '', 'data-a="importhome"'));
  },
  studymenu(id) {
    const folder = id.startsWith('f:'), ref = id.slice(2);
    const s = folder ? sumStats(decks().filter(d => d.folderId === ref)) : stats(ref);
    const nm = folder ? (db.folders[ref] || {}).name : (db.decks[ref] || {}).name;
    const at = mode => `data-a="run" data-mode="${mode}" data-scope="${id}"`;
    let rows = '';
    if (s.new) rows += srow('▶ Continuer le tri', s.new, at('new'));
    if (s.unknown) rows += srow('🔁 Revoir « je ne connais pas » en boucle', s.unknown, at('unknown'));
    if (s.flag) rows += srow('🚩 Cartes marquées', s.flag, at('flag'));
    rows += srow('📚 Tout réviser', s.total, at('all'));
    if (cfg.game) rows += srow('⚡ Défi éclair · 60 s', '', at('blitz'));
    rows += '<div class="sdiv"></div>'
      + `<label class="srow static" style="margin:0"><span>🔀 Mélanger</span>${switchCtl('shuffle', cfg.shuffle !== false)}</label>`
      + `<label class="srow static" style="margin:0"><span>🎮 Mode jeu</span>${switchCtl('game', !!cfg.game)}</label>`;
    showSheet('Réviser · ' + (nm || ''), rows, id);
  },
  deckmenu() {
    const d = db.decks[state.deckId];
    showSheet(d.name,
      srow('✏️ Renommer', '', 'data-a="rename"') +
      srow('⬇️ Importer dans ce paquet', '', `data-a="import" data-id="${d.id}"`) +
      srow('☑ Sélectionner des cartes', '', 'data-a="selmode"') +
      `<div class="srow static"><span>📁 Classeur</span><select data-f="deckFolder" aria-label="Classeur">${opt('', 'Aucun', d.folderId || '')}${folders().map(f => opt(f.id, esc(f.name), d.folderId || '')).join('')}</select></div>` +
      srow('↺ Réinitialiser le tri', '', 'data-a="reset"') +
      srow('🗑 Supprimer le paquet', '', 'data-a="deldeck"', 'danger'));
  },
  foldermenu(id) {
    const f = db.folders[id];
    showSheet('📁 ' + f.name, srow('✏️ Renommer', '', `data-a="renamefolder" data-id="${id}"`) + srow('🗑 Supprimer le classeur', '', `data-a="delfolder" data-id="${id}"`, 'danger'));
  },
  latexmenu() {
    showSheet('Formules LaTeX', `<div class="sgrid">${LATEX_SNIPPETS.map(x => `<button type="button" data-a="latex" data-id="${x[0]}">${x[1]}</button>`).join('')}</div>`);
  },

  /* paquets & classeurs */
  async newdeck() {
    const n = await askText('Nouveau paquet', '', 'Nom du paquet'); if (!n) return;
    const id = uid(); db.decks[id] = { id, name: n, folderId: null, updatedAt: now() }; save(); openDeck(id);
  },
  async rename() {
    const d = db.decks[state.deckId], n = await askText('Renommer le paquet', d.name); if (!n) return;
    d.name = n; touch(d); save(); render();
  },
  async deldeck() {
    const d = db.decks[state.deckId], cs = cardsOf(d.id);
    const m1 = !cs.length ? `« ${d.name} » sera supprimé.` : cs.length === 1 ? `« ${d.name} » et sa carte seront supprimés.` : `« ${d.name} » et ses ${cs.length} cartes seront supprimés.`;
    if (!await confirmDlg({ title: 'Supprimer ce paquet ?', msg: m1, ok: 'Supprimer', danger: true })) return;
    const items = [d, ...cs]; softDelete(items); save(); go('home');
    toast('Paquet supprimé', { action: ['Annuler', () => { restore(items); save(); render(); }] });
  },
  async newfolder() {
    const n = await askText('Nouveau classeur', '', 'Nom du classeur'); if (!n) return;
    const id = uid(); db.folders[id] = { id, name: n, updatedAt: now() }; save(); render();
  },
  async renamefolder(id) {
    const f = db.folders[id], n = await askText('Renommer le classeur', f.name); if (!n) return;
    f.name = n; touch(f); save(); render();
  },
  async delfolder(id) {
    const f = db.folders[id], inside = decks().filter(d => d.folderId === id);
    const m2 = !inside.length ? 'Ce classeur est vide.' : inside.length === 1 ? `Le paquet qu'il contient n'est pas supprimé : il sort simplement du classeur.` : `Les ${inside.length} paquets qu'il contient ne sont pas supprimés : ils sortent simplement du classeur.`;
    if (!await confirmDlg({ title: 'Supprimer ce classeur ?', msg: m2, ok: 'Supprimer', danger: true })) return;
    softDelete([f]); inside.forEach(d => { d.folderId = null; touch(d); }); save(); render();
    toast('Classeur supprimé', { action: ['Annuler', () => { restore([f]); inside.forEach(d => { d.folderId = id; touch(d); }); save(); render(); }] });
  },
  togglefolder(id) { if (state.closedFolders.has(id)) state.closedFolders.delete(id); else state.closedFolders.add(id); render(); },
  async reset() {
    const cs = cardsOf(state.deckId);
    if (!await confirmDlg({ title: 'Réinitialiser le tri ?', msg: 'Toutes les cartes de ce paquet repasseront en « non triées ». Les marques 🚩 sont conservées.', ok: 'Réinitialiser', danger: true })) return;
    const prev = cs.map(c => [c, c.status]); cs.forEach(c => { c.status = 'new'; touch(c); }); save(); render();
    toast('Tri réinitialisé', { action: ['Annuler', () => { prev.forEach(([c, s]) => { c.status = s; touch(c); }); save(); render(); }] });
  },
  sample() { const id = createSample(); toast('Paquet d\'exemple créé 🎉'); openDeck(id); },

  /* sélection multiple */
  rowtap(id) {
    if (!state.selMode) return go('edit', { editId: id, editFrom: null });
    if (state.sel.has(id)) state.sel.delete(id); else state.sel.add(id);
    refreshDeckList();
  },
  selmode() { state.selMode = !state.selMode; state.sel = new Set(); refreshDeckList(); },
  selcancel() { state.selMode = false; state.sel = new Set(); refreshDeckList(); },
  selall() {
    const ids = visibleCards().map(c => c.id);
    state.sel = ids.every(i => state.sel.has(i)) ? new Set() : new Set(ids);
    refreshDeckList();
  },
  async seldel() {
    const ids = [...state.sel]; if (!ids.length) return;
    if (!await confirmDlg({ title: `Supprimer ${ids.length} ${plural(ids.length, 'carte', 'cartes')} ?`, ok: 'Supprimer', danger: true })) return;
    const items = ids.map(i => db.cards[i]).filter(Boolean); softDelete(items); save();
    state.selMode = false; state.sel = new Set(); render();
    toast(`${items.length} ${plural(items.length, 'carte supprimée', 'cartes supprimées')}`, { action: ['Annuler', () => { restore(items); save(); render(); }] });
  },

  /* étude */
  run(_, t) {
    const sc = t.dataset.scope || '', mode = t.dataset.mode, kind = sc[0], ref = sc.slice(2);
    const deckId = kind === 'd' ? ref : null, folderId = kind === 'f' ? ref : null;
    if (mode === 'daily') return startDaily();
    if (mode === 'blitz') return startBlitz(deckId, folderId);
    startStudy(mode, deckId, folderId);
  },
  restudy(mode) { const st = state.study; startStudy(mode, st.deckId, st.folderId); },
  blitzgo: () => blitzGo(),
  blitzagain() { const st = state.study; startBlitz(st.deckId, st.folderId); },
  flip() { const st = state.study; if (st.mode === 'blitz' && !st.ready) return; st.flip = !st.flip; render(); },
  ans: id => answer(id),
  back() { const st = state.study; if (st.i > 0) { st.i--; st.flip = false; render(); } },
  flagstudy() { const st = state.study, c = db.cards[st.queue[st.i]]; c.flag = !c.flag; touch(c); save(); render(); },
  editstudy() { const st = state.study; go('edit', { editId: st.queue[st.i], editFrom: 'study' }); },
  gameon() { cfg.game = true; saveCfg(); render(); toast('🎮 Mode jeu activé : gagne des XP en révisant !'); },

  /* édition */
  addcard: () => go('edit', { editId: null, editFrom: null, addCount: 0 }),
  async canceledit() {
    const q = $('eq'), a = $('ea');
    if (q && a) {
      const c = state.editId ? db.cards[state.editId] : null;
      const dirty = c ? (q.value.trim() !== c.q || a.value.trim() !== c.a) : !!(q.value.trim() || a.value.trim());
      if (dirty && !await confirmDlg({ title: 'Quitter sans enregistrer ?', msg: 'Tes modifications seront perdues.', ok: 'Quitter', danger: true })) return;
    }
    go(state.editFrom === 'study' ? 'study' : 'deck');
  },
  flagedit(_, t) { const c = db.cards[state.editId]; c.flag = !c.flag; touch(c); save(); t.textContent = c.flag ? '🚩' : '⚐'; },
  latex: id => insertSnippet(id),
  savecard() {
    const q = $('eq').value.trim(), a = $('ea').value.trim();
    if (!q || !a) return toast('Question et réponse requises.', { kind: 'err' });
    if (state.editId) {
      const c = db.cards[state.editId]; c.q = q; c.a = a; touch(c); save();
      go(state.editFrom === 'study' ? 'study' : 'deck');
    } else {
      addCard(state.deckId, q, a); save();
      state.addCount++; render();
    }
  },
  delcard() {
    const c = db.cards[state.editId]; softDelete([c]); save();
    if (state.editFrom === 'study') { const st = state.study; st.queue.splice(st.i, 1); st.flip = false; if (st.i >= st.queue.length && st.mode !== 'blitz') finalizeSession(st); go('study'); }
    else go('deck');
    toast('Carte supprimée', { action: ['Annuler', () => { restore([c]); save(); if (state.view === 'deck') render(); }] });
  },

  /* import */
  import(id) { Object.assign(state.imp, { deckId: id || '', text: '', addCount: 0 }); state.impFrom = 'deck'; go('import'); },
  importhome() { Object.assign(state.imp, { deckId: '', text: '', addCount: 0 }); state.impFrom = 'home'; go('import'); },
  imptab(id) { state.imp.tab = id; state.imp.text = ''; if (id === 'manual') state.lastField = 'mq'; if (id === 'paste') state.lastField = 'ptext'; render(); },
  addmanual() {
    const i = state.imp, q = $('mq').value.trim(), a = $('ma').value.trim();
    if (!q || !a) return toast('Question et réponse requises.', { kind: 'err' });
    let deckId = i.deckId;
    if (!deckId) {
      const n = i.newName.trim(); if (!n) return toast('Donne un nom au nouveau paquet.', { kind: 'err' });
      deckId = uid(); db.decks[deckId] = { id: deckId, name: n, folderId: null, updatedAt: now() };
      i.deckId = deckId;
    }
    addCard(deckId, q, a); save();
    i.addCount = (i.addCount || 0) + 1;
    render();
  },
  doimport() {
    const i = state.imp, rows = getRows();
    if (!rows.length) return toast('Aucune carte à importer.', { kind: 'err' });
    let deckId = i.deckId;
    if (!deckId) {
      const n = i.newName.trim(); if (!n) return toast('Donne un nom au nouveau paquet.', { kind: 'err' });
      deckId = uid(); db.decks[deckId] = { id: deckId, name: n, folderId: null, updatedAt: now() };
    }
    rows.forEach(r => addCard(deckId, r[0], r[1]));
    save(); openDeck(deckId);
    toast(`${rows.length} ${plural(rows.length, 'carte importée', 'cartes importées')}`);
  },

  /* compte & données */
  async connect() {
    const c = $('cid'); if (c) { cfg.clientId = c.value.trim(); saveCfg(); }
    try { await getToken('select_account'); cfg.signedIn = true; saveCfg(); startAutoSyncLoop(); await doSync(false); if (state.view === 'settings' || state.view === 'home') render(); }
    catch (e) { setMsg('⚠️ ' + e.message); toast('Connexion impossible : ' + e.message, { kind: 'err' }); }
  },
  async relogin() {
    try { await getToken(''); state.needLogin = false; updateCloud(); await doSync(false); if (state.view === 'settings') render(); }
    catch (e) { setMsg('⚠️ ' + e.message); toast('Reconnexion impossible : ' + e.message, { kind: 'err' }); }
  },
  sync: () => doSync(false, ''),
  unlink() { cfg.signedIn = false; cfg.last = ''; cfg.email = ''; forgetTok(); state.needLogin = false; clearInterval(syncInterval); saveCfg(); state.msg = 'Déconnecté.'; render(); },
  export() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db)], { type: 'application/json' }));
    a.download = 'flashcards-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  async resetgame() {
    if (!await confirmDlg({ title: 'Réinitialiser la progression du jeu ?', msg: 'XP, niveau, badges, séries et records seront remis à zéro (sur tous tes appareils synchronisés). Tes cartes ne sont pas touchées.', ok: 'Réinitialiser', danger: true })) return;
    resetGame(); toast('Progression du jeu réinitialisée'); render();
  },
};

/* ---------- réglages ---------- */
function onSetting(t) {
  const k = t.dataset.s, v = t.type === 'checkbox' ? t.checked : k === 'goal' ? Number(t.value) : t.value;
  cfg[k] = v; saveCfg();
  if (k === 'theme') applyTheme();
  if (k === 'sound' && v) sfx.ok();
  if (k === 'game') {
    if (v) toast('🎮 Mode jeu activé : gagne des XP en révisant !');
    const ctx = $sheet.dataset.ctx; render(); if (ctx) A.studymenu(ctx);
  }
}

/* ---------- événements ---------- */
let lastErr = 0;
function reportError(err) {
  console.error(err);
  if (now() - lastErr < 8000) return; lastErr = now();
  toast('Une erreur est survenue. Tes données sont conservées.', { kind: 'err' });
}
addEventListener('error', e => { if (e.filename && !e.filename.startsWith(location.origin)) return; reportError(e.error || e.message); });
addEventListener('unhandledrejection', e => { if (String(e.reason && e.reason.stack).includes(location.origin)) reportError(e.reason); });

document.addEventListener('click', e => {
  const t = e.target.closest('[data-a]'); if (!t || t.tagName === 'INPUT') return;
  const f = A[t.dataset.a]; if (!f) return;
  if (t.dataset.a !== 'closesheet' && t.closest('#sheet')) closeSheet();
  const r = f(t.dataset.id, t);
  if (r && r.catch) r.catch(reportError);
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.s) return onSetting(t);
  if (t.dataset.f === 'deckFolder') { const d = db.decks[state.deckId]; d.folderId = t.value || null; touch(d); save(); closeSheet(); render(); return; }
  if (t.dataset.f === 'filter') { state.filter = t.value; state.limit = 200; refreshDeckList(); return; }
  if (t.id === 'csvfile' && t.files[0]) { state.imp.text = await readFile(t.files[0]); updatePreview(); return; }
  if (t.id === 'jsonfile' && t.files[0]) {
    try { db = normDb(merge(db, JSON.parse(await readFile(t.files[0])))); save(); toast('Sauvegarde importée et fusionnée.'); go('home'); }
    catch (err) { toast('Fichier invalide.', { kind: 'err' }); }
    return;
  }
  if (t.dataset.f) {
    const f = t.dataset.f; state.imp[f] = t.type === 'checkbox' ? t.checked : t.value;
    if (t.tagName === 'SELECT' && ['deckId', 'cardSep', 'fieldSep'].includes(f)) render(); else updatePreview();
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'dsearch') { state.search = t.value; state.limit = 200; refreshDeckList(); return; }
  if (t.id === 'gsearch') { state.gsearch = t.value; const g = $('gres'); if (g) { g.innerHTML = homeBody(); typeset(); } return; }
  if (t.dataset.f) { state.imp[t.dataset.f] = t.value; updatePreview(); }
  if (t.id === 'eq' || t.id === 'ea') updateEditPv();
  if (t.id === 'mq' || t.id === 'ma') updateManualPv();
});
document.addEventListener('focus', e => { if (FIELD_IDS.includes(e.target.id)) state.lastField = e.target.id; }, true);
document.addEventListener('keydown', e => {
  if ($dlg.classList.contains('open')) {
    if (e.key === 'Escape') { e.preventDefault(); endDialog(null); }
    else if (e.key === 'Enter' && e.target.id === 'dlgin') { e.preventDefault(); A.dlgok(); }
    return;
  }
  if (e.key === 'Escape' && $sheet.innerHTML) { closeSheet(); return; }
  if ((e.ctrlKey || e.metaKey) && FIELD_IDS.includes(e.target.id) && (e.key === 'b' || e.key === 'u')) { e.preventDefault(); state.lastField = e.target.id; insertSnippet(e.key === 'b' ? 'bold' : 'under'); return; }
  const el = e.target;
  // éléments cliquables non-boutons (cartes, paquets) : Entrée / Espace comme un bouton
  if ((e.key === 'Enter' || e.key === ' ') && el.matches && el.matches('[role=button][data-a]') && state.view !== 'study') { e.preventDefault(); el.click(); return; }
  if (state.view !== 'study' || $sheet.innerHTML || /INPUT|TEXTAREA|SELECT|BUTTON/.test(el.tagName)) return;
  const st = state.study;
  if (st.mode === 'blitz' && !st.ready) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); blitzGo(); } return; }
  if (st.over || st.i >= st.queue.length) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); A.flip(); }
  else if (e.key === 'ArrowRight' && st.flip) answer('known');
  else if (e.key === 'ArrowLeft' && st.flip) answer('unknown');
  else if ((e.key === 'f' || e.key === 'F') && st.mode !== 'blitz') A.flagstudy();
});

/* ---------- démarrage ---------- */
applyTheme(); updateOnline();
render();
// raccourcis de l'icône d'application (./?a=today , ./?a=search)
(function launch() {
  const a = new URLSearchParams(location.search).get('a'); if (!a) return;
  history.replaceState(null, '', location.pathname);
  if (a === 'today') startDaily(); else if (a === 'search') { const g = $('gsearch'); if (g) g.focus(); }
})();
if (cfg.signedIn) { loadGis().catch(() => {}); doSync(true); startAutoSyncLoop(); }

// mise à jour de l'application : on propose, sans interrompre ce que tu fais
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = w => toast('Nouvelle version disponible', { ms: 600000, action: ['Actualiser', () => w.postMessage('SKIP_WAITING')] });
    if (reg.waiting && hadController) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}
