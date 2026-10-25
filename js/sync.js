'use strict';
/* Synchronisation Google Drive (dossier caché de l'app, scope drive.appdata) */

const GOOGLE_CLIENT_ID = '357404140201-h93hvb0gqv6us3fvetc3tfj7p3fj7vce.apps.googleusercontent.com';
const clientId = () => cfg.clientId || GOOGLE_CLIENT_ID;
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata openid email';
let tok = null, tokExp = 0, gis = null, syncing = false, syncInterval = null, refreshing = false, nextTry = 0;

// le jeton Google (valable ~1 h) est conservé d'une page à l'autre : un rafraîchissement ne demande plus de se reconnecter
try { const s = JSON.parse(localStorage.getItem('fc_tok')); if (s && s.exp > now() + 60000) { tok = s.tok; tokExp = s.exp; } } catch (e) {}
const forgetTok = () => { tok = null; tokExp = 0; try { localStorage.removeItem('fc_tok'); } catch (e) {} };
const tokOk = () => !!tok && now() < tokExp - 60000;

function loadGis() {
  return gis || (gis = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client';
    s.onload = res; s.onerror = () => { gis = null; rej(new Error('Google injoignable (hors ligne ?)')); }; document.head.appendChild(s);
  }));
}
async function getToken(prompt) {
  if (tokOk()) return tok;
  if (!clientId()) throw new Error('Client ID Google manquant');
  await loadGis();
  return new Promise((res, rej) => {
    const conf = { client_id: clientId(), scope: SCOPE,
      callback: r => {
        if (r.error) return rej(new Error(r.error));
        tok = r.access_token; tokExp = now() + r.expires_in * 1000;
        try { localStorage.setItem('fc_tok', JSON.stringify({ tok, exp: tokExp })); } catch (e) {}
        res(tok);
      },
      error_callback: e => rej(new Error(e.type || 'Connexion annulée')) };
    if (cfg.email) conf.hint = cfg.email;   // évite le choix de compte quand plusieurs comptes Google sont ouverts
    google.accounts.oauth2.initTokenClient(conf).requestAccessToken({ prompt });
  });
}
async function learnEmail() {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tok } });
    if (r.ok) { const j = await r.json(); if (j.email) { cfg.email = j.email; saveCfg(); } }
  } catch (e) {}
}
const setMsg = m => { state.msg = m; const e = $('syncmsg'); if (e) e.textContent = m; };
async function drive(path, opt = {}, upload = false) {
  const r = await fetch('https://www.googleapis.com/' + (upload ? 'upload/' : '') + 'drive/v3/' + path, { ...opt, headers: { Authorization: 'Bearer ' + tok, ...(opt.headers || {}) } });
  if (r.status === 401) { forgetTok(); throw new Error('Session expirée'); }
  if (!r.ok) throw new Error('Erreur Drive ' + r.status);
  return r;
}
// prompt: 'none' = silencieux (auto), '' = normal, 'select_account' = choix du compte
async function doSync(auto, prompt = 'none') {
  if (!cfg.signedIn || syncing) return;
  // jeton expiré : le navigateur bloque toute fenêtre Google sans geste de l'utilisateur, on attend donc le prochain toucher (silentRefresh)
  if (auto && !tokOk()) return;
  syncing = true;
  try {
    setMsg('Synchronisation…');
    await getToken(auto ? 'none' : prompt);
    if (!cfg.email) learnEmail();
    const list = await (await drive("files?spaces=appDataFolder&q=name%3D'flashcards.json'&fields=files(id)")).json();
    const id = list.files[0] && list.files[0].id;
    let remote = {};
    if (id) { try { remote = await (await drive('files/' + id + '?alt=media')).json(); } catch (e) {} }
    const before = JSON.stringify(db);
    db = normDb(merge(db, remote)); save(false);
    const changed = JSON.stringify(db) !== before;
    const body = JSON.stringify(db);
    if (body !== JSON.stringify(normDb(merge(remote, remote)))) {
      if (id) await drive('files/' + id + '?uploadType=media', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }, true);
      else {
        const b = '----fc', meta = JSON.stringify({ name: 'flashcards.json', parents: ['appDataFolder'] });
        await drive('files?uploadType=multipart', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b },
          body: `--${b}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--` }, true);
      }
    }
    cfg.last = now(); state.needLogin = false; saveCfg();
    setMsg('✅ Synchronisé à ' + new Date().toLocaleTimeString('fr-FR'));
    updateCloud();
    // ne rafraîchit l'écran que si ça ne gêne pas (pas de saisie, de sélection ni de session en cours)
    const busy = state.selMode || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
    if (changed && !busy && (state.view === 'home' || state.view === 'deck' || state.view === 'stats')) render();
  } catch (e) {
    if (auto) state.needLogin = true;
    setMsg('⚠️ ' + e.message + (auto ? ' — touche l\'écran pour te reconnecter' : ''));
    updateCloud();
  }
  syncing = false;
}
function startAutoSyncLoop() {
  clearInterval(syncInterval);
  syncInterval = setInterval(() => { if (cfg.signedIn && !document.hidden && state.view !== 'study') doSync(true); }, 90000);
}
// Reste connecté : le jeton Google dure 1 h et ne peut être renouvelé qu'à l'occasion d'un geste de l'utilisateur
// (sinon le navigateur bloque la fenêtre). On le renouvelle donc discrètement au premier toucher/clic qui suit.
function silentRefresh() {
  if (!cfg.signedIn || refreshing || syncing) return;
  if (tok && now() < tokExp - 120000) return;
  if (now() < nextTry) return;
  refreshing = true; nextTry = now() + 60000;
  getToken('none').then(() => { state.needLogin = false; updateCloud(); doSync(true); })
    .catch(() => { state.needLogin = true; updateCloud(); })
    .finally(() => { refreshing = false; });
}
document.addEventListener('pointerdown', silentRefresh, { capture: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden && cfg.signedIn && state.view !== 'study') doSync(true); });
window.addEventListener('online', () => { if (cfg.signedIn) doSync(true); });
