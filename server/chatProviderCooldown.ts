/**
 * Espera curta quando o MODELO esta indisponivel (nao a chave).
 *
 * Achado real (logs de 15 e 16/10): em toda troca de chat observada nos dois
 * dias, o Gemini caiu pro Cloudflare. Dois modos:
 *
 *   15:47:51  503 "This model is currently experiencing high demand"   (~2s)
 *   15:46:56  "This operation was aborted"                             (31s)
 *
 * O segundo e o `TIMEOUT_GEMINI_MS = 30_000` cortando socket pendurado — a
 * correcao de 08/10 funcionando, e ainda assim 30 segundos de espera antes da
 * primeira palavra. Pagar isso UMA vez e o preco de descobrir; pagar em cada
 * mensagem seguinte, sabendo que o modelo esta fora, e desperdicio.
 *
 * Isto nao decide qual provedor deve ser o primario — essa e decisao de
 * produto, do Michel. Só torna o fallback que ja existe mais barato: depois de
 * uma falha de MODELO, pula o Gemini por uma janela curta e vai direto pro
 * Cloudflare; passada a janela, tenta de novo sozinho.
 *
 * Por que classe propria em vez de reusar `BillingCooldown`: aquela hasheia a
 * chave porque a chave E uma API key, e a duracao dela (15 min) e de problema
 * de saldo. Aqui a chave e o nome do modelo, que nao e segredo, e a janela e
 * curta de proposito. Mesma forma, motivos diferentes.
 */

/**
 * O erro e de MODELO fora do ar, ou de outra coisa?
 *
 * Deliberadamente estreito. Fica de fora:
 *  - 401/403 → problema da chave, e a rotacao do pool ja trata
 *  - 400 → problema da requisicao; outra tentativa da igual
 *  - 429 → limite de taxa, que a rotacao de chave tambem cobre
 *
 * Pular o Gemini por um erro dessas classes esconderia um defeito nosso atras
 * de um fallback silencioso.
 */
export function modeloIndisponivel(erro: unknown): boolean {
  const texto = String((erro as { message?: string })?.message ?? erro ?? "");
  if (!texto) return false;
  // 503/UNAVAILABLE: o proprio corpo da resposta diz "try again later".
  if (/"code"\s*:\s*503|\bUNAVAILABLE\b|high demand/i.test(texto)) return true;
  // Socket pendurado cortado pelo nosso teto, ou undici desistindo sozinho.
  if (/operation was aborted|AbortError|TimeoutError|fetch failed/i.test(texto)) return true;
  return false;
}

export class EsperaDeModelo {
  private ate = new Map<string, number>();

  constructor(
    private readonly agora: () => number = Date.now,
    /**
     * 90s: o 503 do Gemini se descreve como pico temporario, entao a janela
     * precisa ser curta pra nao abandonar o primario quando ele volta. Longa o
     * suficiente pra nao pagar os 30s de socket pendurado em cada mensagem
     * dentro de uma mesma conversa.
     */
    private readonly duracaoMs = 90_000,
  ) {}

  bloquear(modelo: string): void {
    this.ate.set(modelo, this.agora() + this.duracaoMs);
  }

  disponivel(modelo: string): boolean {
    const ate = this.ate.get(modelo);
    if (ate === undefined) return true;
    if (ate <= this.agora()) { this.ate.delete(modelo); return true; }
    return false;
  }

  /** Segundos restantes, só para o log dizer quanto falta. */
  segundosRestantes(modelo: string): number {
    const ate = this.ate.get(modelo);
    if (ate === undefined) return 0;
    return Math.max(0, Math.ceil((ate - this.agora()) / 1000));
  }
}

/** Instancia do processo. Em memoria de proposito: estado de minutos, nao de dias. */
export const esperaDeModeloGemini = new EsperaDeModelo();
