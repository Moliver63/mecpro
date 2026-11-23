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
import { modeloIndisponivel, EsperaDeModelo } from "./chatProviderCooldown";

export type Provedor<R> = {
  id: string;
  /** null = pode tentar; texto = motivo de nao tentar (nao configurado, saldo, etc.). */
  indisponivelPorque: () => string | null;
  tentar: () => Promise<R>;
};

export type FalhaDeProvedor = { id: string; motivo: "pulado" | "falhou" | "sem_tempo"; detalhe: string };

export type ResultadoDaCadeia<R> =
  | { ok: true; resultado: R; provedor: string; falhas: FalhaDeProvedor[] }
  | { ok: false; falhas: FalhaDeProvedor[]; esgotouTempo: boolean };

export const TETO_DE_TEMPO_DA_CADEIA_MS = 75_000;

export class SaudeDosProvedores {
  private janelas = new Map<string, EsperaDeModelo>();
  constructor(private readonly agora: () => number = Date.now, private readonly duracaoMs = 90_000) {}
  private janela(id: string) {
    let j = this.janelas.get(id);
    if (!j) { j = new EsperaDeModelo(this.agora, this.duracaoMs); this.janelas.set(id, j); }
    return j;
  }
  // A saude e compartilhada entre usuarios: uma unica falha (um timeout de uma mensagem
  // enorme, por exemplo) nao pode tirar o provedor de todo mundo. Abre a janela quando
  // houve FALHAS_PARA_ABRIR falhas de modelo dentro de JANELA_DE_CONTAGEM_MS.
  private recentes = new Map<string, number[]>();
  static readonly FALHAS_PARA_ABRIR = 2;
  static readonly JANELA_DE_CONTAGEM_MS = 30_000;
  registrarFalha(id: string, erro: unknown): void {
    if (!modeloIndisponivel(erro)) return;
    const t = this.agora();
    const lista = (this.recentes.get(id) ?? []).filter((x) => t - x <= SaudeDosProvedores.JANELA_DE_CONTAGEM_MS);
    lista.push(t);
    this.recentes.set(id, lista);
    if (lista.length >= SaudeDosProvedores.FALHAS_PARA_ABRIR) { this.janela(id).bloquear(id); this.recentes.delete(id); }
  }
  disponivel(id: string): boolean { return this.janela(id).disponivel(id); }
  segundosRestantes(id: string): number { return this.janela(id).segundosRestantes(id); }
}

export const saudeDosProvedores = new SaudeDosProvedores();

export async function executarCadeia<R>(
  provedores: Array<Provedor<R>>,
  opcoes: { saude?: SaudeDosProvedores; agora?: () => number; tetoMs?: number; aoRegistrar?: (e: { id: string; evento: string; detalhe: string }) => void; aoIniciarProvedor?: (id: string) => void } = {},
): Promise<ResultadoDaCadeia<R>> {
  const saude = opcoes.saude ?? saudeDosProvedores;
  const agora = opcoes.agora ?? Date.now;
  const teto = opcoes.tetoMs ?? TETO_DE_TEMPO_DA_CADEIA_MS;
  const inicio = agora();
  const falhas: FalhaDeProvedor[] = [];
  const log = opcoes.aoRegistrar ?? (() => {});
  let esgotouTempo = false;
  for (const p of provedores) {
    const motivo = p.indisponivelPorque();
    if (motivo) { falhas.push({ id: p.id, motivo: "pulado", detalhe: motivo }); log({ id: p.id, evento: "pulado", detalhe: motivo }); continue; }
    if (!saude.disponivel(p.id)) {
      const d = `em espera curta apos falha recente (${saude.segundosRestantes(p.id)}s)`;
      falhas.push({ id: p.id, motivo: "pulado", detalhe: d }); log({ id: p.id, evento: "pulado", detalhe: d }); continue;
    }
    if (agora() - inicio >= teto) {
      esgotouTempo = true;
      falhas.push({ id: p.id, motivo: "sem_tempo", detalhe: "teto de tempo do atendimento atingido" });
      log({ id: p.id, evento: "sem_tempo", detalhe: "teto de tempo do atendimento atingido" });
      continue;
    }
    try {
      opcoes.aoIniciarProvedor?.(p.id);
      const resultado = await p.tentar();
      return { ok: true, resultado, provedor: p.id, falhas };
    } catch (erro) {
      saude.registrarFalha(p.id, erro);
      const detalhe = String((erro as any)?.message ?? erro).slice(0, 200);
      falhas.push({ id: p.id, motivo: "falhou", detalhe });
      log({ id: p.id, evento: "falhou", detalhe });
    }
  }
  return { ok: false, falhas, esgotouTempo };
}
