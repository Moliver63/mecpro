import { AsyncLocalStorage } from "node:async_hooks";

export interface ChatBriefingState {
  preparation?: { status: "collecting" | "awaiting_ai" };
  briefing: Record<string, unknown>;
  lastCampaign?: { id: number; name: string; projectId: number; url: string; photoCount?: number; coverFileName?: string };
}
export const briefingContext = new AsyncLocalStorage<ChatBriefingState>();
const strings = ["projectName", "name", "objective", "platform", "niche", "productService", "targetAudience", "city", "mediaFormat", "whatsapp", "destinationUrl", "confirmedFacts"];
const numbers = ["projectId", "budget", "durationDays", "ageMin", "ageMax", "featuredPhotoIndex"];

export function mergeChatBriefing(previous: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...previous };
  // Retry feedback belongs to this call, never to another campaign's briefing.
  delete next.forbiddenTerms;
  if (Array.isArray(patch.forbiddenTerms)) {
    const terms = patch.forbiddenTerms.filter((value): value is string => typeof value === "string")
      .map(value => value.trim().slice(0, 200)).filter(Boolean);
    if (terms.length) next.forbiddenTerms = [...new Set(terms)].slice(0, 20);
  }
  if (patch.projectName !== undefined && patch.projectName !== previous.projectName) delete next.confirmDistinctProject;
  for (const field of [...strings, ...numbers, "createProject", "newCampaign", "confirmDistinctProject"]) {
    if (!(field in patch)) continue;
    const value = patch[field];
    if (value === null) { delete next[field]; continue; }
    if (strings.includes(field) && typeof value === "string" && value.trim()) next[field] = value.trim().slice(0, 4000);
    if (numbers.includes(field) && typeof value === "number" && Number.isFinite(value)) next[field] = value;
    if (["createProject", "newCampaign", "confirmDistinctProject"].includes(field) && typeof value === "boolean") next[field] = value;
  }
  if (patch.createProject === true) delete next.projectId;
  if (typeof patch.projectId === "number") { next.createProject = false; if (!("projectName" in patch)) delete next.projectName; }
  return next;
}

export function campaignResultText(campaign: NonNullable<ChatBriefingState["lastCampaign"]>): string {
  return `Rascunho criado: ${campaign.name} (#${campaign.id}).\n${campaign.url}` +
    (campaign.photoCount !== undefined ? `\nFotos encaminhadas ao gerador: ${campaign.photoCount}.` : "") +
    (campaign.coverFileName ? ` Capa solicitada: ${campaign.coverFileName}.` : "") +
    "\nNada foi publicado na Meta.";
}

// Categoria do que o Fact Guard barrou, traduzida do codigo interno.
//
// Os `reason` do guard sao snake_case em ingles — `unverified_benefit_claim`,
// `price_not_confirmed_in_current_briefing`, `area_conflict_expected_120`.
// Mostrar isso cru pro usuario recria exatamente o problema de 17/09 que o
// comentario abaixo descreve. Aqui vira categoria em portugues.
//
// IMPORTANTE: so a CATEGORIA, nunca o valor rejeitado. Ver o comentario em
// generationErrorText sobre por que o valor fica escondido.
const CATEGORIA_DE_CONFLITO: Array<[RegExp, string]> = [
  [/^price_conflict|^price_not_confirmed|^budget_as_price/, "um preco que nao esta no briefing confirmado"],
  [/^address_conflict|^address_not_confirmed/, "um endereco que nao esta no briefing confirmado"],
  [/^area_conflict/, "uma area (m2) diferente da confirmada"],
  [/^property_type_conflict/, "um tipo de imovel diferente do confirmado"],
  [/^purpose_conflict/, "uma finalidade (venda ou locacao) diferente da confirmada"],
  [/^homeownership_claim_conflict/, "uma afirmacao sobre posse do imovel que nao bate com a confirmada"],
  [/^commercial_property_residential_copy|^residential_feature_claim_conflict/, "caracteristica de imovel residencial num imovel comercial"],
  [/^unverified_social_proof/, "prova social (depoimento, numero de clientes) sem comprovacao"],
  [/^unverified_scarcity_or_exclusivity/, "escassez ou exclusividade sem comprovacao"],
  [/^unverified_benefit/, "um beneficio que nao esta no briefing"],
  [/^unconfirmed_offer_claim|^forbidden_claim_not_in_current_briefing/, "uma oferta que nao esta no briefing atual"],
  [/^campaign_objective_conflict/, "um objetivo diferente do escolhido pra campanha"],
  [/^campaign_segment_conflict|^segment_rule_conflict/, "algo que nao cabe no segmento confirmado"],
];

