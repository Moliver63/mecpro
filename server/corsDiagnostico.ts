/**
 * Por que uma origem foi recusada, em termos que dao pra agir.
 *
 * Achado real (log de producao, 12/10): sete linhas iguais em 200ms,
 * `[WARN] [cors] Origem bloqueada: null`, e nada mais. Sem caminho, sem
 * metodo, sem pista do que chamava — impossivel saber se era o Michel abrindo
 * o front fora de um servidor, um iframe de terceiro, ou um cliente quebrado.
 *
 * O BLOQUEIO esta certo e nao muda: `Origin: null` chega de pagina `file://`,
 * de iframe com sandbox sem `allow-same-origin`, de `data:` URL e de alguns
 * redirecionamentos cross-origin. Com `credentials: true`, liberar `null`
 * seria buraco de CSRF — qualquer HTML local ou iframe sandboxed passaria a
 * fazer requisicao autenticada na API. Recusar e o comportamento correto.
 *
 * Requisicao SEM header Origin continua liberada no middleware (cliente MCP,
 * curl, app nativo nao mandam Origin) — `null` e diferente de ausente, e essa
 * distincao e justamente o que o log antigo nao deixava ver.
 */
export function motivoDeOrigemRecusada(origin: unknown): string {
  const valor = String(origin ?? "").trim();
  if (valor === "null") {
    return "Origin: null — pagina aberta via file://, iframe com sandbox sem allow-same-origin, ou data: URL. Nao e cliente de API: cliente sem navegador nao manda Origin e passa liberado.";
  }
  if (/^https?:\/\/localhost(:\d+)?$/i.test(valor)) {
    return "localhost em porta fora da lista permitida — conferir a porta do dev server.";
  }
  if (/^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(valor)) {
    return "origem por IP, nao por dominio — acesso direto ao host em vez do dominio publicado.";
  }
  if (/^http:\/\//i.test(valor)) {
    return "origem em http sem TLS — so localhost e aceito sem https.";
  }
  if (!valor) return "origem vazia depois do trim.";
  return "dominio fora da lista permitida.";
}
