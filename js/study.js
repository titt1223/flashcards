'use strict';
/* Sessions d'étude : portée (paquet / classeur / bibliothèque), ordre, réponses, boucle « je ne connais pas », session du jour, défi éclair */

function scopeCards(deckId, folderId) {
  if (folderId === '*') return allCards();
  if (folderId) {
    const ids = new Set(decks().filter(d => d.folderId === folderId).map(d => d.id));
    return Object.values(db.cards).filter(c => !c.deleted && ids.has(c.deckId));
  }
  return cardsOf(deckId);
}
const scopeStats = (deckId, folderId) => (folderId === '*' ? sumStats(decks()) : folderId ? sumStats(decks().filter(d => d.folderId === folderId)) : stats(deckId));
const pick = (cs, mode) => cs.filter(c => mode === 'all' || (mode === 'flag' ? c.flag : c.status === mode));
function order(cs) {
  cs = cs.slice();
  if (cfg.shuffle !== false) for (let i = cs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cs[i], cs[j]] = [cs[j], cs[i]]; }
  return cs;
}
function scopeName(st) {
  if (st.mode === 'daily') return '🎯 Session du jour';
  if (st.folderId === '*') return '📚 Bibliothèque';
  if (st.folderId) return '📁 ' + ((db.folders[st.folderId] || {}).name || '');
  return (db.decks[st.deckId] || {}).name || '';
}
function baseSession(o) {
  return Object.assign({ deckId: null, folderId: null, queue: [], i: 0, flip: false, res: {}, mode: 'all', round: 1,
    combo: 0, bestCombo: 0, xp: 0, na: 0, nk: 0, wrong: 0, newBadges: [], shown: 0, t0: now() }, o);
}

/* ---------- démarrage ---------- */
function startStudy(mode, deckId, folderId) {
  const cs = order(pick(scopeCards(deckId, folderId), mode));
  if (!cs.length) { toast('Aucune carte à réviser dans ce mode.'); return; }
  state.study = baseSession({ deckId, folderId, queue: cs.map(c => c.id), mode });
  go('study');
}
// session du jour : tes cartes à revoir d'abord, puis les non triées, puis le reste — au maximum « objectif quotidien » cartes
function startDaily() {
  const cs = allCards(), goal = Math.max(5, cfg.goal || 20), by = s => order(cs.filter(c => c.status === s));
  const pool = [...by('unknown'), ...by('new'), ...by('known')].slice(0, goal);
  if (!pool.length) { toast('Ajoute d\'abord des cartes.'); return; }
  state.study = baseSession({ folderId: '*', queue: pool.map(c => c.id), mode: 'daily' });
  go('study');
}
// défi éclair : 60 s, un maximum de bonnes réponses. N'altère ni le tri ni les marques.
function startBlitz(deckId, folderId) {
  const cs = order(scopeCards(deckId, folderId));
  if (!cs.length) { toast('Aucune carte dans cette sélection.'); return; }
  state.study = baseSession({ deckId, folderId, queue: cs.map(c => c.id), mode: 'blitz', ready: false, score: 0, deadline: 0 });
  go('study');
}
function blitzGo() {
  const st = state.study; if (!st || st.mode !== 'blitz' || st.ready) return;
  st.ready = true; st.deadline = now() + 60000; st.flip = false;
  clearInterval(state.timer); state.timer = setInterval(blitzTick, 200);
  render();
}
function blitzTick() {
  const st = state.study;
  if (!st || st.mode !== 'blitz' || state.view !== 'study' || st.over) { clearInterval(state.timer); state.timer = null; return; }
  const left = Math.max(0, st.deadline - now()), t = $('btime'), b = $('bbar');
  if (t) t.textContent = Math.ceil(left / 1000);
  if (b) b.style.width = (left / 600) + '%';
  if (left <= 0) endBlitz(st);
}
function endBlitz(st) {
  st.over = true; clearInterval(state.timer); state.timer = null;
  finalizeBlitz(st); render(); playFx(null, st);
}

/* ---------- réponse à une carte ---------- */
function answer(k) {
  const st = state.study;
  if (!st || st.over || st.i >= st.queue.length) return;
  const blitz = st.mode === 'blitz';
  if (blitz && (!st.ready || now() > st.deadline + 250)) { if (st.ready) endBlitz(st); return; }
  const c = db.cards[st.queue[st.i]]; if (!c) return;
  const prev = c.status;
  if (!blitz) {
    c.status = k; touch(c);
    if (k === 'unknown' && cfg.autoFlag !== false) c.flag = true;
    else if (k === 'known' && st.mode === 'flag') c.flag = false;
  }
  st.res[c.id] = k;
  const fx = recordAnswer(prev, k, st, blitz);
  save();
  st.i++; st.flip = false;
  if (blitz) {
    if (k === 'known') st.score++;
    if (st.i >= st.queue.length) { st.queue = order(scopeCards(st.deckId, st.folderId)).map(x => x.id); st.i = 0; }
  } else {
    let finished = st.i >= st.queue.length;
    // mode « je ne connais pas » : un nouveau tour tant qu'il en reste
    if (finished && st.mode === 'unknown') {
      const rest = order(pick(scopeCards(st.deckId, st.folderId), 'unknown'));
      if (rest.length) { st.queue = rest.map(x => x.id); st.i = 0; st.round++; finished = false; }
    }
    if (finished) finalizeSession(st);
  }
  render();
  playFx(fx, st);
}

/* ---------- retours visuels du mode jeu ---------- */
function playFx(fx, st) {
  if (!cfg.game) return;
  const blitz = st.mode === 'blitz';
  let lvl = 0;
  if (fx) {
    if (fx.known) sfx.ok(); else sfx.ko();
    if (fx.gain) floatText('+' + fx.gain + (blitz ? '' : ' XP'), fx.known ? '' : 'ko');
    if (fx.milestone) { floatText('🔥 Série de ' + fx.milestone + ' !', 'big', 34); if (fx.milestone >= 10) confetti(40); }
    if (fx.goal) { toast('🎯 Objectif du jour atteint ! +50 XP'); confetti(60); }
    lvl = fx.level;
  }
  const fresh = st.newBadges.slice(st.shown); st.shown = st.newBadges.length;
  fresh.forEach((b, i) => setTimeout(() => { toast('🏅 Badge débloqué : ' + b.name); sfx.badge(); }, 250 + i * 450));
  if (blitz && !st.final) { st.pendingLevel = Math.max(st.pendingLevel || 0, lvl); return; }   // pas de fenêtre en plein défi
  if (st.final) {
    sfx.done();
    if (st.stars === 3 || st.perfect || st.newRecord) confetti(90);
    lvl = st.levelUp || st.pendingLevel || lvl;
  }
  if (lvl) celebrateLevel(lvl);
}
function celebrateLevel(L) {
  sfx.level(); confetti(130);
  dialog({ html: `<div class="celebrate"><div class="big">🎉</div><h3>Niveau ${L} !</h3><p class="mut">Nouveau titre : <b>${esc(titleOf(L))}</b></p></div>`, ok: 'Continuer', cancel: false });
}
