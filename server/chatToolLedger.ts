// Livro de ferramentas executadas no atendimento (uma mensagem do usuario).
//
// Auditoria 23/11 (F4): cada provedor (Gemini, Cloudflare, DeepSeek, Groq,
// OpenRouter) tem o seu proprio laco de ferramentas. Quando um provedor executa
// uma ferramenta com efeito (atualizar orcamento, anexar video, publicar...) e
// falha na rodada seguinte, o proximo provedor recomeca da mesma mensagem e
// pode chamar a mesma ferramenta de novo. `gerar_campanha` ja tinha
// idempotencia propria; as demais nao.
//
// Regra: dentro de UM atendimento, uma ferramenta com efeito que ja teve
// SUCESSO com os mesmos argumentos devolve o resultado guardado em vez de
// executar de novo. Falha (erro, ok:false) nao e guardada: tentar de novo e
// legitimo. Chamada simultanea identica espera a primeira, em vez de duplicar.
import { AsyncLocalStorage } from "node:async_hooks";

type Registro = { resultado: Promise<unknown>; ok: boolean | null };

export const toolLedger = new AsyncLocalStorage<Map<string, Registro>>();

/** Ferramentas que mudam algo (dados, Meta, custo). Consultas ficam de fora. */
export const FERRAMENTAS_COM_EFEITO = new Set([
  "gerar_campanha", "atualizar_orcamento_campanha", "definir_foto_destaque", "editar_criativo",
  "aprovar_revisao_criativo", "anexar_video_criativo", "selecionar_conta_meta", "publicar_campanha",
  "gerar_imagem", "gerar_imagem_campanha",
]);

export function chaveEstavel(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor) ?? "undefined";
  if (Array.isArray(valor)) return `[${valor.map(chaveEstavel).join(",")}]`;
  const o = valor as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${chaveEstavel(o[k])}`).join(",")}}`;
}

function sucesso(resultado: unknown): boolean {
  if (!resultado || typeof resultado !== "object") return false;
  const r = resultado as Record<string, unknown>;
  return !("erro" in r && r.erro) && r.ok !== false && r.confirmationRequired !== true;
}

export function comLivroDeFerramentas<T>(executar: () => Promise<T>): Promise<T> {
  return toolLedger.run(new Map(), executar);
}

/**
 * Executa `run` uma vez por (usuario, ferramenta, argumentos) enquanto der certo.
 * `chaveDosArgs` permite colapsar ferramentas em que so a existencia importa
 * (gerar_campanha: um rascunho por atendimento, mesmo que o modelo mude o texto).
 */
export async function executarUmaVez<T>(
  userId: number, nome: string, args: unknown, run: () => Promise<T>, chaveDosArgs?: unknown,
): Promise<T> {
  const livro = toolLedger.getStore();
  if (!livro || !FERRAMENTAS_COM_EFEITO.has(nome)) return run();
  const chave = `${userId}|${nome}|${chaveEstavel(chaveDosArgs !== undefined ? chaveDosArgs : args)}`;
  const anterior = livro.get(chave);
  if (anterior && anterior.ok !== false) {
    const guardado = await anterior.resultado as T;
    if (anterior.ok === true && guardado && typeof guardado === "object") {
      return { ...(guardado as object), jaExecutadoNesteAtendimento: true } as T;
    }
    if (anterior.ok === null) return guardado; // a simultanea terminou com falha: o resultado ja diz isso
  }
  const registro: Registro = { resultado: undefined as any, ok: null };
  registro.resultado = run().then((r) => { registro.ok = sucesso(r); return r; }, (e) => { registro.ok = false; throw e; });
  livro.set(chave, registro);
  try {
    const r = await registro.resultado as T;
    if (!registro.ok) livro.delete(chave);
    return r;
  } catch (e) {
    livro.delete(chave);
    throw e;
  }
}
