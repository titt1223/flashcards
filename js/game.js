'use strict';
/* Moteur de jeu : XP, niveaux, séries de jours, objectif quotidien, badges, records.
   Les compteurs sont enregistrés en permanence (même mode jeu désactivé) : activer le mode jeu révèle simplement la progression.
   Structure (synchronisée) : db.game.days[AAAA-MM-JJ][appareil] = { n réponses, k connues, xp, r récupérées, g objectif atteint, t }  */

const TODAY = () => dayKey(new Date());

/* ---------- niveaux ---------- */
const lvlXp = L => 50 * L * (L - 1);                      // XP cumulés pour atteindre le niveau L (L1 = 0, L2 = 100, L3 = 300, L4 = 600…)
function levelOf(xp) { let L = 1; while (xp >= lvlXp(L + 1)) L++; return L; }
const TITLES = [[1, 'Apprenti'], [3, 'Initié'], [5, 'Studieux'], [8, 'Confirmé'], [12, 'Expert'], [18, 'Maître'], [25, 'Érudit'], [35, 'Sage']];
const titleOf = L => TITLES.filter(t => L >= t[0]).pop()[1];
function levelInfo(xp) {
  const level = levelOf(xp), lo = lvlXp(level), hi = lvlXp(level + 1);
  return { level, into: xp - lo, need: hi - lo, pct: (xp - lo) / (hi - lo), title: titleOf(level) };
}

/* ---------- compteurs ---------- */
function myDay(key = TODAY()) {
  const day = db.game.days[key] || (db.game.days[key] = {});
  return day[cfg.dev] || (day[cfg.dev] = { n: 0, k: 0, xp: 0, r: 0, g: 0, t: 0 });
}
function dayTotals(key) {
  const day = db.game.days[key] || {}, o = { n: 0, k: 0, xp: 0, r: 0, g: 0 };
  for (const dev in day) { const e = day[dev]; o.n += e.n || 0; o.k += e.k || 0; o.xp += e.xp || 0; o.r += e.r || 0; if (e.g) o.g = 1; }
  return o;
}
function totalXp() {
  let s = 0;
  for (const d in db.game.days) for (const dev in db.game.days[d]) s += db.game.days[d][dev].xp || 0;
  return s;
}
// série = jours consécutifs avec au moins une carte révisée ; encore « vivante » si tu as révisé hier
function streakInfo() {
  const active = new Set();
  for (const k in db.game.days) if (dayTotals(k).n > 0) active.add(k);
  const today = active.has(TODAY());
  let cur = 0; const d = new Date();
  if (!today) d.setDate(d.getDate() - 1);
  while (active.has(dayKey(d))) { cur++; d.setDate(d.getDate() - 1); }
  let best = 0, run = 0, prev = null;
  for (const k of [...active].sort()) { const n = dayNum(k); run = prev !== null && n === prev + 1 ? run + 1 : 1; if (run > best) best = run; prev = n; }
  return { cur, best: Math.max(best, cur), today };
}
function gameTotals() {
  let n = 0, k = 0, xp = 0, r = 0, goals = 0, daysActive = 0;
  for (const key in db.game.days) { const t = dayTotals(key); n += t.n; k += t.k; xp += t.xp; r += t.r; if (t.g) goals++; if (t.n) daysActive++; }
  const sk = streakInfo();
  return { n, k, xp, r, goals, daysActive, streak: sk.cur, streakBest: sk.best, cards: Object.values(db.cards).filter(c => !c.deleted).length };
}
function lastDays(n) {
  const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S'], out = [], d = new Date();
  d.setDate(d.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    const key = dayKey(d), t = dayTotals(key);
    out.push({ key, n: t.n, k: t.k, dow: DOW[d.getDay()], today: key === TODAY(), label: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }) });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/* ---------- badges ---------- */
const BADGES = [
  { id: 'first',   icon: '🌱', name: 'Premier pas',      desc: 'Réviser ta première carte',                    test: t => t.n >= 1 },
  { id: 'n100',    icon: '💯', name: 'Centurion',        desc: 'Réviser 100 cartes',                           test: t => t.n >= 100 },
  { id: 'n500',    icon: '📚', name: 'Lecteur assidu',   desc: 'Réviser 500 cartes',                           test: t => t.n >= 500 },
  { id: 'n2000',   icon: '🏛️', name: 'Bibliothèque vivante', desc: 'Réviser 2 000 cartes',                     test: t => t.n >= 2000 },
  { id: 's3',      icon: '🔥', name: 'En feu',           desc: '3 jours de suite',                             test: t => t.streakBest >= 3 },
  { id: 's7',      icon: '🗓️', name: 'Semaine parfaite', desc: '7 jours de suite',                             test: t => t.streakBest >= 7 },
  { id: 's30',     icon: '🏆', name: 'Mois de fer',      desc: '30 jours de suite',                            test: t => t.streakBest >= 30 },
  { id: 'c10',     icon: '⚡', name: 'Série de 10',      desc: '10 bonnes réponses d\'affilée',                test: (t, c) => (c.bestCombo || 0) >= 10 },
  { id: 'c25',     icon: '🚀', name: 'Inarrêtable',      desc: '25 bonnes réponses d\'affilée',                test: (t, c) => (c.bestCombo || 0) >= 25 },
  { id: 'perfect', icon: '💎', name: 'Sans faute',       desc: 'Session parfaite d\'au moins 10 cartes',       test: (t, c) => !!c.perfect },
  { id: 'goal',    icon: '🎯', name: 'Objectif atteint', desc: 'Atteindre l\'objectif quotidien',              test: t => t.goals >= 1 },
  { id: 'goal7',   icon: '🎖️', name: 'Constance',        desc: 'Atteindre l\'objectif 7 jours',                test: t => t.goals >= 7 },
  { id: 'redeem',  icon: '🔁', name: 'Rédemption',       desc: 'Retourner 25 cartes à revoir en cartes connues', test: t => t.r >= 25 },
  { id: 'clear',   icon: '🧹', name: 'Tout est su',      desc: 'Vider la boucle « je ne connais pas »',        test: (t, c) => !!c.cleared },
  { id: 'blitz',   icon: '⏱️', name: 'Éclair',           desc: '20 bonnes réponses dans un défi éclair',       test: (t, c) => (c.blitz || 0) >= 20 },
  { id: 'lib',     icon: '🗃️', name: 'Bibliothécaire',   desc: 'Avoir 100 cartes dans ta bibliothèque',        test: t => t.cards >= 100 },
  { id: 'lvl5',    icon: '⭐', name: 'Niveau 5',         desc: 'Atteindre le niveau 5',                        test: t => levelOf(t.xp) >= 5 },
  { id: 'lvl10',   icon: '🌟', name: 'Niveau 10',        desc: 'Atteindre le niveau 10',                       test: t => levelOf(t.xp) >= 10 },
];
function checkBadges(ctx = {}) {
  const t = gameTotals(), got = [];
  for (const b of BADGES) {
    if (db.game.badges[b.id]) continue;
    if (b.test(t, ctx)) { db.game.badges[b.id] = now(); got.push(b); }
  }
  return got;
}

