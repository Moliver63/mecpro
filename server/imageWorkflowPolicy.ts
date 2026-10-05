import { createHash } from "node:crypto";

export type VisualDecision = { status: "approved" | "rejected" | "pending_validation"; score: number | null; reason: string; evidence?: string; issues?: string[]; model?: string };
export function visualDecision(value: unknown): VisualDecision {
  const v = value as any;
  if (!v || typeof v.matchesBrief !== "boolean" || typeof v.safe !== "boolean" || typeof v.hasText !== "boolean" ||
      typeof v.quality !== "number" || !Number.isFinite(v.quality) || v.quality < 0 || v.quality > 1 ||
      !Array.isArray(v.issues) || !v.issues.every((x: unknown) => typeof x === "string") || typeof v.evidence !== "string" || !v.evidence.trim()) {
    return { status: "pending_validation", score: null, reason: "validator_invalid_response" };
  }
  const approved = v.matchesBrief && v.safe && !v.hasText && v.quality >= 0.72 && !v.issues.length;
  return { status: approved ? "approved" : "rejected", score: v.quality, reason: approved ? "visual_checks_passed" : "visual_mismatch_or_quality", evidence: v.evidence.slice(0, 2000), issues: v.issues.slice(0, 10).map((s: string) => s.slice(0, 300)) };
}

export function imageBrief(campaign: any, creative: any) {
  const facts = JSON.parse(campaign.aiResponse || "{}").campaignFacts;
  if (!facts?.intent?.segment || !Array.isArray(facts.verifiedFacts) || !facts.verifiedFacts.length || !facts.verifiedFacts.every((f: unknown) => typeof f === "string")) {
    throw new Error("missing_confirmed_brief");
  }
  return { version: 1, segment: facts.intent.segment, objective: campaign.objective,
    facts: facts.verifiedFacts, intent: facts.intent,
    card: { headline: creative.headline, description: creative.description, copy: creative.copy, hook: creative.hook, angle: creative.angle } };
}
export function imageFingerprint(value: unknown) {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, canonical(v[k])])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export function imageField(format: string) { return format === "stories" ? "storyImageUrl" : format === "square" ? "squareImageUrl" : "feedImageUrl"; }

// Achado real (campanha 797, lido no banco em 05/10): as dez tarefas foram
// enfileiradas com format "feed", mas os criativos nao sao todos feed —
// quatro sao `vertical_9_16` (Stories) e tres sao `quadrado_1_1`. O
// `campaignImageJobs` usava um unico `args.format || "feed"` pra chamada
// inteira e nunca olhava a `orientation` de cada criativo.
//
// Consequencia: criativo de Stories recebia imagem 4:5 gravada em
// `storyImageUrl`. E a explicacao mecanica do "Story e Square identicos"
// que estava na lista de pendencias — nao eram identicos por cache, eram
// a MESMA proporcao pedida pros tres.
//
// O formato pedido explicitamente ainda ganha: um criativo pode guardar as
// tres proporcoes, entao pedir "square" pra um card de Stories e intencao
// legitima, nao erro.
//
// Lacuna conhecida: `horizontal_16_9` cai em "feed" porque a fila so tem
// tres formatos (FORMAT_DIMENSIONS, imageField, o enum da ferramenta e a
// coluna do banco). Criar um quarto formato e mudanca de schema, nao de
// mapeamento — fica fora daqui de proposito.
export function formatoPorOrientacao(
  orientacao: unknown,
  formatoPedido?: string,
): "feed" | "stories" | "square" {
  if (formatoPedido === "feed" || formatoPedido === "stories" || formatoPedido === "square") return formatoPedido;
  const o = String(orientacao || "").trim().toLowerCase();
  if (o === "vertical_9_16") return "stories";
  if (o === "quadrado_1_1") return "square";
  return "feed";
}

// Teto de tentativas de validacao. Vive aqui, e nao escrito na mao dentro do
// SQL, porque o resumo abaixo precisa do MESMO numero — se os dois
// divergirem, o resumo passa a mentir sobre o que a fila vai fazer.
export const MAX_TENTATIVAS_VALIDACAO = 3;

export type TarefaDeImagem = { status?: string; attempts?: number; creative_index?: number; format?: string; reason?: string };

