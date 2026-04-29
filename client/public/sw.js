// MecProAI Service Worker — PWA
const CACHE_VERSION = 'mecproai-v2'; // v2: fixed /dashboard cache issue
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const API_CACHE     = `${CACHE_VERSION}-api`;

// Recursos estáticos para cache (shell do app)
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/favicon-192.png',
  '/favicon-512.png',
  '/apple-touch-icon.png',
  // Nota: /dashboard NÃO incluído — requer autenticação e causaria falha no install
];

// ── Install: pre-cache o shell estático ──────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .catch(() => {}) // não falha se algum asset não existir
      .then(() => self.skipWaiting())
  );
});

// ── Activate: limpa caches antigos ───────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('mecproai-') && key !== STATIC_CACHE && key !== API_CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: estratégia por tipo de request ─────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls — Network First (sempre tenta a rede, sem cache)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/trpc/')) {
    event.respondWith(fetch(request).catch(() => new Response(
      JSON.stringify({ error: 'Sem conexão. Verifique sua internet.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )));
    return;
  }

  // Assets estáticos (JS, CSS, imagens) — Cache First
  if (
    request.method === 'GET' &&
    (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/) ||
     url.pathname.startsWith('/assets/'))
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navegação (rotas SPA) — Network First, sem interceptar autenticação
  if (request.mode === 'navigate') {
    // Não intercepta /api/* — deixa o servidor responder
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/trpc/')) {
      event.respondWith(fetch(request));
      return;
    }
    event.respondWith(
      fetch(request).catch(() =>
        // Fallback: serve a raiz que o Vite serve como index.html
        caches.match('/') || fetch('/')
      )
    );
    return;
  }

  // Tudo mais — Network First simples
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
