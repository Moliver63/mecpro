import { parseDailyBudget, formatDailyBudget } from "../shared/dailyBudget";
type Project = { id: number; name: string };
export interface ChatWorkspaceStore {
  getProjectsByUserId(userId: number): Promise<any[]>;
  getCampaignsByProjectId(projectId: number): Promise<any[]>;
  getCampaignById(campaignId: number): Promise<any>;
  // Achado real (missao "agente conversacional autonomo", 13/09): o chat
  // so tinha ferramenta de LEITURA (queryChatWorkspace) e de CRIACAO
  // (gerar_campanha) — nao tinha nenhuma forma de EDITAR uma campanha ja
  // criada (mudar orcamento, trocar foto de destaque). O proprio
  // SYSTEM_PROMPT ja admitia isso: "Esta conversa ainda nao edita nem
  // publica campanhas existentes." updateCampaignField ja existe e ja e
  // usado pelos procedimentos tRPC equivalentes (updateAdSet,
  // setFeaturedPhoto em server/_core/router.ts) — reaproveitado aqui
  // direto, sem precisar importar o roteador tRPC inteiro (14 mil+
  // linhas) dentro do chat.
  updateCampaignField(id: number, field: "creatives" | "adSets" | "strategy" | "aiResponse", value: string): Promise<unknown>;
}

// Achado real (conversa colada por Michel, 13/09): a mesma propriedade
// fisica ja tinha 3 projetos quase-identicos criados em conversas
// anteriores ("Sala Comercial Rua 902", "sala comercial da rua 902",
// "Morebem Imoveis — Sala Comercial Rua 902") — a deduplicacao na
// criacao so pegava nome EXATO (proposital, pra nao fundir negocios
// diferentes por coincidencia de nome parecido), entao qualquer
// variacao de digitacao passava direto e criava mais um projeto novo.
// Este helper detecta nomes PARECIDOS (nao so identicos) por
// sobreposicao de palavras significativas, ignorando acentos,
// pontuacao e conectivos comuns — pra avisar o usuario ANTES de criar
// mais um projeto pra algo que provavelmente ja existe, sem bloquear
// de fato (o usuario ainda pode confirmar que quer um projeto novo
// mesmo assim).
const STOPWORDS_NOME_PROJETO = new Set([
  "da", "de", "do", "das", "dos", "e", "a", "o", "as", "os",
  "imoveis", "imobiliaria", "ltda", "me", "eireli", "sa",
]);

function tokenizarNomeProjeto(nome: string): string[] {
  return nome
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS_NOME_PROJETO.has(t));
}

export function nomesDeProjetoParecidos(a: string, b: string): boolean {
  const tokensA = new Set(tokenizarNomeProjeto(a));
  const tokensB = new Set(tokenizarNomeProjeto(b));
  const menor = tokensA.size <= tokensB.size ? tokensA : tokensB;
  const maior = tokensA.size <= tokensB.size ? tokensB : tokensA;
  if (menor.size === 0) return false;
  let compartilhados = 0;
  for (const t of menor) if (maior.has(t)) compartilhados++;
  // Um único token compartilhado só conta como "parecido" se for uma
  // palavra específica o bastante (≥5 letras) — evita marcar qualquer
  // projeto que só compartilhe uma palavra genérica curta como "loja"
  // ou "shop" como se fosse o mesmo negócio.
  if (menor.size === 1) return compartilhados === 1 && [...menor][0].length >= 5;
  return compartilhados >= 2 && compartilhados / menor.size >= 0.6;
}

export function selectChatProject(projects: Project[], args: Record<string, unknown>): Project | null {
  const name = typeof args.projectName === "string" ? args.projectName.trim().toLowerCase() : "";
  if (args.createProject === true) {
    if (args.projectId != null) throw new Error("Escolha projeto existente ou novo, nao os dois.");
    if (typeof args.projectName !== "string" || !args.projectName.trim()) throw new Error("Qual sera o nome do novo projeto?");
    if (projects.some(p => p.name.trim().toLowerCase() === String(args.projectName).trim().toLowerCase())) {
      throw new Error("Ja existe um projeto com esse nome. Confirme se deseja usa-lo pelo projectId.");
    }
    const parecido = projects.find(p => nomesDeProjetoParecidos(p.name, String(args.projectName)));
    if (parecido && args.confirmDistinctProject !== true) {
      throw new Error(`Existe um projeto parecido: "${parecido.name}" (ID ${parecido.id}). Pergunte ao usuario se e o mesmo projeto (nesse caso use esse projectId) antes de criar um novo com esse nome.`);
    }
    return null;
  }
  const matches = args.projectId != null
    ? projects.filter(p => p.id === Number(args.projectId))
    : projects.filter(p => name && p.name.trim().toLowerCase() === name);
  if (matches.length !== 1) throw new Error("Consulte os projetos e pergunte qual usar ou se deseja criar um novo. Nao selecione automaticamente.");
  if (name && matches[0].name.trim().toLowerCase() !== name) throw new Error("O nome informado nao corresponde ao projeto selecionado. Confirme o projeto.");
  return matches[0];
}