/* ---------- événements de jeu ---------- */
// appelé à chaque réponse ; ne sauvegarde pas (c'est answer() qui s'en charge)
function recordAnswer(prev, k, st, blitz) {
  const me = myDay(), before = totalXp();
  const fx = { known: k === 'known', gain: 0, combo: 0, goal: false, level: 0, badges: [], milestone: 0 };
  me.n++; me.t = now(); st.na++;
  if (k === 'known') {
    me.k++; st.nk++; st.combo++; if (st.combo > st.bestCombo) st.bestCombo = st.combo;
    fx.gain = blitz ? 5 : 10 + Math.min(st.combo - 1, 10);                    // 10 XP, +1 par bonne réponse d'affilée (max +10)
    if (!blitz && prev === 'unknown') { fx.gain += 5; me.r = (me.r || 0) + 1; } // bonus « rédemption »
    if ([5, 10, 15, 20, 25, 30, 40, 50, 75, 100].includes(st.combo)) fx.milestone = st.combo;
  } else { st.combo = 0; st.wrong++; fx.gain = blitz ? 0 : 2; }                  // 2 XP d'effort même en cas d'erreur
  fx.combo = st.combo;
  me.xp += fx.gain; st.xp += fx.gain;
  const dt = dayTotals(TODAY());
  if (!dt.g && dt.n >= (cfg.goal || 20)) { me.g = 1; me.xp += 50; st.xp += 50; fx.goal = true; }   // objectif du jour : +50 XP, une fois
  const la = levelOf(totalXp()); if (la > levelOf(before)) fx.level = la;
  fx.badges = checkBadges({ bestCombo: st.bestCombo, blitz: blitz ? st.nk : 0 });
  fx.badges.forEach(b => st.newBadges.push(b));
  return fx;
}
// fin d'une session classique : bonus, étoiles, badges de session
function finalizeSession(st) {
  if (st.final) return; st.final = true;
  const before = totalXp(), me = myDay();
  let bonus = 0;
  if (st.na >= 3) bonus += 20;                                   // session terminée
  st.perfect = st.na >= 10 && st.wrong === 0;
  if (st.perfect) bonus += 30;                                   // session parfaite
  if (bonus) { me.xp += bonus; me.t = now(); st.xp += bonus; }
  st.bonus = bonus;
  const acc = st.na ? st.nk / st.na : 0;
  st.stars = !st.na ? 0 : acc >= .9 ? 3 : acc >= .7 ? 2 : 1;
  st.cleared = st.mode === 'unknown' && st.na >= 5 && scopeStats(st.deckId, st.folderId).unknown === 0;
  checkBadges({ bestCombo: st.bestCombo, perfect: st.perfect, cleared: st.cleared }).forEach(b => st.newBadges.push(b));
  const la = levelOf(totalXp()); if (la > levelOf(before)) st.levelUp = la;
  st.streak = streakInfo();
  save();
}
const scopeKey = st => (st.folderId === '*' ? '*' : st.folderId ? 'f:' + st.folderId : 'd:' + st.deckId);
function finalizeBlitz(st) {
  if (st.final) return; st.final = true;
  const before = totalXp(), me = myDay(), key = scopeKey(st), recs = db.game.records;
  st.prevBest = (recs[key] || {}).s || 0;
  st.newRecord = st.score > st.prevBest && st.score > 0;
  st.bonus = 0;
  if (st.newRecord) { recs[key] = { s: st.score, t: now() }; st.bonus = 25; me.xp += 25; me.t = now(); st.xp += 25; }
  checkBadges({ blitz: st.score }).forEach(b => st.newBadges.push(b));
  const la = levelOf(totalXp()); if (la > levelOf(before)) st.levelUp = la;
  st.streak = streakInfo();
  save();
}
function resetGame() { db.game = { days: {}, badges: {}, records: {}, resetAt: now() }; save(); }
