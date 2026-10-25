'use strict';
/* Données : bibliothèque (paquets, cartes, classeurs, progression du jeu), réglages et fusion pour la synchro */

function normDb(o) {
  o = o && typeof o === 'object' ? o : {};
  o.decks = o.decks || {}; o.cards = o.cards || {}; o.folders = o.folders || {};
  const g = o.game = o.game || {};
  g.days = g.days || {}; g.badges = g.badges || {}; g.records = g.records || {}; g.resetAt = g.resetAt || 0;
  return o;
}
let db = normDb({});
let cfg = { signedIn: false, clientId: '', last: '', email: '', game: false, goal: 20, sound: false, theme: 'auto', dev: '' };
try {
  const raw = localStorage.getItem('fc_data');
  if (raw) {
    try { db = normDb(JSON.parse(raw)); }
    catch (e) { try { localStorage.setItem('fc_data_corrupt_' + Date.now(), raw); } catch (e2) {} }   // on garde une copie avant de repartir
  }
} catch (e) {}
try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem('fc_cfg')) }; } catch (e) {}
if (!cfg.dev) { cfg.dev = uid(); try { localStorage.setItem('fc_cfg', JSON.stringify(cfg)); } catch (e) {} }

let syncTimer = null;
function save(sync = true) {
  try { localStorage.setItem('fc_data', JSON.stringify(db)); }
  catch (e) { toast('Stockage de l\'appareil plein : exporte tes données depuis les Réglages.', { kind: 'err', ms: 7000 }); }
  if (sync && cfg.signedIn) { clearTimeout(syncTimer); syncTimer = setTimeout(() => doSync(true), 3000); }
}
function saveCfg() { try { localStorage.setItem('fc_cfg', JSON.stringify(cfg)); } catch (e) {} }

/* ---------- accès aux données ---------- */
const decks = () => Object.values(db.decks).filter(d => !d.deleted).sort((a, b) => a.name.localeCompare(b.name));
const folders = () => Object.values(db.folders).filter(f => !f.deleted).sort((a, b) => a.name.localeCompare(b.name));
const cardsOf = id => Object.values(db.cards).filter(c => !c.deleted && c.deckId === id);
const allCards = () => { const ok = new Set(decks().map(d => d.id)); return Object.values(db.cards).filter(c => !c.deleted && ok.has(c.deckId)); };
function stats(id) {
  const s = { total: 0, known: 0, unknown: 0, new: 0, flag: 0 };
  for (const c of cardsOf(id)) { s.total++; s[c.status] = (s[c.status] || 0) + 1; if (c.flag) s.flag++; }
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
  return id;
}
function touch(o) { o.updatedAt = now(); }
// suppression « douce » (annulable et synchronisable) : on marque, on ne retire jamais
function softDelete(items) { items.forEach(o => { o.deleted = true; touch(o); }); }
function restore(items) { items.forEach(o => { o.deleted = false; touch(o); }); }

/* ---------- fusion (synchro entre appareils) ---------- */
// paquets / cartes / classeurs : la version la plus récente gagne
// jeu : compteurs par appareil et par jour (les XP de plusieurs appareils s'additionnent), badges = union, records = max
function mergeGame(a, b) {
  a = a || {}; b = b || {};
  const ra = Math.max(a.resetAt || 0, b.resetAt || 0);
  const out = { days: {}, badges: {}, records: {}, resetAt: ra };
  for (const src of [a, b]) {
    for (const d in (src.days || {})) for (const dev in src.days[d]) {
      const nw = src.days[d][dev];
      if (ra && (nw.t || 0) <= ra) continue;
      const slot = out.days[d] || (out.days[d] = {}), cur = slot[dev];
      if (!cur || nw.n > cur.n || (nw.n === cur.n && (nw.xp > cur.xp || (nw.xp === cur.xp && (nw.t || 0) > (cur.t || 0))))) slot[dev] = nw;
    }
    for (const id in (src.badges || {})) {
      const ts = src.badges[id];
      if (ra && ts <= ra) continue;
      if (!out.badges[id] || ts < out.badges[id]) out.badges[id] = ts;
    }
    for (const key in (src.records || {})) {
      const r = src.records[key];
      if (ra && (r.t || 0) <= ra) continue;
      if (!out.records[key] || r.s > out.records[key].s) out.records[key] = r;
    }
  }
  return out;
}
function merge(a, b) {
  const out = { decks: {}, cards: {}, folders: {} };
  for (const k of ['decks', 'cards', 'folders']) {
    out[k] = { ...(a[k] || {}) };
    for (const id in (b[k] || {})) { const x = out[k][id], y = b[k][id]; if (!x || y.updatedAt > x.updatedAt) out[k][id] = y; }
  }
  out.game = mergeGame(a.game, b.game);
  return out;
}

/* ---------- état de l'interface ---------- */
const state = { view: 'home', deckId: null, folderId: null, filter: 'all', search: '', gsearch: '', limit: 200, selMode: false, sel: new Set(), study: null,
  editId: null, editFrom: null, addCount: 0, impFrom: 'home', msg: '', lastField: 'eq', closedFolders: new Set(), needLogin: false, timer: null,
  imp: { tab: 'csv', deckId: '', newName: '', text: '', delim: 'auto', header: false, cardSep: 'nl', fieldSep: 'tab', customCard: '', customField: '', which: 'first', addCount: 0 } };