export async function queryChatWorkspace(userId: number, args: Record<string, unknown>, store: ChatWorkspaceStore): Promise<Record<string, unknown>> {
  const projects = await store.getProjectsByUserId(userId);
  const offset = Number(args.offset ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) return { erro: "Paginacao invalida." };
  if (args.projectId == null) {
    if (args.campaignId != null) return { erro: "Escolha primeiro o projeto da campanha." };
    return { projects: projects.slice(offset, offset + 30).map(p => ({ id: p.id, name: p.name, url: `/projects/${p.id}` })),
      nextOffset: offset + 30 < projects.length ? offset + 30 : null,
      question: "Qual projeto deseja usar? Ou prefere criar um novo?" };
  }
  const project = projects.find(p => p.id === Number(args.projectId));
  if (!project) return { erro: "Projeto nao encontrado na sua conta." };
  const summarize = (c: any) => ({ id: c.id, name: c.name, projectId: project.id, status: c.status,
    objective: c.objective, platform: c.platform, budget: c.budget, durationDays: c.duration,
    url: `/projects/${project.id}/campaign/result/${c.id}` });
  if (args.campaignId != null) {
    const campaign = await store.getCampaignById(Number(args.campaignId));
    if (!campaign || campaign.projectId !== project.id) return { erro: "Campanha nao encontrada neste projeto." };
    // Achado real (missao "agente conversacional autonomo", 13/09): sem
    // isso, o modelo nao tinha NENHUMA informacao sobre os criativos de
    // uma campanha ja criada — impossivel resolver algo como "a fachada
    // e a principal" sem saber quais fotos existem e em qual indice.
    // Limitacao honesta que continua existindo mesmo com isso: o indice
    // + headline nao bastam pra reconhecer o CONTEUDO da foto (qual
    // delas e literalmente a fachada) sem analise visual da imagem —
    // se o headline/descricao do criativo nao mencionar isso, o modelo
    // deve perguntar ao usuario qual indice/posicao ele quer, nao
    // adivinhar.
    let creativesSummary: Array<Record<string, unknown>> = [];
    try {
      const creatives = JSON.parse(campaign.creatives || "[]");
      creativesSummary = creatives.map((c: any, index: number) => ({
        index, headline: c.headline || null, isFeaturedPhoto: !!c.isFeaturedPhoto,
        hasImage: !!(c.feedImageUrl || c.imageUrl || c.storyImageUrl),
      }));
    } catch { /* creatives malformado — segue sem detalhe, nao quebra a consulta */ }
    let adSetsSummary: Array<Record<string, unknown>> = [];
    try {
      const adSets = JSON.parse(campaign.adSets || "[]");
      adSetsSummary = adSets.map((a: any, index: number) => ({ index, name: a.name || null, budget: a.budget || null, audience: a.audience || null }));
    } catch { /* adSets malformado — segue sem detalhe */ }
    return { campaign: summarize(campaign), creatives: creativesSummary, adSets: adSetsSummary,
      instruction: "Use creatives[].index e adSets[].index pra chamar atualizar_orcamento_campanha ou definir_foto_destaque quando o usuario pedir uma mudanca. Se nao conseguir identificar com confianca qual foto/conjunto o usuario quer dizer, pergunte em vez de adivinhar." };
  }
  const campaigns = await store.getCampaignsByProjectId(project.id);
  return { project: { id: project.id, name: project.name }, campaigns: campaigns.slice(offset, offset + 30).map(summarize),
    nextOffset: offset + 30 < campaigns.length ? offset + 30 : null,
    question: "Deseja abrir uma campanha existente ou criar uma nova neste projeto?" };
}

