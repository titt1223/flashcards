'use strict';
/* Actions (boutons), événements globaux et démarrage */

const openDeck = (id, search = '') => go('deck', { deckId: id, filter: 'all', search, limit: 200 });
const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'paquet';

const A = {
  /* navigation */
  tab(id) {
    if (id === 'home' && state.view === 'home') { window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); return; }
    go(id);
  },
  home: () => go('home'), settings: () => go('settings'), stats: () => go('stats'),
  closesheet: () => closeSheet(),
  dlgok: () => endDialog($('dlgin') ? $('dlgin').value : true),
  dlgno: () => endDialog(null),
  toastact: (id, t) => toastAct(id, t),
  open: id => openDeck(id),
  openfolder: id => go('folder', { folderId: id }),
  gopen(id) { const c = db.cards[id]; openDeck(c.deckId, state.gsearch.trim()); },
  opendeck: () => go('deck'),
  deckback() { const d = db.decks[state.deckId], f = d && folderOf(d); if (f) go('folder', { folderId: f.id }); else go('home'); },
  studyback() {
    const st = state.study;
    if (st && st.folderId && st.folderId !== '*' && !goneFolder(db.folders[st.folderId])) go('folder', { folderId: st.folderId });
    else if (st && st.folderId) go('home');
    else go(db.decks[state.deckId] ? 'deck' : 'home');
  },
  more() { state.limit += 200; refreshDeckList(); },
  setfilter(id, t) {
    state.filter = id; state.limit = 200;
    t.parentElement.querySelectorAll('button').forEach(b => { const on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    refreshDeckList();
  },

  /* menus */
  addmenu() {
    showSheet('Ajouter', `<div class="list">${srow('layers', 'Nouveau paquet', '', 'data-a="newdeck"')}${srow('folder', 'Nouveau classeur', '', 'data-a="newfolder"')}${srow('download', 'Importer des cartes', '', 'data-a="importhome"')}</div>`);
  },
  studymenu(id) {
    const folder = id.startsWith('f:'), ref = id.slice(2);
    const s = folder ? sumStats(decks().filter(d => d.folderId === ref)) : stats(ref);
    const nm = folder ? (db.folders[ref] || {}).name : (db.decks[ref] || {}).name;
    const at = mode => `data-a="run" data-mode="${mode}" data-scope="${id}"`;
    let rows = '';
    if (s.new) rows += srow('play', 'Continuer le tri', s.new, at('new'));
    if (s.unknown) rows += srow('refresh', 'Revoir « je ne connais pas » en boucle', s.unknown, at('unknown'));
    if (s.flag) rows += srow('flag', 'Cartes marquées', s.flag, at('flag'));
    rows += srow('layers', 'Tout réviser', s.total, at('all'));
    if (cfg.game) rows += srow('bolt', 'Défi éclair · 60 s', '', at('blitz'));
    showSheet('Réviser · ' + (nm || ''), `<div class="list">${rows}</div>
      <div class="list"><label class="row static"><span class="sl">Mélanger</span>${switchCtl('shuffle', cfg.shuffle !== false)}</label>
      <label class="row static"><span class="sl">Mode jeu</span>${switchCtl('game', !!cfg.game)}</label></div>`, id);
  },
  studymore() {
    const st = state.study, c = db.cards[st.queue[st.i]]; if (!c) return;
    showSheet('Cette carte', `<div class="list">${st.i ? srow('undo', 'Carte précédente', '', 'data-a="back"') : ''}
      ${srow(c.flag ? 'flag-f' : 'flag', c.flag ? 'Retirer la marque' : 'Marquer cette carte', '', 'data-a="flagstudy"')}${srow('pencil', 'Modifier la carte', '', 'data-a="editstudy"')}</div>`);
  },
  deckmenu() {
    const d = db.decks[state.deckId];
    showSheet(d.name, `<div class="list">${srow('pencil', 'Renommer', '', 'data-a="rename"')}${srow('check-sq', 'Sélectionner des cartes', '', 'data-a="selmode"')}${srow('download', 'Importer dans ce paquet', '', `data-a="import" data-id="${d.id}"`)}${srow('upload', 'Exporter en CSV', '', 'data-a="exportdeck"')}
      <div class="row static"><span class="sl">Classeur</span><select data-f="deckFolder" aria-label="Classeur">${opt('', 'Aucun', d.folderId || '')}${folders().map(f => opt(f.id, esc(f.name), d.folderId || '')).join('')}</select></div></div>
      <div class="list">${srow('undo', 'Réinitialiser le tri', '', 'data-a="reset"')}${srow('trash', 'Supprimer le paquet', '', 'data-a="deldeck"', 'danger')}</div>`);
  },
  foldermenu(id) {
    const f = db.folders[id];
    showSheet(f.name, `<div class="list">${srow('pencil', 'Renommer', '', `data-a="renamefolder" data-id="${id}"`)}${srow('trash', 'Supprimer le classeur', '', `data-a="delfolder" data-id="${id}"`, 'danger')}</div>`);
  },

  /* paquets & classeurs */
  async newdeck() {
    const n = await askText('Nouveau paquet', '', 'Nom du paquet'); if (!n) return;
    const id = uid(), fid = state.view === 'folder' ? state.folderId : null;
    db.decks[id] = { id, name: n, folderId: fid, updatedAt: now() }; save(); openDeck(id);
  },
  async rename() {
    const d = db.decks[state.deckId], n = await askText('Renommer le paquet', d.name); if (!n) return;
    d.name = n; touch(d); save(); render();
  },
  async deldeck() {
    const d = db.decks[state.deckId], cs = cardsOf(d.id);
    const m1 = !cs.length ? `« ${d.name} » sera supprimé.` : cs.length === 1 ? `« ${d.name} » et sa carte seront supprimés.` : `« ${d.name} » et ses ${cs.length} cartes seront supprimés.`;
    if (!await confirmDlg({ title: 'Supprimer ce paquet ?', msg: m1, ok: 'Supprimer', danger: true })) return;
    const items = [d, ...cs], f = folderOf(d); softDelete(items); save();
    if (f) go('folder', { folderId: f.id }); else go('home');
    toast('Paquet supprimé', { action: ['Annuler', () => { restore(items); save(); render(); }] });
  },
  async newfolder() {
    const n = await askText('Nouveau classeur', '', 'Nom du classeur'); if (!n) return;
    const id = uid(); db.folders[id] = { id, name: n, updatedAt: now() }; save(); go('folder', { folderId: id });
  },
  async renamefolder(id) {
    const f = db.folders[id], n = await askText('Renommer le classeur', f.name); if (!n) return;
    f.name = n; touch(f); save(); render();
  },
  async delfolder(id) {
    const f = db.folders[id], inside = decks().filter(d => d.folderId === id);
    const m2 = !inside.length ? 'Ce classeur est vide.' : inside.length === 1 ? `Le paquet qu'il contient n'est pas supprimé : il sort simplement du classeur.` : `Les ${inside.length} paquets qu'il contient ne sont pas supprimés : ils sortent simplement du classeur.`;
    if (!await confirmDlg({ title: 'Supprimer ce classeur ?', msg: m2, ok: 'Supprimer', danger: true })) return;
    softDelete([f]); inside.forEach(d => { d.folderId = null; touch(d); }); save(); go('home');
    toast('Classeur supprimé', { action: ['Annuler', () => { restore([f]); inside.forEach(d => { d.folderId = id; touch(d); }); save(); render(); }] });
  },
  async reset() {
    const cs = cardsOf(state.deckId);
    if (!await confirmDlg({ title: 'Réinitialiser le tri ?', msg: 'Toutes les cartes de ce paquet repasseront en « non triées ». Les marques sont conservées.', ok: 'Réinitialiser', danger: true })) return;
    const prev = cs.map(c => [c, c.status]); cs.forEach(c => { c.status = 'new'; touch(c); }); save(); render();
    toast('Tri réinitialisé', { action: ['Annuler', () => { prev.forEach(([c, s]) => { c.status = s; touch(c); }); save(); render(); }] });
  },
  exportdeck() {
    const d = db.decks[state.deckId], a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([deckToCsv(d.id)], { type: 'text/csv;charset=utf-8' }));
    a.download = safeName(d.name) + '.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Paquet exporté en CSV');
  },
  sample() { const id = createSample(); toast('Paquet d\'exemple créé'); openDeck(id); },

  /* sélection multiple */
  rowtap(id) {
    if (!state.selMode) return go('edit', { editId: id, editFrom: null });
    if (state.sel.has(id)) state.sel.delete(id); else state.sel.add(id);
    refreshDeckList();
  },
  selmode() { state.selMode = !state.selMode; state.sel = new Set(); render(); },
  selcancel() { state.selMode = false; state.sel = new Set(); render(); },
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
  flip() {
    const st = state.study; if (st.mode === 'blitz' && !st.ready) return;
    const sel = getSelection(), box = document.querySelector('.fc-in');   // une sélection de texte (pour surligner) ne retourne pas la carte
    if (sel && !sel.isCollapsed && sel.toString().trim() && box && box.contains(sel.anchorNode)) return;
    st.flip = !st.flip; render();
  },
  ans: id => answer(id),
  back() { const st = state.study; if (st.i > 0) { st.i--; st.flip = false; render(); } },
  flagstudy() { const st = state.study, c = db.cards[st.queue[st.i]]; c.flag = !c.flag; touch(c); save(); render(); },
  editstudy() { const st = state.study; go('edit', { editId: st.queue[st.i], editFrom: 'study' }); },
  gameon() { cfg.game = true; saveCfg(); render(); toast('Mode jeu activé : gagne des XP en révisant !'); },
  studyhl: id => studyHighlight(id),

  /* ajout rapide pendant la révision */
  quickadd() {
    const st = state.study; if (!st || st.mode === 'blitz' || st.i >= st.queue.length) return;
    const cur = db.cards[st.queue[st.i]];
    const ds = st.folderId === '*' ? decks() : st.folderId ? decks().filter(d => d.folderId === st.folderId) : [db.decks[st.deckId]].filter(Boolean);
    if (!ds.length) return;
    const def = cur && ds.some(d => d.id === cur.deckId) ? cur.deckId : ds[0].id;
    state.qadd = 0; state.lastField = 'qq';
    showCompose(`<div class="cmp-back" data-a="cmpclose"></div><div class="cmp" role="dialog" aria-modal="true" aria-label="Nouvelle carte">
      <div class="cmp-nav">${nb('Fermer', '', 'data-a="cmpclose"')}<b>Nouvelle carte</b>${nb('Ajouter', '', 'data-a="cmpadd"', 'strong')}</div>
      <div class="cmp-body">
        ${ds.length > 1 ? `<div class="list" style="margin-bottom:14px"><div class="row static"><span class="rt"><b>Paquet</b></span><select id="qdeck" aria-label="Paquet">${ds.map(d => opt(d.id, esc(d.name), def)).join('')}</select></div></div>`
          : `<input type="hidden" id="qdeck" value="${ds[0].id}"><p class="subtitle" style="margin-bottom:10px">Ajout dans « ${esc(ds[0].name)} »</p>`}
        ${toolbar()}
        <div class="list"><div class="cell"><label for="qq">Question</label><textarea id="qq" placeholder="Texte, formules LaTeX…"></textarea></div><div class="cell"><label for="qa">Réponse</label><textarea id="qa" placeholder="Texte, formules LaTeX…"></textarea></div></div>
        <p class="grp-f" id="qcount" aria-live="polite">La carte rejoint la session en cours.</p></div></div>`);
    $('qq').focus();
  },
  cmpadd() {
    const q = $('qq').value.trim(), a = $('qa').value.trim(), st = state.study, did = $('qdeck').value;
    if (!q || !a) return toast('Question et réponse requises.', { kind: 'err' });
    const id = addCard(did, q, a); save();
    if (st && st.mode !== 'blitz') st.queue.push(id);
    state.qadd = (state.qadd || 0) + 1;
    $('qq').value = ''; $('qa').value = ''; $('qq').focus();
    $('qcount').textContent = `${state.qadd} ${plural(state.qadd, 'carte ajoutée', 'cartes ajoutées')} — elle${state.qadd > 1 ? 's' : ''} ${plural(state.qadd, 'sera', 'seront')} revue${state.qadd > 1 ? 's' : ''} en fin de session.`;
    buzz(8); render();
  },
  cmpclose: () => closeCompose(),

  /* surlignage : palette et couleur */
  hlpal(_, t) {
    const pal = t.closest('.tb').querySelector('.hlpal'); pal.hidden = !pal.hidden;
    if (!pal.hidden) syncToolbars();
  },
  hlset(color) {
    cfg.hl = color; saveCfg(); syncToolbars();
    document.querySelectorAll('.hlpal').forEach(p => { p.hidden = true; });
    const el = activeField();
    if (el && hasTarget(el)) insertSnippet('hl');          // applique tout de suite au mot ou à la sélection
  },

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
  flagedit(_, t) {
    const c = db.cards[state.editId]; c.flag = !c.flag; touch(c); save();
    t.innerHTML = `${tile(c.flag ? 'flag-f' : 'flag', 'r')}<span class="rt"><b>${c.flag ? 'Retirer la marque' : 'Marquer cette carte'}</b></span>`;
  },
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
    try { await getToken('select_account'); cfg.signedIn = true; saveCfg(); startAutoSyncLoop(); await doSync(false); if (['settings', 'home'].includes(state.view)) render(); }
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
  if (k === 'theme' || k === 'accent') applyTheme();
  if (k === 'sound' && v) sfx.ok();
  if (k === 'game') {
    if (v) toast('Mode jeu activé : gagne des XP en révisant !');
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
  if (e.key === 'Escape') {
    if ($sheet.innerHTML) { closeSheet(); return; }
    if ($compose.classList.contains('open')) { closeCompose(); return; }
    if (pill) { hidePill(); return; }
  }
  if ($compose.classList.contains('open') && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); A.cmpadd(); return; }
  if ((e.ctrlKey || e.metaKey) && FIELD_IDS.includes(e.target.id) && (e.key === 'b' || e.key === 'u')) { e.preventDefault(); state.lastField = e.target.id; insertSnippet(e.key === 'b' ? 'bold' : 'under'); return; }
  const el = e.target;
  // éléments cliquables non-boutons (cartes, paquets) : Entrée / Espace comme un bouton
  if ((e.key === 'Enter' || e.key === ' ') && el.matches && el.matches('[role=button][data-a]') && state.view !== 'study') { e.preventDefault(); el.click(); return; }
  if (state.view !== 'study' || $sheet.innerHTML || $compose.classList.contains('open') || /INPUT|TEXTAREA|SELECT|BUTTON/.test(el.tagName)) return;
  const st = state.study;
  if (st.mode === 'blitz' && !st.ready) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); blitzGo(); } return; }
  if (st.over || st.i >= st.queue.length) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); A.flip(); }
  else if (e.key === 'ArrowRight' && st.flip) answer('known');
  else if (e.key === 'ArrowLeft' && st.flip) answer('unknown');
  else if ((e.key === 'f' || e.key === 'F') && st.mode !== 'blitz') A.flagstudy();
  else if ((e.key === 'n' || e.key === 'N') && st.mode !== 'blitz') { e.preventDefault(); A.quickadd(); }
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
