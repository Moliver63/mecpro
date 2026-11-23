/**
 * metaAdAccountChoice.ts — conta de anuncios Meta escolhida pelo usuario no chat.
 *
 * Por que existe: a conexao Meta guarda UMA conta de anuncios por usuario
 * (`api_integrations.adAccountId`) e tudo que toca a Meta usa essa conta:
 * upload de video, imagens, publicacao. Usuario com varias contas (portfolio
 * empresarial, contas de clientes) publicava na que estivesse salva, sem o chat
 * perguntar. Aqui a conta passa a ser uma ESCOLHA registrada no rascunho:
 *
 * - so vale conta que a Meta lista para o token do proprio usuario (contas
 *   diretas + contas de portfolios), ativa; nunca um id digitado ou inventado;
 * - com varias contas e nenhuma escolhida para o rascunho, o chat pergunta;
 *   com uma unica, ela e usada e mostrada (nao ha suposicao a fazer);
 * - a escolha exige a frase `CONFIRMAR CONTA META <codigo>` enviada pelo
 *   usuario na mensagem atual (mesmo padrao de `CONFIRMAR PUBLICACAO`), porque
 *   escolher uma conta diferente da conexao troca a conta que o MecProAI usa;
 * - a escolha fica em `campaigns.aiResponse.metaAdAccount` (sem migracao) e
 *   sincroniza a conexao com `integrations.selectMetaAdAccount`, o mesmo
 *   procedimento da tela de configuracoes, que revalida o acesso na Meta;
 * - uploads e publicacao conferem que rascunho e conexao apontam para a MESMA
 *   conta; se divergirem, bloqueiam e mandam escolher de novo;
 * - campanha ja publicada na Meta nao troca de conta.
 *
 * Tudo que fala com o banco ou com a Meta entra por `deps`, para teste.
 */
import { createHash } from "node:crypto";
import { minimoDaContaEmUnidadePrincipal } from "../shared/metaBudgetRules";

export interface ContaMeta {
  id: string;            // so digitos, sem act_
  nome: string;
  status: number | null; // account_status da Meta: 1 = ativa
  ativa: boolean;
  moeda: string | null;
  /** min_daily_budget da conta em unidade principal da moeda (API da Meta), quando informado. */
  minimoDiario?: number;
  origem: "direta" | "portfolio";
  portfolio?: string;
}

export interface DepsContaMeta {
  getCampaignById(id: number): Promise<any>;
  getProjectsByUserId(userId: number): Promise<any[]>;
  updateCampaignField(id: number, field: "aiResponse", value: string): Promise<unknown>;
  /** Contas que a Meta lista para o token do usuario (ja filtradas e normalizadas). */
  /** `completa: false` = a consulta de portfolios falhou; a lista pode estar faltando contas. */
  listarContas(userId: number): Promise<{ ok: true; contas: ContaMeta[]; completa?: boolean } | { ok: false; erro: string }>;
  /** adAccountId salvo na conexao Meta (digitos), ou null. */
  contaDaConexao(userId: number): Promise<string | null>;
  /** Troca a conta da conexao (revalida o acesso na Meta). */
  selecionarNaConexao(userId: number, adAccountId: string): Promise<void>;
  /** Rascunhos (nao publicados) do usuario com conta confirmada igual a `contaId`, fora `exceto`. Para avisar antes de trocar a conexao. */
  rascunhosLigadosAConta?(userId: number, contaId: string, exceto: number): Promise<Array<{ id: number; name: string }>>;
}

export function digitosDaConta(valor: unknown): string {
  return String(valor ?? "").replace(/^act_/, "").replace(/\D/g, "");
}