async function campanhaDoUsuario(userId: number, campaignId: number, store: ChatWorkspaceStore): Promise<{ campaign: any } | { erro: string }> {
  if (!Number.isSafeInteger(campaignId) || campaignId <= 0) return { erro: "campaignId invalido." };
  const campaign = await store.getCampaignById(campaignId);
  if (!campaign) return { erro: "Campanha nao encontrada." };
  const projects = await store.getProjectsByUserId(userId);
  if (!projects.some(p => p.id === campaign.projectId)) return { erro: "Campanha nao pertence a esta conta." };
  return { campaign };
}

/** Atualiza orcamento/publico/objetivo de um conjunto de anuncios de uma campanha ja criada. */
export async function atualizarOrcamentoCampanha(userId: number, args: Record<string, unknown>, store: ChatWorkspaceStore): Promise<Record<string, unknown>> {
  if (!Number.isSafeInteger(args.campaignId)) return { erro: "campaignId invalido." };
  const resolvido = await campanhaDoUsuario(userId, Number(args.campaignId), store);
  if ("erro" in resolvido) return resolvido;
  const { campaign } = resolvido;

  const adSetIndex = args.adSetIndex === undefined ? 0 : Number(args.adSetIndex);
  if (!Number.isSafeInteger(adSetIndex) || adSetIndex < 0 || (args.adSetIndex !== undefined && typeof args.adSetIndex !== "number")) return { erro: "Indice do conjunto invalido." };
  let adSets: any[];
  try { adSets = JSON.parse(campaign.adSets || "[]"); } catch { adSets = []; }
  if (!Array.isArray(adSets)) return { erro: "Conjuntos de anuncios invalidos." };
  if (!adSets[adSetIndex]) return { erro: `Conjunto de anuncios ${adSetIndex} nao encontrado nesta campanha.`, adSetsDisponiveis: adSets.length };

  let algumaMudanca = false;
  if (args.budgetDaily !== undefined) {
    const daily = parseDailyBudget(args.budgetDaily);
    if (daily === null) return { erro: "Informe um valor diario positivo em reais, sem percentual ou valor mensal." };
    adSets[adSetIndex].budget = formatDailyBudget(daily); algumaMudanca = true;
  }
  if (typeof args.audience === "string" && args.audience.trim()) { adSets[adSetIndex].audience = args.audience.trim(); algumaMudanca = true; }
  if (args.objective !== undefined) {
    if (typeof args.objective !== "string" || !["leads", "sales", "traffic", "branding", "awareness", "engagement"].includes(args.objective)) return { erro: "Objetivo invalido." };
    adSets[adSetIndex].objective = args.objective; algumaMudanca = true;
  }
  if (!algumaMudanca) return { erro: "Nenhum campo pra atualizar foi informado (budgetDaily, audience ou objective)." };
  adSets[adSetIndex]._edited = true;

  await store.updateCampaignField(campaign.id, "adSets", JSON.stringify(adSets));
  return { ok: true, campaignId: campaign.id, adSetIndex, adSet: adSets[adSetIndex], scope: "mecpro_only", syncedToMeta: false,
    message: "Alteracao salva somente no MecProAI. Anuncios ativos na Meta nao foram alterados." };
}

/** Define qual criativo (por indice) e a foto de destaque de uma campanha ja criada. */
export async function definirFotoDestaque(userId: number, args: Record<string, unknown>, store: ChatWorkspaceStore): Promise<Record<string, unknown>> {
  if (!Number.isSafeInteger(args.campaignId)) return { erro: "campaignId invalido." };
  const resolvido = await campanhaDoUsuario(userId, Number(args.campaignId), store);
  if ("erro" in resolvido) return resolvido;
  const { campaign } = resolvido;

  let creatives: any[];
  try { creatives = JSON.parse(campaign.creatives || "[]"); } catch { creatives = []; }
  if (!Array.isArray(creatives)) return { erro: "Lista de criativos invalida." };
  const creativeIndex = Number(args.creativeIndex);
  if (typeof args.creativeIndex !== "number" || !Number.isSafeInteger(creativeIndex) || creativeIndex < 0 || !creatives[creativeIndex]) {
    return { erro: "Foto nao encontrada nesse indice.",
      fotosDisponiveis: creatives.map((c: any, index: number) => ({ index, headline: c.headline || null })) };
  }

  const updated = creatives.map((c: any, index: number) => ({ ...c, isFeaturedPhoto: index === creativeIndex }));
  await store.updateCampaignField(campaign.id, "creatives", JSON.stringify(updated));
  return { ok: true, campaignId: campaign.id, creativeIndex, scope: "mecpro_only", syncedToMeta: false,
    message: "Destaque salvo somente no MecProAI. Anuncios ativos na Meta nao foram alterados." };
}
