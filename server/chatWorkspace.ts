type Project = { id: number; name: string };
export interface ChatWorkspaceStore {
  getProjectsByUserId(userId: number): Promise<any[]>;
  getCampaignsByProjectId(projectId: number): Promise<any[]>;
  getCampaignById(campaignId: number): Promise<any>;
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
    if (parecido) {
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
    objective: c.objective, url: `/projects/${project.id}/campaign/result/${c.id}` });
  if (args.campaignId != null) {
    const campaign = await store.getCampaignById(Number(args.campaignId));
    if (!campaign || campaign.projectId !== project.id) return { erro: "Campanha nao encontrada neste projeto." };
    return { campaign: summarize(campaign), readOnly: true,
      instruction: "Apresente o link para abrir a campanha. Esta consulta nao altera nem publica campanhas." };
  }
  const campaigns = await store.getCampaignsByProjectId(project.id);
  return { project: { id: project.id, name: project.name }, campaigns: campaigns.slice(offset, offset + 30).map(summarize),
    nextOffset: offset + 30 < campaigns.length ? offset + 30 : null,
    question: "Deseja abrir uma campanha existente ou criar uma nova neste projeto?" };
}
