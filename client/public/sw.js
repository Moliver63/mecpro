// MecProAI Service Worker — PWA
const CACHE_VERSION = 'mecproai-v5'; // v5: nao intercepta navegacao para /api/ (callback do OAuth)
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

  // NAVEGACAO para o servidor nao passa pelo service worker.
  //
  // Achado real (log de producao, 21/10):
  //
  //   15:19:07  Google callback — redirecionando apos login {userId:2}
  //   15:19:08  Google callback error {name:"TokenError", msg:"Malformed auth code."}
  //   15:19:41  Google callback error {name:"TokenError", msg:"Malformed auth code."}
  //
  // Login deu certo e um segundo depois o mesmo codigo foi reenviado. Codigo de
  // autorizacao do Google e de uso unico, entao o segundo envio falha.
  //
  // A causa estava aqui. O callback e `/api/auth/google/callback`, e o ramo de
  // `/api/` abaixo era avaliado ANTES de qualquer checagem de `request.mode`:
  // uma NAVEGACAO caia nele e era respondida com `fetch(request)`, que segue
  // redirect por padrao. O callback responde 302 (com Set-Cookie) pro
  // /dashboard, o fetch seguia, e o `respondWith` devolvia o HTML do dashboard
  // como resposta da navegacao pro callback.
  //
  // Resultado: a barra de endereco ficava em
  // `/api/auth/google/callback?code=...`. Qualquer recarregamento reenviava o
  // codigo ja consumido, e o servidor manda `TokenError` pro
  // `/login?error=oauth_expired` — ou seja, quem acabou de logar com sucesso
  // era jogado pra tela de login com erro de sessao.
  //
  // Sem `respondWith` o browser trata nativamente: segue o 302, grava o cookie
  // e a URL final e /dashboard. Nao sobra callback na barra pra reenviar.
  //
  // Vale pra todo `/api/` em navegacao, nao so o OAuth: download e qualquer
  // rota que responda 3xx tem o mesmo problema, e nenhuma delas e rota de SPA.
  if (request.mode === 'navigate' && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/trpc/'))) {
    return;
  }

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

  // Navegação (rotas SPA) — Network First.
  // O caso /api/ saiu daqui: agora e tratado no topo, SEM respondWith. Este
  // ramo chamava `event.respondWith(fetch(request))`, que ainda segue redirect
  // e mantinha o bug — e de todo jeito nunca era alcancado, porque o ramo de
  // /api/ acima vinha primeiro.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match('/');
        if (cached) return cached;
        try { return await fetch('/'); } catch { return new Response('', { status: 503 }); }
      })
    );
    return;
  }

  // Tudo mais — Network First simples
  // Fix: caches.match pode retornar undefined → precisa de fallback Response explícita
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then(cached =>
        cached || new Response('', { status: 503 })
      )
    )
  );
});
