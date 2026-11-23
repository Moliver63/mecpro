// Tokens da Cloudflare nao tem prefixo reconhecivel (sao alfanumericos com
// - e _), entao nao da pra criar um padrao generico sem redigir texto legitimo
// por engano. A alternativa segura e redigir o valor EXATO da variavel de
// ambiente quando ele aparecer no texto — precisao total, zero falso positivo.
function escaparRegex(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactProviderSecrets(text: string): string {
  let saida = text
    .replace(/AIza[\w-]+/g, "[REDACTED]")
    .replace(/\b(?:sk-|ghp_|github_pat_|hf_)[\w-]+/g, "[REDACTED]")
    .replace(/(api[_-]?key\s*[:=]\s*['"]?)[^\s'"&,}]+/gi, "$1[REDACTED]");

  // Valores longos o bastante pra nao colidir com texto comum.
  for (const nome of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "HUGGINGFACE_API_KEY"]) {
    const valor = String(process.env[nome] || "").trim();
    if (valor.length >= 16) {
      saida = saida.replace(new RegExp(escaparRegex(valor), "g"), "[REDACTED]");
    }
  }

  return saida;
}

// Rejected credentials stay disabled until restart/configuration replacement.
// 403 PERMISSION_DENIED / ACCESS_DENIED ("Permission denied on the service") e diferente:
// pode ser a chave sem a API habilitada, mas tambem projeto em revisao ou bloqueio de regiao,
// que passam. Por isso a chave sai da rotacao por uma janela (30 min), nao ate o reinicio, e a
// chamada segue para a proxima chave do pool em vez de derrubar o provedor inteiro.
export class GeminiCredentialHealth {
  private rejected = new Set<string>();
  private negadas = new Map<string, number>();
  constructor(private now: () => number = Date.now, private negadaMs = 30 * 60_000) {}

  available(key: string): boolean {
    if (this.rejected.has(key)) return false;
    const ate = this.negadas.get(key);
    if (ate === undefined) return true;
    if (ate <= this.now()) { this.negadas.delete(key); return true; }
    return false;
  }

  reject(key: string, status: number, error: unknown): boolean {
    const message = typeof error === "string" ? error : JSON.stringify(error ?? {});
    if (status !== 401 && !/CONSUMER_SUSPENDED|API_KEY_INVALID|UNAUTHENTICATED|has been suspended|api key not valid|api key.*(?:expired|invalid)/i.test(message)) {
      // So o 403 de SERVICO (chave/projeto sem acesso a API). 403 de modelo ("Model permission denied") nao entra:
      // trocar de chave nao resolve e o teste de providerSafety exige que nao rejeite.
      if (/Permission denied on the service|ACCESS_DENIED|SERVICE_DISABLED/i.test(message)) {
        this.negadas.set(key, this.now() + this.negadaMs);
        return true;
      }
      return false;
    }
    this.rejected.add(key);
    return true;
  }
}