function parseAiResponse(campaign: any): Record<string, any> {
  try {
    const v = typeof campaign?.aiResponse === "string" ? JSON.parse(campaign.aiResponse || "{}") : campaign?.aiResponse;
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

/** Conta escolhida para este rascunho, ou null. */
export function contaDoRascunho(campaign: any): { id: string; nome: string; escolhidaEm: string; confirmada: boolean } | null {
  const c = parseAiResponse(campaign).metaAdAccount;
  const id = digitosDaConta(c?.id);
  if (!id) return null;
  // `confirmada` so vira true pela frase CONFIRMAR CONTA META desta campanha. Uma conta
  // reaproveitada da conversa ou de outra campanha e SUGESTAO, nunca autorizacao.
  return { id, nome: String(c?.nome || "Conta sem nome"), escolhidaEm: String(c?.escolhidaEm || ""), confirmada: c?.confirmada === true };
}

/**
 * Campanha que ja existe na Meta (ou esta sendo criada la): a conta e os criativos
 * dela nao se mudam por aqui. `error` sem `metaCampaignId` e uma tentativa que
 * falhou ANTES de existir na Meta e continua editavel (o chat deixa republicar).
 */
export function campanhaJaPublicada(campaign: any): boolean {
  if (campaign?.metaCampaignId) return true;
  return ["success", "partial", "processing"].includes(String(campaign?.publishStatus || "draft"));
}

export function codigoDaEscolha(userId: number, campaignId: number, adAccountId: string): string {
  return createHash("sha256").update(JSON.stringify({ t: "conta_meta", userId, campaignId, adAccountId })).digest("hex").slice(0, 12);
}
export function fraseDaEscolha(userId: number, campaignId: number, adAccountId: string): string {
  return `CONFIRMAR CONTA META ${codigoDaEscolha(userId, campaignId, adAccountId)}`;
}

async function campanhaDoUsuario(userId: number, campaignId: unknown, deps: DepsContaMeta): Promise<{ campaign: any } | { erro: string }> {
  if (typeof campaignId !== "number" || !Number.isSafeInteger(campaignId) || campaignId <= 0) return { erro: "campaignId invalido." };
  const campaign = await deps.getCampaignById(campaignId);
  if (!campaign) return { erro: "Campanha nao encontrada." };
  const projetos = await deps.getProjectsByUserId(userId);
  if (!projetos.some((p: any) => p.id === campaign.projectId)) return { erro: "Campanha nao pertence a esta conta." };
  return { campaign };
}

/**
 * Associar sem perguntar so quando nao ha o que escolher: uma unica conta, a lista
 * e COMPLETA (portfolios consultados com sucesso) e a conexao esta vazia ou ja nessa
 * conta. Conexao em outra conta, ou lista possivelmente incompleta, exigem a escolha.
 */
function podeAssociarSozinho(contas: ContaMeta[], ativas: ContaMeta[], completa: boolean | undefined, atual: string | null): boolean {
  return contas.length === 1 && ativas.length === 1 && completa !== false && (atual === null || atual === ativas[0].id);
}

function resumoDaConta(c: ContaMeta, atual: string | null, doRascunho: string | null) {
  return {
    adAccountId: c.id, nome: c.nome, moeda: c.moeda, ativa: c.ativa,
    origem: c.origem, ...(c.portfolio ? { portfolio: c.portfolio } : {}),
    conexaoUsaEstaConta: atual === c.id,
    escolhidaParaEsteRascunho: doRascunho === c.id,
    // Origem: API da Meta. E o piso da conta; alguns objetivos exigem mais.
    ...(c.minimoDiario != null ? { minimoDiarioDaConta: c.minimoDiario, minimoDiarioOrigem: "api_meta" } : {}),
  };
}

/** Grava a escolha em aiResponse preservando todo o resto do JSON. Relê antes de gravar. */
async function gravarNoRascunho(campaignId: number, conta: ContaMeta, deps: DepsContaMeta, confirmada: boolean): Promise<void> {
  const fresca = await deps.getCampaignById(campaignId);
  // aiResponse guarda campaignFacts, briefing e validacoes: nunca regrava por cima de
  // conteudo que nao conseguimos ler.
  const bruto = fresca?.aiResponse;
  if (typeof bruto === "string" && bruto.trim()) {
    let ok = false;
    try { const v = JSON.parse(bruto); ok = !!v && typeof v === "object" && !Array.isArray(v); } catch { ok = false; }
    if (!ok) throw new Error("dados internos do rascunho ilegiveis; nada foi gravado");
  }
  const resposta = parseAiResponse(fresca);
  resposta.metaAdAccount = { id: conta.id, nome: conta.nome, escolhidaEm: new Date().toISOString(), confirmada };
  await deps.updateCampaignField(campaignId, "aiResponse", JSON.stringify(resposta));
}

async function aplicar(userId: number, campaignId: number, conta: ContaMeta, deps: DepsContaMeta): Promise<{ mudouConexao: boolean }> {
  // So e chamada depois da frase de confirmacao desta campanha.
  const atual = await deps.contaDaConexao(userId);
  let mudouConexao = false;
  if (atual !== conta.id) {
    await deps.selecionarNaConexao(userId, conta.id);
    mudouConexao = true;
  }
  try {
    await gravarNoRascunho(campaignId, conta, deps, true);
  } catch (e) {
    // Nao deixa a conexao numa conta que o rascunho nao registrou.
    if (mudouConexao && atual) { try { await deps.selecionarNaConexao(userId, atual); } catch { /* a divergencia bloqueia upload e publicacao */ } }
    throw e;
  }
  return { mudouConexao };
}

/**
 * Ferramenta `selecionar_conta_meta`.
 * - sem adAccountId: lista as contas autorizadas (e, com uma so, ja a associa);
 * - com adAccountId: valida contra a lista da Meta e pede a frase de confirmacao.
 */
export async function selecionarContaMeta(userId: number, args: Record<string, unknown>, deps: DepsContaMeta, mensagemDoTurno: string): Promise<Record<string, unknown>> {
  const resolvido = await campanhaDoUsuario(userId, args.campaignId, deps);
  if ("erro" in resolvido) return { ok: false, erro: resolvido.erro };
  const { campaign } = resolvido;
  if (campanhaJaPublicada(campaign)) {
    return { ok: false, erro: "Esta campanha ja foi publicada (ou esta sendo publicada) na Meta; a conta dela nao pode ser trocada por aqui. Nada foi alterado." };
  }

  const lista = await deps.listarContas(userId);
  if (lista.ok === false) return { ok: false, erro: lista.erro };
  const contas = lista.contas;
  if (!contas.length) {
    return { ok: false, erro: "A Meta nao listou nenhuma conta de anuncios para esta conexao. Conecte ou reconecte a Meta em Configuracoes. Nada foi alterado." };
  }
  const atual = await deps.contaDaConexao(userId);
  const doRascunho = contaDoRascunho(campaign)?.id ?? null;

  const pedido = args.adAccountId === undefined || args.adAccountId === null || args.adAccountId === "" ? null : digitosDaConta(args.adAccountId);
  if (typeof args.adAccountId === "string" && args.adAccountId.trim() && !pedido) {
    return { ok: false, erro: "adAccountId invalido. Use um dos adAccountId devolvidos pela listagem." };
  }
  if (args.adAccountId !== undefined && args.adAccountId !== null && typeof args.adAccountId !== "string") {
    return { ok: false, erro: "adAccountId invalido. Use um dos adAccountId devolvidos pela listagem." };
  }

  if (!pedido) {
    const ativas = contas.filter((c) => c.ativa);
    // Uma unica conta utilizavel: nao ha o que escolher, mas a confirmacao continua
    // sendo explicita e por campanha (revisao final 23/11). Nada e associado aqui.
    if (podeAssociarSozinho(contas, ativas, lista.completa, atual)) {
      const unica = ativas[0];
      return {
        ok: false, confirmationRequired: true, campaignId: campaign.id, unicaContaDisponivel: true,
        conta: { adAccountId: unica.id, nome: unica.nome, moeda: unica.moeda },
        erro: `Nada foi alterado. Esta e a unica conta de anuncios disponivel ("${unica.nome}"). Mostre o nome ao usuario e peca que envie exatamente: ${fraseDaEscolha(userId, Number(campaign.id), unica.id)}`,
      };
    }
    return {
      ok: true, campaignId: campaign.id,
      contas: contas.map((c) => resumoDaConta(c, atual, doRascunho)),
      contaEscolhidaParaEsteRascunho: doRascunho,
      instruction: "Apresente as contas pelo NOME (e moeda), nunca pelo numero, e pergunte qual usar para esta campanha. Contas com ativa=false nao podem ser escolhidas. Depois chame selecionar_conta_meta com campaignId e o adAccountId da conta que o USUARIO escolheu; nunca escolha por ele.",
    };
  }

  const alvo = contas.find((c) => c.id === pedido);
  if (!alvo) {
    return {
      ok: false, erro: "Essa conta nao esta entre as contas de anuncios autorizadas para este usuario. Escolha uma da lista.",
      contas: contas.map((c) => resumoDaConta(c, atual, doRascunho)),
    };
  }
  if (!alvo.ativa) {
    return { ok: false, erro: `A conta "${alvo.nome}" nao esta ativa na Meta (status ${alvo.status ?? "desconhecido"}). Escolha outra.` };
  }

  const frase = fraseDaEscolha(userId, Number(campaign.id), alvo.id);
  // Trocar a conta da conexao afeta o que outras campanhas do usuario usam: lista antes de confirmar.
  const afetadas = atual && atual !== alvo.id && deps.rascunhosLigadosAConta
    ? await deps.rascunhosLigadosAConta(userId, atual, Number(campaign.id)).catch(() => null)
    : null;
  if (mensagemDoTurno.trim() !== frase) {
    return {
      ok: false, confirmationRequired: true, campaignId: campaign.id, conta: { adAccountId: alvo.id, nome: alvo.nome, moeda: alvo.moeda },
      ...(afetadas && afetadas.length ? { rascunhosQueUsamAContaAtual: afetadas.slice(0, 10), instrucaoRascunhos: "Liste estes rascunhos ao usuario: ao confirmar, eles ficam bloqueados para subir midia e publicar ate ele confirmar a conta de cada um de novo." } : {}),
      ...(afetadas === null && atual && atual !== alvo.id ? { avisoRascunhos: "Nao consegui listar os outros rascunhos que usam a conta atual; avise que eles podem ficar bloqueados ate a conta ser confirmada de novo." } : {}),
      ...(atual !== alvo.id ? { avisoConexao: "Esta conta e diferente da que a conexao Meta usa hoje. Ao confirmar, uploads de midia e publicacoes do MecProAI passam a usar esta conta. Campanhas ja publicadas continuam onde estao." } : {}),
      erro: `Nada foi alterado. Mostre o nome da conta "${alvo.nome}" ao usuario e peca que envie exatamente: ${frase}`,
    };
  }

  try {
    const anterior = contaDoRascunho(campaign)?.id ?? null;
    const { mudouConexao } = await aplicar(userId, Number(campaign.id), alvo, deps);
    const temVideoOuHash = /"(feed|story|square)(VideoId|ImageHash)"\s*:\s*"[^"]+"/.test(String(campaign.creatives || ""));
    return {
      ok: true, campaignId: campaign.id, conta: { adAccountId: alvo.id, nome: alvo.nome, moeda: alvo.moeda }, mudouConexao,
      ...(anterior && anterior !== alvo.id && temVideoOuHash ? { avisoMidia: "Videos e imagens ja enviados a Meta pertencem a conta anterior. Avise o usuario que precisam ser reenviados (anexar_video_criativo) antes de publicar nesta conta." } : {}),
      instruction: `Conta "${alvo.nome}" associada ao rascunho${mudouConexao ? " e definida como a conta da conexao Meta" : ""}. Nada foi publicado. Antes de publicar, a confirmacao vai mostrar a conta de novo.`,
    };
  } catch (e: any) {
    return { ok: false, erro: `Nao consegui definir a conta: ${String(e?.message || "erro desconhecido").slice(0, 160)}. Nada foi publicado.` };
  }
}

// ── Escolha da conta ANTES de existir rascunho (F5, auditoria 23/11) ──────────
// Sem campaignId o chat so listava paginas. Aqui a conta pode ser listada e
// escolhida no inicio do atendimento; a escolha fica no estado da conversa e e
// aplicada ao rascunho no instante em que ele e criado. A conexao Meta nao muda
// ate la: escolher e listar nao alteram nada.
export type ContaDaSessao = { id: string; nome: string; moeda: string | null; escolhidaEm: string };
export interface SessaoDeConta { obter(): ContaDaSessao | null; gravar(conta: ContaDaSessao | null): void }

export async function selecionarContaMetaDaSessao(
  userId: number, args: Record<string, unknown>, deps: DepsContaMeta, mensagemDoTurno: string, sessao: SessaoDeConta,
): Promise<Record<string, unknown>> {
  const lista = await deps.listarContas(userId);
  if (lista.ok === false) return { ok: false, erro: lista.erro };
  const contas = lista.contas;
  if (!contas.length) {
    return { ok: false, erro: "A Meta nao listou nenhuma conta de anuncios para esta conexao. Conecte ou reconecte a Meta em Configuracoes. Nada foi alterado." };
  }
  const atual = await deps.contaDaConexao(userId);
  const daSessao = sessao.obter()?.id ?? null;
  const invalido = args.adAccountId !== undefined && args.adAccountId !== null && args.adAccountId !== ""
    && (typeof args.adAccountId !== "string" || !digitosDaConta(args.adAccountId));
  if (invalido) return { ok: false, erro: "adAccountId invalido. Use um dos adAccountId devolvidos pela listagem." };
  const pedido = typeof args.adAccountId === "string" && args.adAccountId.trim() ? digitosDaConta(args.adAccountId) : null;
  const ativas = contas.filter((c) => c.ativa);

  if (!pedido) {
    if (podeAssociarSozinho(contas, ativas, lista.completa, atual)) {
      const unica = ativas[0];
      sessao.gravar({ id: unica.id, nome: unica.nome, moeda: unica.moeda, escolhidaEm: new Date().toISOString() });
      return {
        ok: true, conta: { adAccountId: unica.id, nome: unica.nome, moeda: unica.moeda }, unicaContaDisponivel: true,
        instruction: `Esta e a unica conta de anuncios disponivel (${unica.nome}). Diga o nome ao usuario; ela entrara no rascunho so como sugestao, e cada campanha pede a confirmacao propria. Nada foi alterado na Meta.`,
      };
    }
    return {
      ok: true,
      contas: contas.map((c) => resumoDaConta(c, atual, daSessao)),
      contaEscolhidaNestaConversa: daSessao,
      instruction: "Apresente as contas pelo NOME (e moeda), nunca pelo numero, e pergunte qual usar. Contas com ativa=false nao podem ser escolhidas. Depois chame esta ferramenta de novo com o adAccountId da conta escolhida; ela vai devolver a frase de confirmacao que o usuario precisa enviar. Nada e alterado na Meta ate o rascunho ser criado.",
    };
  }

  const alvo = contas.find((c) => c.id === pedido);
  if (!alvo) {
    return { ok: false, erro: "Essa conta nao esta entre as contas de anuncios autorizadas para este usuario. Escolha uma da lista.", contas: contas.map((c) => resumoDaConta(c, atual, daSessao)) };
  }
  if (!alvo.ativa) return { ok: false, erro: `A conta "${alvo.nome}" nao esta ativa na Meta (status ${alvo.status ?? "desconhecido"}). Escolha outra.` };
  const frase = fraseDaEscolha(userId, 0, alvo.id);
  if (mensagemDoTurno.trim() !== frase) {
    return {
      ok: false, confirmationRequired: true, conta: { adAccountId: alvo.id, nome: alvo.nome, moeda: alvo.moeda },
      erro: `Nada foi alterado. Mostre o nome da conta "${alvo.nome}" ao usuario e peca que envie exatamente: ${frase}`,
    };
  }
  sessao.gravar({ id: alvo.id, nome: alvo.nome, moeda: alvo.moeda, escolhidaEm: new Date().toISOString() });
  return {
    ok: true, conta: { adAccountId: alvo.id, nome: alvo.nome, moeda: alvo.moeda },
    instruction: `Conta "${alvo.nome}" escolhida para esta conversa. Ela entrara em cada rascunho novo so como SUGESTAO; cada campanha pede a propria confirmacao e a conexao Meta nao muda aqui. Nada foi publicado.`,
  };
}

/**
 * Chamada logo depois de criar o rascunho: grava a conta da conversa como SUGESTAO do rascunho,
 * revalidando que ela ainda esta autorizada e ativa. Nao confirma e nao toca na conexao Meta:
 * a confirmacao e por campanha (frase CONFIRMAR CONTA META) e so ela libera upload e publicacao.
 */
export async function aplicarContaDaSessaoAoRascunho(
  userId: number, campaignId: number, sessao: SessaoDeConta, deps: DepsContaMeta,
): Promise<{ status: "sugerida"; nome: string; frase: string; conexaoAtual: boolean } | { status: "sem_escolha" } | { status: "falhou"; erro: string }> {
  const escolhida = sessao.obter();
  if (!escolhida) return { status: "sem_escolha" };
  try {
    const resolvido = await campanhaDoUsuario(userId, campaignId, deps);
    if ("erro" in resolvido) return { status: "falhou", erro: resolvido.erro };
    if (campanhaJaPublicada(resolvido.campaign)) return { status: "falhou", erro: "A campanha ja foi publicada; a conta nao foi alterada." };
    const lista = await deps.listarContas(userId);
    if (lista.ok === false) return { status: "falhou", erro: lista.erro };
    const alvo = lista.contas.find((c) => c.id === escolhida.id);
    if (!alvo || !alvo.ativa) {
      sessao.gravar(null);
      return { status: "falhou", erro: `A conta "${escolhida.nome}" nao esta mais autorizada ou ativa na Meta. Escolha a conta de novo.` };
    }
    await gravarNoRascunho(campaignId, alvo, deps, false);
    const atual = await deps.contaDaConexao(userId);
    return { status: "sugerida", nome: alvo.nome, frase: fraseDaEscolha(userId, campaignId, alvo.id), conexaoAtual: atual === alvo.id };
  } catch (e: any) {
    return { status: "falhou", erro: String(e?.message || "erro desconhecido").slice(0, 160) };
  }
}

/**
 * Trava usada por `anexar_video_criativo` e `publicar_campanha`: rascunho e
 * conexao precisam apontar para a mesma conta autorizada e ativa.
 * Com uma unica conta, associa sozinho; com varias e sem escolha, bloqueia.
 */
export async function exigirContaDoRascunho(userId: number, campaign: any, deps: DepsContaMeta): Promise<
  { ok: true; conta: { adAccountId: string; nome: string; moeda: string | null }; campaign: any }
  | { ok: false; erro: string; acao: "selecionar_conta_meta" | "conectar_meta"; contas?: ReturnType<typeof resumoDaConta>[] }
> {
  const lista = await deps.listarContas(userId);
  if (lista.ok === false) return { ok: false, erro: `${lista.erro} Nada foi alterado.`, acao: "conectar_meta" };
  const contas = lista.contas;
  if (!contas.length) return { ok: false, erro: "A Meta nao listou nenhuma conta de anuncios para esta conexao. Nada foi alterado.", acao: "conectar_meta" };
  const atual = await deps.contaDaConexao(userId);
  const escolhida = contaDoRascunho(campaign);

  if (!escolhida) {
    return {
      ok: false, acao: "selecionar_conta_meta",
      erro: "Este rascunho ainda nao tem conta de anuncios CONFIRMADA. Use selecionar_conta_meta, apresente as contas pelo nome e peca a confirmacao explicita do usuario para esta campanha. Nada foi enviado nem publicado.",
      contas: contas.map((c) => resumoDaConta(c, atual, null)),
    };
  }
  if (!escolhida.confirmada) {
    const frase = fraseDaEscolha(userId, Number(campaign.id), escolhida.id);
    return {
      ok: false, acao: "selecionar_conta_meta",
      erro: `A conta "${escolhida.nome}" esta apenas SUGERIDA para esta campanha (veio da conversa ou de outra campanha) e nao foi confirmada. Mostre o nome ao usuario e peca que envie exatamente: ${frase}. Nada foi enviado nem publicado.`,
      contas: contas.map((c) => resumoDaConta(c, atual, escolhida.id)),
    };
  }

  const naLista = contas.find((c) => c.id === escolhida.id);
  if (!naLista || !naLista.ativa) {
    return { ok: false, acao: "selecionar_conta_meta", erro: `A conta escolhida para este rascunho ("${escolhida.nome}") nao esta mais autorizada ou ativa. Escolha de novo com selecionar_conta_meta. Nada foi enviado nem publicado.`, contas: contas.map((c) => resumoDaConta(c, atual, escolhida.id)) };
  }
  if (atual !== escolhida.id) {
    return { ok: false, acao: "selecionar_conta_meta", erro: `A conexao Meta esta usando outra conta que nao a escolhida para este rascunho ("${naLista.nome}"). Para nao enviar nem publicar na conta errada, escolha a conta de novo com selecionar_conta_meta. Nada foi alterado.`, contas: contas.map((c) => resumoDaConta(c, atual, escolhida.id)) };
  }
  return { ok: true, conta: { adAccountId: naLista.id, nome: naLista.nome, moeda: naLista.moeda }, campaign };
}

// ── Implementacao real das dependencias (Meta + banco + tRPC existentes) ──────

/** Normaliza o retorno cru da Meta (`me/adaccounts` e portfolios) numa lista sem duplicatas. */
export function normalizarContasMeta(direto: any[], portfolios: Array<{ businessName?: string; accounts?: any[] }>): ContaMeta[] {
  const porId = new Map<string, ContaMeta>();
  const add = (a: any, origem: "direta" | "portfolio", portfolio?: string) => {
    const id = digitosDaConta(a?.id);
    if (id.length < 5) return;
    const status = typeof (a?.account_status ?? a?.status) === "number" ? Number(a.account_status ?? a.status) : null;
    const conta: ContaMeta = {
      id, nome: String(a?.name || a?.nome || "Conta sem nome"), status, ativa: status === 1,
      moeda: a?.currency || a?.moeda || null, origem, ...(portfolio ? { portfolio } : {}),
    };
    // Piso diario da conta, quando a Meta informa (F6). Ausente nao quer dizer "sem minimo".
    const minimo = minimoDaContaEmUnidadePrincipal(a?.min_daily_budget, conta.moeda);
    if (minimo != null) conta.minimoDiario = minimo;
    if (!porId.has(id)) porId.set(id, conta);
  };
  for (const a of direto || []) add(a, "direta");
  for (const b of portfolios || []) for (const a of b.accounts || []) add(a, "portfolio", b.businessName);
  return [...porId.values()];
}

export async function depsContaMetaPadrao(db: any, injected?: any): Promise<DepsContaMeta> {
  return {
    getCampaignById: (id) => db.getCampaignById(id),
    getProjectsByUserId: (userId) => db.getProjectsByUserId(userId),
    updateCampaignField: (id, field, value) => db.updateCampaignField(id, field, value),
    contaDaConexao: async (userId) => {
      const integ: any = await db.getApiIntegration(userId, "meta");
      return digitosDaConta(integ?.adAccountId) || null;
    },
    listarContas: async (userId) => {
      const integ: any = await db.getApiIntegration(userId, "meta");
      if (!integ?.accessToken) return { ok: false, erro: "Conta Meta nao conectada. Conecte em Configuracoes → Meta Ads." };
      let direto: any[] = [];
      try {
        const res = await fetch(
          `https://graph.facebook.com/v20.0/me/adaccounts?fields=id,name,account_status,currency,min_daily_budget&limit=100&access_token=${integ.accessToken}`,
          { signal: AbortSignal.timeout(8000) },
        );
        const data: any = await res.json();
        if (data?.error) {
          if (data.error.code === 190) return { ok: false, erro: "Token Meta expirado. Reconecte a Meta em Configuracoes." };
          return { ok: false, erro: "A Meta recusou a consulta das contas de anuncios." };
        }
        direto = Array.isArray(data?.data) ? data.data : [];
      } catch { return { ok: false, erro: "Nao consegui consultar as contas de anuncios na Meta agora." }; }
      // Contas dentro de portfolios (mesma consulta da tela de configuracoes); tolerante a falha.
      let portfolios: Array<{ businessName?: string; accounts?: any[] }> = [];
      let completa = true;
      try {
        const user = await db.getUserById(userId);
        if (user) {
          const c = injected?.caller ?? (await import("./_core/router")).appRouter.createCaller({ req: {} as any, res: {} as any, user } as any);
          const r: any = await c.integrations.listMetaBusinesses();
          portfolios = Array.isArray(r?.businesses) ? r.businesses : [];
        }
      } catch { completa = false; /* sem portfolios: so as contas diretas, e a lista nao e confiavel como completa */ }
      return { ok: true, contas: normalizarContasMeta(direto, portfolios), completa };
    },
    rascunhosLigadosAConta: async (userId, contaId, exceto) => {
      const projetos: any[] = await db.getProjectsByUserId(userId);
      const achados: Array<{ id: number; name: string }> = [];
      for (const p of projetos) {
        const campanhas: any[] = await db.getCampaignsByProjectId(p.id);
        for (const c of campanhas) {
          if (c.id === exceto || campanhaJaPublicada(c)) continue;
          const conta = contaDoRascunho(c);
          if (conta?.confirmada && conta.id === contaId) achados.push({ id: c.id, name: String(c.name || `Campanha ${c.id}`) });
        }
      }
      return achados;
    },
    selecionarNaConexao: async (userId, adAccountId) => {
      const user = await db.getUserById(userId);
      if (!user) throw new Error("Usuario indisponivel.");
      const c = injected?.caller ?? (await import("./_core/router")).appRouter.createCaller({ req: {} as any, res: {} as any, user } as any);
      await c.integrations.selectMetaAdAccount({ adAccountId });
    },
  };
}
