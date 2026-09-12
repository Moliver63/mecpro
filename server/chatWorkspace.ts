type Project = { id: number; name: string };
export interface ChatWorkspaceStore {
  getProjectsByUserId(userId: number): Promise<any[]>;
  getCampaignsByProjectId(projectId: number): Promise<any[]>;
  getCampaignById(campaignId: number): Promise<any>;
}

export function selectChatProject(projects: Project[], args: Record<string, unknown>): Project | null {
  const name = typeof args.projectName === "string" ? args.projectName.trim().toLowerCase() : "";
  if (args.createProject === true) {
    if (args.projectId != null) throw new Error("Escolha projeto existente ou novo, nao os dois.");
    if (typeof args.projectName !== "string" || !args.projectName.trim()) throw new Error("Qual sera o nome do novo projeto?");
    if (projects.some(p => p.name.trim().toLowerCase() === String(args.projectName).trim().toLowerCase())) {
      throw new Error("Ja existe um projeto com esse nome. Confirme se deseja usa-lo pelo projectId.");
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
