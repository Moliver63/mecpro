// Eventos de funil no GA4 (tag G-JJ1H7MV9B7 carregada no index.html).
// A tag ja registra a origem da visita (UTM do link da bio) na sessao; o
// evento disparado no mesmo navegador herda essa origem no GA4. No cadastro
// pelo Google so herda se accounts.google.com estiver em "Listar referencias
// indesejadas" no GA4 (senao a volta do Google abre sessao nova).
// Ver docs/specs/2026-11-15-ga4-sign-up.md.

export function trackSignUp(method: "email" | "google"): void {
  try {
    const gtag = (window as any).gtag;
    if (typeof gtag === "function") gtag("event", "sign_up", { method });
  } catch {
    /* sem GA (bloqueador, rede): o cadastro segue normal */
  }
}

/**
 * Cadastro novo pelo Google volta do servidor com ?cadastro=google. Dispara o
 * evento uma vez e tira o parametro da URL, para recarregar a pagina nao
 * contar de novo.
 */
export function trackGoogleSignUpFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    // So no destino que o servidor marca: link compartilhado com o parametro
    // em outra pagina nao conta cadastro falso.
    if (url.pathname !== "/dashboard" || url.searchParams.get("cadastro") !== "google") return;
    trackSignUp("google");
    url.searchParams.delete("cadastro");
    window.history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
  } catch {
    /* ok */
  }
}