/**
 * Extrai as CATEGORIAS do erro bruto, sem os valores.
 *
 * O erro vem como `FACT_CONFLICT: ... campo: valor (motivo); campo: valor (motivo)`
 * (ver o `preview` em ai.ts). Pegamos somente os motivos entre parenteses.
 */
export function categoriasDeConflito(error: string): string[] {
  const motivos = String(error || "").match(/\(([a-z_0-9]+)\)/g) || [];
  const vistas: string[] = [];
  for (const bruto of motivos) {
    const codigo = bruto.slice(1, -1);
    const achada = CATEGORIA_DE_CONFLITO.find(([re]) => re.test(codigo));
    if (achada && !vistas.includes(achada[1])) vistas.push(achada[1]);
  }
  return vistas.slice(0, 3);
}

export function generationErrorText(error: string): string {
  // Achado real (Michel colou essa mensagem exata, 17/09): "Fact Guard" é
  // nome de módulo interno — um dono de padaria ou corretor de imóveis
  // usando o chat não tem contexto nenhum pro que isso significa. Essa
  // string vira o campo "erro" que o modelo lê e é instruído a "repassar
  // de forma clara" — sem reescrever aqui, existe risco real do modelo
  // simplesmente repetir "Fact Guard" pro cliente final. Reescrito sem
  // jargão interno, e com a próxima ação sugerida (a mesma que a IA já
  // formulava naturalmente antes disso existir como texto fixo — não
  // reescrever isso é regredir a experiência, não só um detalhe de
  // nomenclatura).
  // Ajuste de 10/10, depois do Michel colar a mensagem. Duas coisas estavam
  // erradas, e uma terceira NAO estava — vale registrar a que ficou.
  //
  // FICOU, de proposito: o VALOR rejeitado continua escondido. Mostrar
  // "'piscina aquecida' foi barrada" convida o usuario a responder "confirma
  // ai", e a invencao do modelo entra no briefing como fato confirmado — o
  // exato dano que o Fact Guard existe pra impedir. O prompt diz a mesma coisa
  // ("nao uma escolha para o usuario aceitar fatos inventados") e ha teste
  // travando isso desde 17/09. Quase reverti por parecer descuido; nao e.
  //
  // CORRIGIDO 1: "alguma informação" nao dava nenhuma acao. Agora sai a
  // CATEGORIA do que foi barrado (preco, endereco, prova social...), que
  // orienta sem ancorar: se o preco e real, o caminho e o usuario informar o
  // preco, nao homologar o numero que o modelo inventou.
  //
  // CORRIGIDO 2: "com mais cuidado" prometia diligencia que nada entrega. O
  // mecanismo real e concreto: os termos barrados voltam em `termosRejeitados`
  // e o prompt manda repassa-los como `forbiddenTerms` na proxima chamada
  // (consumido em ai.ts). A frase agora descreve isso, em vez de sugerir que o
  // modelo vai "tentar melhor".
  if (/FACT_CONFLICT/i.test(error)) {
    const categorias = categoriasDeConflito(error);
    const oQue = categorias.length
      ? `O que foi barrado: ${categorias.join("; ")}.`
      : "O texto trouxe informação que não está no briefing confirmado.";
    return "A campanha não foi salva: o verificador de fatos bloqueou antes de gravar, em vez de deixar passar algo que você não disse. " +
      `${oQue} Nada foi publicado, e o seu briefing continua guardado — não precisa repetir nada. ` +
      "Posso gerar de novo já excluindo os termos que foram barrados. " +
      "E se algum desses pontos for verdade, me diga qual que eu registro no briefing primeiro: o que vale é você informar, não aprovar o texto que saiu.";
  }
  return error;
}

export function isLastCampaignLinkRequest(text: string): boolean {
  return /\blink\b/i.test(text) && /mostr|manda|envia|qual|cad[eê]|ver/i.test(text) && !/gerar|criar|nova|\d/.test(text.toLowerCase());
}
