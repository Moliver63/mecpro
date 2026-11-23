/**
 * Provedor fora por motivo que nao passa em segundos: saldo acabou (402), modelo aposentado
 * (410), credencial negada (401/403). Repetir a chamada em toda mensagem so gasta tempo do
 * usuario (log de 23/11: DeepSeek 402 e Cloudflare 410 pagos a cada conversa).
 *
 * - 402 (saldo): espera 15, 30, 60 e 120 min; cada nova sondagem que falha dobra a espera.
 *   Nunca tenta contornar a falta de saldo, so para de insistir.
 * - 410 (modelo aposentado) e 401/403: 60 e 30 min, ate alguem corrigir a configuracao.
 * - Um sucesso zera o provedor. Passada a espera, a proxima mensagem e a sondagem.
 *
 * Estado em memoria, por instancia (como a saude dos provedores).
 */
export type MotivoDeQueda = "saldo" | "aposentado" | "acesso";

export function classificarQueda(erro: unknown): MotivoDeQueda | null {
  const t = String((erro as { message?: string })?.message ?? erro ?? "");
  if (/\bHTTP 402\b|Insufficient Balance|insufficient[_ ]quota|payment required/i.test(t)) return "saldo";
  if (/\bHTTP 410\b|\b5028\b|has been deprecated|Model has been deprecated/i.test(t)) return "aposentado";
  if (/\bHTTP 40[13]\b/i.test(t)) return "acesso";
  return null;
}

const BASE_MIN: Record<MotivoDeQueda, number> = { saldo: 15, aposentado: 60, acesso: 30 };
const TETO_MIN = 120;

type Estado = { ate: number; motivo: MotivoDeQueda; seguidas: number };

export class QuedaDeProvedor {
  private estados = new Map<string, Estado>();
  constructor(private agora: () => number = Date.now) {}

  registrar(id: string, erro: unknown): MotivoDeQueda | null {
    const motivo = classificarQueda(erro);
    if (!motivo) return null;
    const anterior = this.estados.get(id);
    const seguidas = anterior && anterior.motivo === motivo ? anterior.seguidas + 1 : 1;
    const minutos = Math.min(BASE_MIN[motivo] * 2 ** (seguidas - 1), TETO_MIN);
    this.estados.set(id, { ate: this.agora() + minutos * 60_000, motivo, seguidas });
    return motivo;
  }

  sucesso(id: string): void { this.estados.delete(id); }

  /** null quando pode tentar; texto para o log da cadeia quando deve ser pulado. */
  motivo(id: string): string | null {
    const e = this.estados.get(id);
    if (!e) return null;
    const restante = e.ate - this.agora();
    if (restante <= 0) return null; // janela vencida: a proxima chamada e a sondagem (o estado fica para escalar se falhar)
    const min = Math.ceil(restante / 60_000);
    const texto = e.motivo === "saldo" ? "saldo insuficiente (402)" : e.motivo === "aposentado" ? "modelo aposentado (410)" : "credencial negada (401/403)";
    return `${texto}; nao sera chamado por mais ${min} min`;
  }
}

export const quedaDeProvedor = new QuedaDeProvedor();

/** Envolve a chamada de um provedor: sucesso zera a queda; falha de saldo/aposentado/acesso a registra. */
export function envolverComQueda<T>(queda: QuedaDeProvedor, id: string, fn: () => Promise<T>): () => Promise<T> {
  return async () => {
    try { const r = await fn(); queda.sucesso(id); return r; }
    catch (erro) { queda.registrar(id, erro); throw erro; }
  };
}
