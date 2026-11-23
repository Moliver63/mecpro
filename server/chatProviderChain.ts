// Cadeia de provedores de IA do chat: saude compartilhada, teto de tempo e
// motivo de cada pulo/falha.
//
// Auditoria 23/11 (F4): so o Gemini tinha janela de espera apos falha de modelo;
// Cloudflare, DeepSeek, Groq e OpenRouter pagavam o proprio timeout em TODA
// mensagem, e o tempo total era a soma de todos. Aqui:
//  - toda falha de MODELO (503, socket pendurado, timeout) abre uma janela curta
//    para aquele provedor, nao so a do Gemini;
//  - o atendimento tem um teto de tempo: passado o teto, nao inicia mais
//    provedores novos (um provedor em andamento nao e cortado aqui);
//  - cada provedor e tentado no maximo UMA vez por mensagem;
//  - o resultado diz por que cada um ficou de fora, para a mensagem ao usuario
//    e para o log.
import { modeloIndisponivel } from "./chatProviderCooldown";
import { codigoDoErro, type EventoDeTentativa, type ResumoDoAtendimento } from "./chatProviderTelemetry";

export type Provedor<R> = {
  id: string;
  /** Modelo usado (so para observabilidade; vocabulario fechado, nunca segredo). */
  modelo?: () => string;
  /** null = pode tentar; texto = motivo de nao tentar (nao configurado, saldo, etc.). */
  indisponivelPorque: () => string | null;
  tentar: () => Promise<R>;
};

export type FalhaDeProvedor = { id: string; motivo: "pulado" | "falhou" | "sem_tempo"; detalhe: string };

export type ResultadoDaCadeia<R> =
  | { ok: true; resultado: R; provedor: string; falhas: FalhaDeProvedor[] }
  | { ok: false; falhas: FalhaDeProvedor[]; esgotouTempo: boolean };

export const TETO_DE_TEMPO_DA_CADEIA_MS = 75_000;

/** Classe da falha: so "modelo" e "limite" contam para abrir o circuito; erro de requisicao nunca conta. */
export type ClasseDaFalha = "modelo" | "limite" | "requisicao";

export function classificarFalha(erro: unknown): ClasseDaFalha {
  const texto = String((erro as { message?: string })?.message ?? erro ?? "");
  if (modeloIndisponivel(erro)) return "modelo";
  if (/\b429\b|rate.?limit|too many requests|quota|RESOURCE_EXHAUSTED/i.test(texto)) return "limite";
  return "requisicao";
}

/** Segundos pedidos pelo provedor ("retry-after: 20", "retryDelay: 20s", "try again in 20s"), limitados a 5 min. */
export function esperaSugeridaPeloProvedorMs(erro: unknown): number | null {
  const texto = String((erro as { message?: string })?.message ?? erro ?? "");
  const m = texto.match(/retry[- ]?after\D{0,4}(\d{1,4})|retryDelay\D{0,4}(\d{1,4})|try again in\s+(\d{1,4})\s*s/i);
  const seg = Number(m?.[1] ?? m?.[2] ?? m?.[3]);
  return Number.isFinite(seg) && seg > 0 ? Math.min(seg, 300) * 1000 : null;
}

type Circuito = {
  falhas: Array<{ t: number; usuario: string }>;
  abertoAte: number;
  /** Uma sonda por vez depois que a espera acaba (meio-aberto). */
  sondaAte: number;
};

export type OpcoesDeSaude = {
  duracaoMs?: number;
  /** Falhas (de usuarios distintos) na janela para abrir o circuito. */
  falhasParaAbrir?: number;
  usuariosDistintos?: number;
  janelaDeContagemMs?: number;
  sondaMs?: number;
};

/**
 * Circuito por provedor, compartilhado entre os usuarios da instancia.
 *
 * Revisao final 23/11: uma unica falha (ex.: timeout de uma mensagem enorme de UM usuario)
 * tirava o provedor de todos por 90 s. Agora:
 *  - so falha de MODELO (503, socket pendurado) ou LIMITE (429/quota) conta; 400/413/politica nunca;
 *  - o circuito abre com `falhasParaAbrir` falhas de pelo menos `usuariosDistintos` usuarios
 *    diferentes dentro da janela: o mesmo usuario insistindo nao derruba o provedor dos outros;
 *  - se o provedor informa quanto esperar (Retry-After), a espera usa esse valor (max. 5 min);
 *  - passada a espera, o circuito fica MEIO-ABERTO: so UMA requisicao testa (sonda); as concorrentes
 *    seguem para o proximo provedor, sem estourar o provedor que acabou de voltar;
 *  - um sucesso fecha o circuito e zera as falhas.
 * Estado em memoria, por instancia: com varias instancias cada uma aprende por conta propria
 * (um estado compartilhado exigiria Redis ou tabela, fora do escopo sem migracao).
 */
