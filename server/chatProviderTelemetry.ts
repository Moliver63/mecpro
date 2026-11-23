import { randomUUID } from "node:crypto";

/**
 * Observabilidade da cadeia de provedores de IA do chat.
 *
 * Motivo (23/11): o log so dizia quais provedores FALHARAM; quando o chat respondia 200 nao havia como
 * saber qual provedor atendeu, em quanto tempo, nem se houve fallback. Cada atendimento ganha um
 * `requestId` e cada tentativa vira um evento estruturado.
 *
 * Seguranca por construcao: o evento e montado so com campos de uma LISTA FIXA e valores curtos de
 * vocabulario fechado (ids de provedor/modelo, enum de resultado, codigo de erro enumerado, numeros).
 * Mensagem de erro, prompt, resposta, usuario, e-mail, token e chave nunca entram: o erro e reduzido a um codigo.
 * A telemetria e passiva: falha ao registrar nunca interrompe nem altera o atendimento ou as ferramentas.
 */

export type ResultadoDaTentativa = "ok" | "falha" | "pulado" | "sem_tempo";

export type CodigoDeErro =
  | "http_400" | "http_401" | "http_402" | "http_403" | "http_404" | "http_408" | "http_410" | "http_413" | "http_422" | "http_429"
  | "http_5xx" | "timeout" | "rede" | "cota" | "modelo_indisponivel" | "contexto_grande" | "credencial" | "sem_resposta" | "desconhecido";

export type EventoDeTentativa = {
  requestId: string;
  provedor: string;
  modelo: string;
  tentativa: number;
  resultado: ResultadoDaTentativa;
  ms: number;
  codigoErro?: CodigoDeErro;
  /** true: esta tentativa so aconteceu porque um provedor anterior falhou ou foi pulado. */
  fallback: boolean;
};

export type ResumoDoAtendimento = {
  requestId: string;
  resultado: "ok" | "falha_total";
  provedorFinal: string | null;
  modeloFinal: string | null;
  tentativas: number;
  fallback: boolean;
  totalMs: number;
};

export const novoRequestId = (): string => randomUUID().replace(/-/g, "").slice(0, 16);

/** Reduz qualquer erro a um codigo de vocabulario fechado. Nunca devolve texto do erro. */
export function codigoDoErro(erro: unknown): CodigoDeErro {
  const t = String((erro as { message?: string })?.message ?? erro ?? "");
  const http = t.match(/\bHTTP (\d{3})\b/) ?? t.match(/"code"\s*:\s*(\d{3})/) ?? t.match(/\bstatus(?:Code)?["':= ]+(\d{3})\b/i) ?? t.match(/^\s*(\d{3})\b/);
  const status = Number((erro as { status?: unknown })?.status) || (http ? Number(http[1]) : 0);
  if (/chat_context_too_large/i.test(t)) return "contexto_grande";
  if (/aborted|timeout|timed out|ETIMEDOUT/i.test(t)) return "timeout";
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed|socket hang up|network/i.test(t) && !status) return "rede";
  if (/quota|RESOURCE_EXHAUSTED|rate.?limit/i.test(t) && (!status || status === 429)) return status === 429 ? "http_429" : "cota";
  if (/deprecated|model.*(?:unavailable|not found)|UNAVAILABLE|overloaded|high demand/i.test(t) && (!status || status >= 500 || status === 410)) return status === 410 ? "http_410" : "modelo_indisponivel";
  if (/api key|credential|unauthenticated|permission denied on the service/i.test(t) && !status) return "credencial";
  if (/sem resposta|empty response|resposta vazia|sem choices/i.test(t)) return "sem_resposta";
  if (status) {
    const conhecidos = [400, 401, 402, 403, 404, 408, 410, 413, 422, 429];
    if (conhecidos.includes(status)) return `http_${status}` as CodigoDeErro;
    if (status >= 500) return "http_5xx";
  }
  return "desconhecido";
}

const RESULTADOS = new Set<ResultadoDaTentativa>(["ok", "falha", "pulado", "sem_tempo"]);
const curto = (v: unknown, n: number) => String(v ?? "").slice(0, n).replace(/[^\w/.:\-]/g, "_");

/** Monta o evento so com campos permitidos (a "lista fixa" que os testes de seguranca verificam). */
export function montarEvento(e: EventoDeTentativa): EventoDeTentativa {
  const saida: EventoDeTentativa = {
    requestId: curto(e.requestId, 24), provedor: curto(e.provedor, 24), modelo: curto(e.modelo, 80),
    tentativa: Math.max(0, Math.floor(Number(e.tentativa) || 0)),
    resultado: RESULTADOS.has(e.resultado) ? e.resultado : "falha",
    ms: Math.max(0, Math.round(Number(e.ms) || 0)),
    fallback: e.fallback === true,
  };
  if (e.codigoErro) saida.codigoErro = e.codigoErro;
  return saida;
}

export type Emissor = { info: (area: string, msg: string, meta: Record<string, unknown>) => void; warn: (area: string, msg: string, meta: Record<string, unknown>) => void };

/** Escreve o evento no log. Nunca lanca: observabilidade nao pode derrubar o chat. */
export function registrarTentativa(emissor: Emissor, e: EventoDeTentativa): void {
  try {
    const ev = montarEvento(e);
    (ev.resultado === "ok" ? emissor.info : emissor.warn)("chat-ia", `tentativa ${ev.provedor} ${ev.resultado}`, ev);
  } catch { /* passivo */ }
}

export function registrarResumo(emissor: Emissor, r: ResumoDoAtendimento): void {
  try {
    const s = {
      requestId: curto(r.requestId, 24), resultado: r.resultado === "ok" ? "ok" : "falha_total",
      provedorFinal: r.provedorFinal ? curto(r.provedorFinal, 24) : null, modeloFinal: r.modeloFinal ? curto(r.modeloFinal, 80) : null,
      tentativas: Math.max(0, Math.floor(r.tentativas)), fallback: r.fallback === true, totalMs: Math.max(0, Math.round(r.totalMs)),
    };
    (s.resultado === "ok" ? emissor.info : emissor.warn)("chat-ia", `atendimento ${s.resultado}`, s);
  } catch { /* passivo */ }
}
