// Leitura dos cookies do GA4 (gtag), usada no navegador (checkout) e testada no
// servidor. Ver docs/specs/2026-11-15-asaas-ativacao-de-plano.md.

/** client_id do cookie _ga ("GA1.1.123.456" → "123.456"). */
export function clientIdDoCookieGa(valor: string | undefined | null): string | null {
  const partes = String(valor ?? "").split(".");
  if (partes.length < 4 || !/^GA\d$/.test(partes[0])) return null;
  const id = `${partes[partes.length - 2]}.${partes[partes.length - 1]}`;
  return /^\d+\.\d+$/.test(id) ? id : null;
}

/** session_id do cookie _ga_<ID> (formatos GS1.1.<sid>.… e GS2.1.s<sid>$…). */
export function sessionIdDoCookieGa(valor: string | undefined | null): string | null {
  const s = String(valor ?? "");
  const gs2 = s.match(/^GS2\.\d\.s(\d+)/);
  if (gs2) return gs2[1];
  const gs1 = s.match(/^GS1\.\d\.(\d+)\./);
  return gs1 ? gs1[1] : null;
}

/** Ids do GA4 a partir de document.cookie. Null sem GA (bloqueador, recusa). */
export function idsDoGa(cookies: string, measurementId = "G-JJ1H7MV9B7"): { clientId: string; sessionId?: string } | null {
  const mapa = new Map<string, string>();
  for (const parte of String(cookies || "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0) mapa.set(parte.slice(0, i).trim(), parte.slice(i + 1).trim());
  }
  const clientId = clientIdDoCookieGa(mapa.get("_ga"));
  if (!clientId) return null;
  const sessionId = sessionIdDoCookieGa(mapa.get(`_ga_${measurementId.replace(/^G-/, "")}`));
  return sessionId ? { clientId, sessionId } : { clientId };
}
