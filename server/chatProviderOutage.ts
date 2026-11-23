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
  // 401: credencial invalida vale para todos. 403 e ambiguo: pode ser a credencial/conta, mas tambem
  // moderacao de conteudo ou restricao de UM modelo/usuario. So conta como "acesso" com texto de credencial
  // e sem sinal de conteudo/politica; e ainda exige 2 usuarios distintos (ver `registrar`).
  if (/\bHTTP 401\b|\b401\b.*(?:unauthorized|invalid)/i.test(t)) return "acesso";
  if (/\bHTTP 403\b/i.test(t) && /api key|token|credential|authentication|unauthorized|account|forbidden/i.test(t)
      && !/moderat|flagged|content|policy|safety|model|region|country/i.test(t)) return "acesso";
  return null;
}

const BASE_MIN: Record<MotivoDeQueda, number> = { saldo: 15, aposentado: 60, acesso: 30 };
const TETO_MIN = 120;

type Estado = { ate: number; motivo: MotivoDeQueda; seguidas: number };
const JANELA_403_MS = 5 * 60_000;

export class QuedaDeProvedor {
  private estados = new Map<string, Estado>();
  constructor(private agora: () => number = Date.now) {}

  private quorum403 = new Map<string, Array<{ t: number; usuario: string }>>();

  registrar(id: string, erro: unknown, usuario?: number | string): MotivoDeQueda | null {
    const motivo = classificarQueda(erro);
    if (!motivo) return null;
    // 403: um usuario sozinho nao derruba o provedor dos outros; precisa de 2 usuarios distintos em 5 min.
    if (motivo === "acesso" && /\b403\b/.test(String((erro as { message?: string })?.message ?? erro))) {
      const t = this.agora();
      const lista = (this.quorum403.get(id) ?? []).filter((f) => t - f.t <= JANELA_403_MS);
      lista.push({ t, usuario: usuario === undefined ? "anonimo" : String(usuario) });
      this.quorum403.set(id, lista);
      if (new Set(lista.map((f) => f.usuario)).size < 2) return null;
      this.quorum403.delete(id);
    }
    const anterior = this.estados.get(id);
    const seguidas = anterior && anterior.motivo === motivo ? anterior.seguidas + 1 : 1;
    const minutos = Math.min(BASE_MIN[motivo] * 2 ** (seguidas - 1), TETO_MIN);
    this.estados.set(id, { ate: this.agora() + minutos * 60_000, motivo, seguidas });
    return motivo;
  }

  sucesso(id: string): void { this.estados.delete(id); this.quorum403.delete(id); }

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
export function envolverComQueda<T>(queda: QuedaDeProvedor, id: string, fn: () => Promise<T>, usuario?: number | string): () => Promise<T> {
  return async () => {
    try { const r = await fn(); queda.sucesso(id); return r; }
    catch (erro) { queda.registrar(id, erro, usuario); throw erro; }
  };
}
