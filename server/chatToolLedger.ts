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
type Item = { chave: string; usuarioFerramenta: string; registro: Registro; tentativa: number; consumidoNaTentativa: number | null };

/**
 * Livro de UM atendimento. `tentativa` sobe a cada provedor de IA iniciado:
 *  - repeticao vinda de OUTRA tentativa (provedor novo refazendo o turno) devolve o
 *    resultado guardado, na mesma ordem em que foi executado;
 *  - dentro da MESMA tentativa so a ultima execucao bem-sucedida da ferramenta vale
 *    como repeticao; A(100), B(200), A(100) executa o terceiro, porque e um pedido novo.
 */
export class LivroDeFerramentas {
  itens: Item[] = [];
  tentativa = 0;
  novaTentativa(): void { this.tentativa++; }
}
export const novoLivro = () => new LivroDeFerramentas();

export const toolLedger = new AsyncLocalStorage<LivroDeFerramentas>();

/** Chamado pela cadeia antes de cada provedor; sem atendimento ativo nao faz nada. */
export function iniciarNovaTentativaDoLivro(): void { toolLedger.getStore()?.novaTentativa(); }

/** Ferramentas que mudam algo (dados, Meta, custo). Consultas ficam de fora. */
export const FERRAMENTAS_COM_EFEITO = new Set([
  "gerar_campanha", "atualizar_orcamento_campanha", "definir_foto_destaque", "editar_criativo",
  "aprovar_revisao_criativo", "anexar_video_criativo", "selecionar_conta_meta", "publicar_campanha", "publicar_no_tiktok",
  "gerar_imagem", "gerar_imagem_campanha", "adaptar_video",
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
  return toolLedger.run(novoLivro(), executar);
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
  const usuarioFerramenta = `${userId}|${nome}`;
  const chave = `${usuarioFerramenta}|${chaveEstavel(chaveDosArgs !== undefined ? chaveDosArgs : args)}`;
  const marcar = (r: unknown) => (r && typeof r === "object" ? { ...(r as object), jaExecutadoNesteAtendimento: true } as T : r as T);

  // Chamada identica em andamento: espera a primeira em vez de duplicar.
  const emAndamento = livro.itens.find((i) => i.chave === chave && i.registro.ok === null);
  if (emAndamento) {
    const r = await emAndamento.registro.resultado as T;
    return emAndamento.registro.ok === true ? marcar(r) : r;
  }
  // Reexecucao por outro provedor: consome, em ordem, o que a tentativa anterior ja fez.
  const repeticao = livro.itens.find((i) => i.chave === chave && i.registro.ok === true && i.tentativa < livro.tentativa && i.consumidoNaTentativa !== livro.tentativa);
  if (repeticao) { repeticao.consumidoNaTentativa = livro.tentativa; return marcar(await repeticao.registro.resultado as T); }
  // Mesma tentativa: so a ultima execucao bem-sucedida da ferramenta conta como repeticao.
  const ultima = [...livro.itens].reverse().find((i) => i.usuarioFerramenta === usuarioFerramenta && i.registro.ok === true);
  if (ultima && ultima.chave === chave && ultima.tentativa === livro.tentativa) return marcar(await ultima.registro.resultado as T);

  const registro: Registro = { resultado: undefined as any, ok: null };
  registro.resultado = run().then((r) => { registro.ok = sucesso(r); return r; }, (e) => { registro.ok = false; throw e; });
  const item: Item = { chave, usuarioFerramenta, registro, tentativa: livro.tentativa, consumidoNaTentativa: null };
  livro.itens.push(item);
  try {
    return await registro.resultado as T;
  } catch (e) {
    throw e;
  }
}
