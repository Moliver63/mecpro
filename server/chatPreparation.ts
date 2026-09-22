import { mergeChatBriefing, type ChatBriefingState } from "./chatBriefing";
import { missingCampaignIntake } from "./chatIntake";
import { selectChatProject } from "./chatWorkspace";

type Store = { getProjectsByUserId(userId: number): Promise<Array<{ id: number; name: string }>> };
const key = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const fields: Record<string, string> = { oferta: "productService", diferenciais: "confirmedFacts", segmento: "niche", regiao: "city", publico: "targetAudience", whatsapp: "whatsapp", site: "destinationUrl" };

// Explicit, read-only workspace access; no LLM, generation, project creation or publication.
export async function prepareChatWithoutAI(text: string, state: ChatBriefingState, userId: number, store: Store): Promise<string | null> {
  const start = /^(preparar campanha|\/preparar)$/.test(key(text));
  if (!start && !state.preparation) return null;
  if (key(text) === "/sair") { delete state.preparation; return "Briefing mantido. Voce voltou ao chat; nenhuma campanha foi criada."; }
  const projects = await store.getProjectsByUserId(userId);
  if (!start) {
    const patch: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const line of text.split(/\r?\n/).filter(s => s.trim())) {
      const colon = line.indexOf(":");
      const label = key(line.slice(0, colon));
      const value = line.slice(colon + 1).trim();
      if (colon < 1 || !value || value.length > 4000) { errors.push("Use um campo por linha: Oferta: doces."); continue; }
      if (fields[label]) patch[fields[label]] = value;
      else if (label === "projeto" || label === "novo projeto") {
        if (patch.projectName) { errors.push("Escolha apenas um projeto."); continue; }
        try {
          const args = { projectName: value, createProject: label === "novo projeto" };
          const project = selectChatProject(projects, args);
          Object.assign(patch, project ? { projectId: project.id, projectName: project.name, createProject: false } : args);
        } catch { errors.push("Confira o nome do projeto. Para projeto existente, use o nome exato da lista; nao duplique um nome parecido."); }
      } else if (label === "capa") {
        if (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 10) patch.featuredPhotoIndex = Number(value) - 1;
        else errors.push("Capa: numero da foto de 1 a 10.");
      } else if (label === "orcamento total" || label === "duracao") {
        const valid = label === "duracao" ? /^\d+$/.test(value) : /^\d+(?:[,.]\d{1,2})?$/.test(value);
        const n = Number(value.replace(",", "."));
        if (!valid || !Number.isFinite(n) || n <= 0 || (label === "duracao" && n > 365)) errors.push("Use Orcamento total: 1500,00 (sem milhares) e Duracao: 30 (dias).");
        else patch[label === "duracao" ? "durationDays" : "budget"] = n;
      } else {
        const options: Record<string, Record<string, string>> = {
          objetivo: { contatos: "leads", leads: "leads", vendas: "sales", trafego: "traffic", reconhecimento: "branding", engajamento: "engagement" },
          plataforma: { meta: "meta", google: "google", tiktok: "tiktok" },
          formato: { imagem: "image", video: "video", carrossel: "carousel", misto: "mixed" },
        };
        const valueKey = options[label]?.[key(value)];
        if (!valueKey) errors.push(`Confira o campo ${label}; nenhum valor foi inferido.`);
        else patch[({ objetivo: "objective", plataforma: "platform", formato: "mediaFormat" } as Record<string, string>)[label]] = valueKey;
      }
    }
    if (errors.length) return `Nao alterei o briefing. ${[...new Set(errors)].join(" ")}`;
    const switched = patch.projectName && patch.projectName !== state.briefing.projectName;
    state.briefing = mergeChatBriefing(switched ? {} : state.briefing, patch);
  }
  state.preparation = { status: "collecting" };
  const missing = missingCampaignIntake(state.briefing);
  if (!missing.length && (state.briefing.projectId || state.briefing.createProject)) state.preparation.status = "awaiting_ai";
  const names = projects.slice(0, 10).map(p => `- ${p.name.replace(/[\r\n]/g, " ")}`).join("\n");
  const instructions = "Nenhuma campanha foi criada ou publicada nesta etapa. Com projeto existente e briefing preenchido, envie /rascunho para salvar um rascunho basico bloqueado para publicacao. Com varias fotos, informe Capa: numero da foto. Use /sair para voltar ao chat.";
  return (start ? `Preparacao sem IA. Projetos:\n${names || "Nenhum projeto cadastrado."}\nEnvie juntos, um por linha:\nProjeto: nome existente OU Novo projeto: nome\nOferta: ...\nDiferenciais: ...\nObjetivo: contatos/vendas/trafego/reconhecimento/engajamento\nPlataforma: Meta/Google/TikTok\nRegiao: ...\nPublico: ...\nOrcamento total: 1500\nDuracao: 30\nWhatsApp: ... OU Site: ...\nFormato: imagem/video/carrossel\n` : `Briefing atualizado na conversa. Dados ainda sugeridos: ${missing.join("; ") || "briefing inicial preenchido"}.\n`) + instructions;
}