export class SaudeDosProvedores {
  private circuitos = new Map<string, Circuito>();
  private readonly duracaoMs: number;
  private readonly falhasParaAbrir: number;
  private readonly usuariosDistintos: number;
  private readonly janela: number;
  private readonly sondaMs: number;
  constructor(private readonly agora: () => number = Date.now, duracaoOuOpcoes: number | OpcoesDeSaude = 90_000) {
    const o: OpcoesDeSaude = typeof duracaoOuOpcoes === "number" ? { duracaoMs: duracaoOuOpcoes } : duracaoOuOpcoes;
    this.duracaoMs = o.duracaoMs ?? 90_000;
    this.falhasParaAbrir = o.falhasParaAbrir ?? 3;
    this.usuariosDistintos = o.usuariosDistintos ?? 2;
    this.janela = o.janelaDeContagemMs ?? 30_000;
    this.sondaMs = o.sondaMs ?? 20_000;
  }
  private c(id: string): Circuito {
    let x = this.circuitos.get(id);
    if (!x) { x = { falhas: [], abertoAte: 0, sondaAte: 0 }; this.circuitos.set(id, x); }
    return x;
  }

  /** Chamada antes de tentar o provedor. "sonda": este pedido testa a recuperacao. */
  reservar(id: string): "livre" | "sonda" | "bloqueado" {
    const x = this.c(id); const t = this.agora();
    if (x.abertoAte === 0) return "livre";
    if (t < x.abertoAte) return "bloqueado";
    if (t < x.sondaAte) return "bloqueado"; // ja ha uma sonda em andamento
    x.sondaAte = t + this.sondaMs;
    return "sonda";
  }
  disponivel(id: string): boolean { return this.c(id).abertoAte === 0 || this.agora() >= this.c(id).abertoAte; }
  segundosRestantes(id: string): number { return Math.max(0, Math.ceil((this.c(id).abertoAte - this.agora()) / 1000)); }

  /** Libera a vaga de sonda sem veredito (erro de requisicao ou sem tempo para tentar). */
  liberarSonda(id: string): void { const x = this.circuitos.get(id); if (x) x.sondaAte = 0; }

  registrarFalha(id: string, erro: unknown, usuario?: number | string, eraSonda = false): void {
    const classe = classificarFalha(erro);
    if (classe === "requisicao") { if (eraSonda) this.liberarSonda(id); return; }
    const x = this.c(id); const t = this.agora();
    // Falha da sonda: reabre por mais uma janela. Falha tardia de pedido antigo nao reabre.
    if (eraSonda) {
      x.abertoAte = t + (esperaSugeridaPeloProvedorMs(erro) ?? this.duracaoMs); x.sondaAte = 0; return;
    }
    x.falhas = x.falhas.filter((f) => t - f.t <= this.janela);
    x.falhas.push({ t, usuario: usuario === undefined ? "anonimo" : String(usuario) });
    const distintos = new Set(x.falhas.map((f) => f.usuario)).size;
    const retry = esperaSugeridaPeloProvedorMs(erro);
    // Limite (429/quota) e da chave compartilhada do servidor: um unico aviso ja vale para todos.
    if (classe === "limite" || (x.falhas.length >= this.falhasParaAbrir && distintos >= this.usuariosDistintos)) {
      x.abertoAte = t + (retry ?? this.duracaoMs); x.sondaAte = 0; x.falhas = [];
    }
  }
  registrarSucesso(id: string): void {
    const x = this.circuitos.get(id);
    if (!x) return;
    x.falhas = []; x.abertoAte = 0; x.sondaAte = 0;
  }
}

export const saudeDosProvedores = new SaudeDosProvedores();

