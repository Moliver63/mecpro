export function redactProviderSecrets(text: string): string {
  return text
    .replace(/AIza[\w-]+/g, "[REDACTED]")
    .replace(/\b(?:sk-|ghp_|github_pat_)[\w-]+/g, "[REDACTED]")
    .replace(/(api[_-]?key\s*[:=]\s*['"]?)[^\s'"&,}]+/gi, "$1[REDACTED]");
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