/**
 * Achado real (05/10): o chat respondeu a Michel "status: queued (...) nao
 * ha acao manual disponivel para acelerar. Aguarde 10-15 minutos". As tres
 * afirmacoes estavam erradas: as tarefas estavam em `pending_validation`,
 * `action=revalidate` existe no schema da propria ferramenta, e as tarefas
 * tinham esgotado as tres tentativas — esperar nao produziria nada, nunca.
 *
 * A parte que NAO era desobediencia do modelo: nada na resposta da
 * ferramenta dizia que a fila havia desistido. O teto de tentativas e uma
 * regra do SELECT do worker, invisivel pra quem le as linhas. O modelo
 * preencheu a lacuna com a suposicao mais natural ("ainda esta rodando").
 *
 * Entao a correcao principal e de contrato, nao de prompt: a ferramenta
 * passa a dizer, de forma deterministica, se a fila ainda vai agir sozinha
 * e o que destrava quando nao vai.
 */
export function resumoDeTarefasDeImagem(tarefas: TarefaDeImagem[]) {
  const linhas = Array.isArray(tarefas) ? tarefas : [];
  const porStatus: Record<string, number> = {};
  for (const t of linhas) {
    const s = String(t?.status || "desconhecido");
    porStatus[s] = (porStatus[s] || 0) + 1;
  }
  // O worker so volta a pegar: status='queued', ou 'pending_validation' com
  // attempts abaixo do teto. Qualquer outro estado e terminal pra fila.
  const aguardandoFila = linhas.filter(t =>
    t?.status === "queued" ||
    (t?.status === "pending_validation" && Number(t?.attempts ?? 0) < MAX_TENTATIVAS_VALIDACAO));
  const paradas = linhas.filter(t =>
    t?.status === "pending_validation" && Number(t?.attempts ?? 0) >= MAX_TENTATIVAS_VALIDACAO);
  const aprovadas = linhas.filter(t => t?.status === "approved");

  const filaVaiAgir = aguardandoFila.length > 0;
  let destravar: string | null = null;
  if (!filaVaiAgir && paradas.length > 0) {
    destravar = `${paradas.length} tarefa(s) esgotaram as ${MAX_TENTATIVAS_VALIDACAO} tentativas de validacao e a fila NAO vai pegar de novo sozinha. Esperar nao resolve. Use action=revalidate: zera o contador e reanalisa a imagem que ja existe, sem gerar outra.`;
  }

  return {
    total: linhas.length,
    porStatus,
    aprovadas: aprovadas.length,
    aguardandoFila: aguardandoFila.length,
    paradasSemTentativa: paradas.length,
    filaVaiAgir,
    destravar,
    // Frase pronta pro assistente: deterministica, pra ele nao precisar
    // inferir o estado a partir do formato das linhas.
    resumo: linhas.length === 0
      ? "Nenhuma tarefa de imagem registrada para esta campanha."
      : `${linhas.length} tarefa(s): ${Object.entries(porStatus).map(([s, n]) => `${n} ${s}`).join(", ")}. ` +
        (filaVaiAgir
          ? `${aguardandoFila.length} ainda na fila automatica.`
          : "Nenhuma na fila automatica — a fila nao vai agir sozinha."),
  };
}
export function hasCreativeImage(c: any, format: string) {
  return !!(c[imageField(format)] || c.imageUrl || c.imageHash || c.feedImageHash || c.realPhotoUrl);
}

// Segment is authoritative; persuasive copy and place names cannot select another industry.
export function canonicalStockQuery(segment: string, facts: string, index = 0): string {
  const s = segment.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/imove|imobili/.test(s)) {
    if (/sala comercial|imovel comercial|imóvel comercial|ponto comercial/i.test(facts)) return "commercial space interior";
    if (/terreno/i.test(facts)) return "land plot";
    if (/apartamento/i.test(facts)) return "apartment interior";
    return "real estate building";
  }
  const rules: Array<[RegExp, string]> = [
    [/financ/, "financial planning documents calculator"], [/alimenta|restaur|doce/, "food preparation kitchen"],
    [/fitness|academia|esport/, "fitness exercise gym"], [/saude|estet|psicol/, "health wellness professional"],
    [/educa|infoprod/, "education learning study"], [/moda/, "fashion clothing"], [/automot/, "automotive workshop"],
    [/pet/, "pet care"], [/turis/, "travel tourism"], [/constr/, "construction work"], [/event/, "event planning"],
    [/tecn|marketing|b2b/, "business technology workspace"], [/ecommerce/, "product studio photography"],
    [/servic/, "local business service"],
  ];
  const base = rules.find(([pattern]) => pattern.test(s))?.[1] || `${s.replace(/[^a-z0-9 ]/g, " ")} professional`;
  return `${base} ${["detail", "workspace", "overview"][index % 3]}`.trim();
}
