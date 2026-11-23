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

export interface ContaMeta {
  id: string;            // so digitos, sem act_
  nome: string;
  status: number | null; // account_status da Meta: 1 = ativa
  ativa: boolean;
  moeda: string | null;
  origem: "direta" | "portfolio";
  portfolio?: string;
}

export interface DepsContaMeta {
  getCampaignById(id: number): Promise<any>;
  getProjectsByUserId(userId: number): Promise<any[]>;
  updateCampaignField(id: number, field: "aiResponse", value: string): Promise<unknown>;
  /** Contas que a Meta lista para o token do usuario (ja filtradas e normalizadas). */
  listarContas(userId: number): Promise<{ ok: true; contas: ContaMeta[] } | { ok: false; erro: string }>;
  /** adAccountId salvo na conexao Meta (digitos), ou null. */
  contaDaConexao(userId: number): Promise<string | null>;
  /** Troca a conta da conexao (revalida o acesso na Meta). */
  selecionarNaConexao(userId: number, adAccountId: string): Promise<void>;
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
export function contaDoRascunho(campaign: any): { id: string; nome: string; escolhidaEm: string } | null {
  const c = parseAiResponse(campaign).metaAdAccount;
  const id = digitosDaConta(c?.id);
  if (!id) return null;
  return { id, nome: String(c?.nome || "Conta sem nome"), escolhidaEm: String(c?.escolhidaEm || "") };
}

/** Campanha que ja existe na Meta: a conta dela nao se muda por aqui. */
export function campanhaJaPublicada(campaign: any): boolean {
  const publicada = String(campaign?.publishStatus || "draft") !== "draft";
  return publicada || !!campaign?.metaCampaignId;
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

function resumoDaConta(c: ContaMeta, atual: string | null, doRascunho: string | null) {
  return {
    adAccountId: c.id, nome: c.nome, moeda: c.moeda, ativa: c.ativa,
    origem: c.origem, ...(c.portfolio ? { portfolio: c.portfolio } : {}),
    conexaoUsaEstaConta: atual === c.id,
    escolhidaParaEsteRascunho: doRascunho === c.id,
  };
}

/** Grava a escolha em aiResponse preservando todo o resto do JSON. Relê antes de gravar. */
async function gravarNoRascunho(campaignId: number, conta: ContaMeta, deps: DepsContaMeta): Promise<void> {
  const fresca = await deps.getCampaignById(campaignId);
  const resposta = parseAiResponse(fresca);
  resposta.metaAdAccount = { id: conta.id, nome: conta.nome, escolhidaEm: new Date().toISOString() };
  await deps.updateCampaignField(campaignId, "aiResponse", JSON.stringify(resposta));
}

async function aplicar(userId: number, campaignId: number, conta: ContaMeta, deps: DepsContaMeta): Promise<{ mudouConexao: boolean }> {
  const atual = await deps.contaDaConexao(userId);
  let mudouConexao = false;
  if (atual !== conta.id) {
    await deps.selecionarNaConexao(userId, conta.id);
    mudouConexao = true;
  }
  await gravarNoRascunho(campaignId, conta, deps);
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
    return { ok: false, erro: "Esta campanha ja foi publicada na Meta; a conta dela nao pode ser trocada por aqui. Nada foi alterado." };
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
    // Uma unica conta utilizavel: nao ha escolha a fazer. Associa e mostra qual.
    if (contas.length === 1 && ativas.length === 1) {
      const unica = ativas[0];
      try {
        const { mudouConexao } = await aplicar(userId, Number(campaign.id), unica, deps);
        return {
          ok: true, campaignId: campaign.id, conta: { adAccountId: unica.id, nome: unica.nome },
          unicaContaDisponivel: true, mudouConexao,
          instruction: `Esta e a unica conta de anuncios disponivel (${unica.nome}); foi associada ao rascunho. Diga o nome ao usuario. Nada foi publicado.`,
        };
      } catch {
        return { ok: false, erro: "Nao consegui associar a conta ao rascunho agora. Nada foi alterado; tente de novo." };
      }
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
  if (mensagemDoTurno.trim() !== frase) {
    return {
      ok: false, confirmationRequired: true, campaignId: campaign.id, conta: { adAccountId: alvo.id, nome: alvo.nome, moeda: alvo.moeda },
      ...(atual !== alvo.id ? { avisoConexao: "Esta conta e diferente da que a conexao Meta usa hoje. Ao confirmar, uploads de midia e publicacoes do MecProAI passam a usar esta conta. Campanhas ja publicadas continuam onde estao." } : {}),
      erro: `Nada foi alterado. Mostre o nome da conta "${alvo.nome}" ao usuario e peca que envie exatamente: ${frase}`,
    };
  }

  try {
    const { mudouConexao } = await aplicar(userId, Number(campaign.id), alvo, deps);
    return {
      ok: true, campaignId: campaign.id, conta: { adAccountId: alvo.id, nome: alvo.nome, moeda: alvo.moeda }, mudouConexao,
      instruction: `Conta "${alvo.nome}" associada ao rascunho${mudouConexao ? " e definida como a conta da conexao Meta" : ""}. Nada foi publicado. Antes de publicar, a confirmacao vai mostrar a conta de novo.`,
    };
  } catch (e: any) {
    return { ok: false, erro: `Nao consegui definir a conta: ${String(e?.message || "erro desconhecido").slice(0, 160)}. Nada foi publicado.` };
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
    const ativas = contas.filter((c) => c.ativa);
    if (contas.length === 1 && ativas.length === 1) {
      const unica = ativas[0];
      try {
        await aplicar(userId, Number(campaign.id), unica, deps);
        const fresca = await deps.getCampaignById(Number(campaign.id));
        return { ok: true, conta: { adAccountId: unica.id, nome: unica.nome, moeda: unica.moeda }, campaign: fresca ?? campaign };
      } catch {
        return { ok: false, erro: "Nao consegui associar a unica conta disponivel ao rascunho agora. Nada foi alterado.", acao: "selecionar_conta_meta" };
      }
    }
    return {
      ok: false, acao: "selecionar_conta_meta",
      erro: "Este rascunho ainda nao tem conta de anuncios escolhida e ha mais de uma disponivel. Use selecionar_conta_meta, apresente as contas pelo nome e deixe o usuario escolher. Nada foi enviado nem publicado.",
      contas: contas.map((c) => resumoDaConta(c, atual, null)),
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
          `https://graph.facebook.com/v20.0/me/adaccounts?fields=id,name,account_status,currency&limit=100&access_token=${integ.accessToken}`,
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
      try {
        const user = await db.getUserById(userId);
        if (user) {
          const c = injected?.caller ?? (await import("./_core/router")).appRouter.createCaller({ req: {} as any, res: {} as any, user } as any);
          const r: any = await c.integrations.listMetaBusinesses();
          portfolios = Array.isArray(r?.businesses) ? r.businesses : [];
        }
      } catch { /* sem portfolios: ficam so as contas diretas */ }
      return { ok: true, contas: normalizarContasMeta(direto, portfolios) };
    },
    selecionarNaConexao: async (userId, adAccountId) => {
      const user = await db.getUserById(userId);
      if (!user) throw new Error("Usuario indisponivel.");
      const c = injected?.caller ?? (await import("./_core/router")).appRouter.createCaller({ req: {} as any, res: {} as any, user } as any);
      await c.integrations.selectMetaAdAccount({ adAccountId });
    },
  };
}
