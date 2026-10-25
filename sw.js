/* Service worker — Flashcards v2.0.0
   - tout est pré-chargé : l'app (formules LaTeX comprises) fonctionne hors ligne
   - fichiers de l'app : réseau d'abord (toujours à jour quand tu es en ligne), cache en secours
   - /vendor/ (KaTeX, police) : cache d'abord, ces fichiers ne changent jamais
   - une nouvelle version attend ton accord (« Actualiser ») au lieu de s'imposer pendant une session */
const VERSION = 'v2.0.0';
const CACHE = 'fc-' + VERSION;
const PRECACHE = [
 "./",
 "index.html",
 "manifest.webmanifest",
 "css/app.css",
 "js/util.js",
 "js/store.js",
 "js/ui.js",
 "js/game.js",
 "js/study.js",
 "js/editor.js",
 "js/views.js",
 "js/sync.js",
 "js/app.js",
 "icon-192.png",
 "icon-512.png",
 "icon-maskable-512.png",
 "vendor/katex/katex.min.css",
 "vendor/katex/katex.min.js",
 "vendor/katex/auto-render.min.js",
 "vendor/fonts/nunito-latin.woff2",
 "vendor/katex/fonts/KaTeX_AMS-Regular.woff2",
 "vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2",
 "vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2",
 "vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2",
 "vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2",
 "vendor/katex/fonts/KaTeX_Main-Bold.woff2",
 "vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2",
 "vendor/katex/fonts/KaTeX_Main-Italic.woff2",
 "vendor/katex/fonts/KaTeX_Main-Regular.woff2",
 "vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2",
 "vendor/katex/fonts/KaTeX_Math-Italic.woff2",
 "vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2",
 "vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2",
 "vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2",
 "vendor/katex/fonts/KaTeX_Script-Regular.woff2",
 "vendor/katex/fonts/KaTeX_Size1-Regular.woff2",
 "vendor/katex/fonts/KaTeX_Size2-Regular.woff2",
 "vendor/katex/fonts/KaTeX_Size3-Regular.woff2",
 "vendor/katex/fonts/KaTeX_Size4-Regular.woff2",
 "vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2"
];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE))); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;                 // Google, etc. : on ne touche à rien
  const put = res => { if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } return res; };
  if (u.pathname.includes('/vendor/')) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(put)));
    return;
  }
  e.respondWith(fetch(r).then(put).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
