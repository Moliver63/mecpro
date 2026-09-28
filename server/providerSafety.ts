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
    .replace(/\b(?:sk-|ghp_|github_pat_)[\w-]+/g, "[REDACTED]")
    .replace(/(api[_-]?key\s*[:=]\s*['"]?)[^\s'"&,}]+/gi, "$1[REDACTED]");

  // Valores longos o bastante pra nao colidir com texto comum.
  for (const nome of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
    const valor = String(process.env[nome] || "").trim();
    if (valor.length >= 16) {
      saida = saida.replace(new RegExp(escaparRegex(valor), "g"), "[REDACTED]");
    }
  }

  return saida;
}

// Rejected credentials stay disabled until restart/configuration replacement.
export class GeminiCredentialHealth {
  private rejected = new Set<string>();

  available(key: string): boolean {
    return !this.rejected.has(key);
  }

  reject(key: string, status: number, error: unknown): boolean {
    const message = typeof error === "string" ? error : JSON.stringify(error ?? {});
    if (status !== 401 && !/CONSUMER_SUSPENDED|API_KEY_INVALID|UNAUTHENTICATED|has been suspended|api key not valid|api key.*(?:expired|invalid)/i.test(message)) {
      return false;
    }
    this.rejected.add(key);
    return true;
  }
}