export async function executarCadeia<R>(
  provedores: Array<Provedor<R>>,
  opcoes: { saude?: SaudeDosProvedores; agora?: () => number; tetoMs?: number; aoRegistrar?: (e: { id: string; evento: string; detalhe: string }) => void; aoIniciarProvedor?: (id: string) => void; usuario?: number | string;
  /** Observabilidade passiva: um evento por tentativa e um resumo no fim. Erros aqui sao engolidos. */
  telemetria?: { requestId: string; aoTentativa: (e: EventoDeTentativa) => void; aoConcluir: (r: ResumoDoAtendimento) => void } } = {},
): Promise<ResultadoDaCadeia<R>> {
  const saude = opcoes.saude ?? saudeDosProvedores;
  const agora = opcoes.agora ?? Date.now;
  const teto = opcoes.tetoMs ?? TETO_DE_TEMPO_DA_CADEIA_MS;
  const inicio = agora();
  const falhas: FalhaDeProvedor[] = [];
  const log = opcoes.aoRegistrar ?? (() => {});
  let esgotouTempo = false;
  const tel = opcoes.telemetria;
  let tentativaN = 0; let houveFalhaAntes = false;
  const modeloDe = (p: Provedor<R>) => { try { return p.modelo?.() ?? ""; } catch { return ""; } };
  const emitir = (p: Provedor<R>, resultado: EventoDeTentativa["resultado"], ms: number, erro?: unknown) => {
    if (!tel) return;
    try { tel.aoTentativa({ requestId: tel.requestId, provedor: p.id, modelo: modeloDe(p), tentativa: ++tentativaN, resultado, ms, fallback: houveFalhaAntes, ...(erro !== undefined ? { codigoErro: codigoDoErro(erro) } : {}) }); } catch { /* passivo */ }
  };
  const concluir = (resultado: "ok" | "falha_total", p?: Provedor<R>) => {
    if (!tel) return;
    try { tel.aoConcluir({ requestId: tel.requestId, resultado, provedorFinal: p?.id ?? null, modeloFinal: p ? modeloDe(p) : null, tentativas: tentativaN, fallback: houveFalhaAntes, totalMs: agora() - inicio }); } catch { /* passivo */ }
  };
  for (const p of provedores) {
    const motivo = p.indisponivelPorque();
    if (motivo) { falhas.push({ id: p.id, motivo: "pulado", detalhe: motivo }); log({ id: p.id, evento: "pulado", detalhe: motivo }); emitir(p, "pulado", 0); houveFalhaAntes = true; continue; }
    const reserva = saude.reservar(p.id);
    if (reserva === "bloqueado") {
      const restante = saude.segundosRestantes(p.id);
      const d = restante > 0 ? `em espera curta apos falhas de varios usuarios (${restante}s)` : "outro atendimento esta testando a recuperacao do provedor";
      falhas.push({ id: p.id, motivo: "pulado", detalhe: d }); log({ id: p.id, evento: "pulado", detalhe: d }); emitir(p, "pulado", 0); houveFalhaAntes = true; continue;
    }
    if (agora() - inicio >= teto) {
      esgotouTempo = true;
      if (reserva === "sonda") saude.liberarSonda(p.id);
      falhas.push({ id: p.id, motivo: "sem_tempo", detalhe: "teto de tempo do atendimento atingido" });
      log({ id: p.id, evento: "sem_tempo", detalhe: "teto de tempo do atendimento atingido" });
      emitir(p, "sem_tempo", 0); houveFalhaAntes = true;
      continue;
    }
    const t0 = agora();
    try {
      opcoes.aoIniciarProvedor?.(p.id);
      const resultado = await p.tentar();
      saude.registrarSucesso(p.id);
      emitir(p, "ok", agora() - t0); concluir("ok", p);
      return { ok: true, resultado, provedor: p.id, falhas };
    } catch (erro) {
      saude.registrarFalha(p.id, erro, opcoes.usuario, reserva === "sonda");
      const detalhe = String((erro as any)?.message ?? erro).slice(0, 200);
      falhas.push({ id: p.id, motivo: "falhou", detalhe });
      log({ id: p.id, evento: "falhou", detalhe });
      emitir(p, "falha", agora() - t0, erro); houveFalhaAntes = true;
    }
  }
  concluir("falha_total");
  return { ok: false, falhas, esgotouTempo };
}
