// Correcao de divergencias de oferta no RASCUNHO.
//
// Aplicar uma sugestao ou uma edicao manual so grava o texto do criativo salvo.
// Nao publica, nao aprova revisao e nao toca na Meta. A sugestao e recalculada
// aqui no servidor a partir dos fatos confirmados: o cliente nunca manda o
// texto novo de uma sugestao, so qual divergencia quer resolver.
import { validateCampaignFactIntegrity, type CampaignFacts } from "./campaignFactGuard";
import { applyOfferSuggestions } from "./campaignOfferGuard";

type Passo = string | number;

function passosDoCaminho(caminho: string): Passo[] | null {
  if (!caminho || caminho.length > 200) return null;
  const passos: Passo[] = [];
  for (const parte of caminho.split(".")) {
    const m = parte.match(/^([A-Za-z_][A-Za-z0-9_]*)((?:\[\d+\])*)$/);
    if (!m) return null;
    passos.push(m[1]);
    for (const idx of m[2].matchAll(/\[(\d+)\]/g)) passos.push(Number(idx[1]));
  }
  return passos.length ? passos : null;
}

// So campos de copy sao editaveis por aqui (nunca URL, id ou flag).
const CAMPOS_DE_COPY = /^(headline|description|shortDescription|copy|bodyText|primaryText|hook|cta|script|text|title|subtitle|body|caption|narration|voiceover|callToAction|ctaText|ctaLabel)$/;

const PROIBIDOS = new Set(["__proto__", "constructor", "prototype"]);

function ler(raiz: any, passos: Passo[]): unknown {
  let atual = raiz;
  for (const p of passos) {
    if (atual === null || typeof atual !== "object") return undefined;
    if (typeof p === "string" && PROIBIDOS.has(p)) return undefined;
    atual = atual[p as any];
  }
  return atual;
}

function gravar(raiz: any, passos: Passo[], valor: string): boolean {
  const pai = ler(raiz, passos.slice(0, -1));
  const ultimo = passos[passos.length - 1];
  if (pai === null || typeof pai !== "object") return false;
  if (typeof ultimo === "string" && PROIBIDOS.has(ultimo)) return false;
  if (typeof (pai as any)[ultimo as any] !== "string") return false;
  (pai as any)[ultimo as any] = valor;
  return true;
}

/** Texto atual de um campo do criativo salvo, ou null se o caminho nao existe ou nao e texto. */
export function lerTextoDoCriativo(criativo: unknown, caminho: string): string | null {
  const passos = passosDoCaminho(caminho);
  if (!passos) return null;
  const v = ler(criativo, passos);
  return typeof v === "string" ? v : null;
}

export type ResolverDivergenciaEntrada = {
  criativo: number;
  caminho: string;
  modo: "sugestao" | "manual";
  novoTexto?: string;
};

// Forma plana: com `strict: false` o TypeScript nao estreita uniao por `ok`.
export type ResolverDivergenciaResultado = {
  ok: boolean;
  erro?: string;
  creatives?: any[];
  antes?: string;
  depois?: string;
};

export function resolverDivergenciaNoRascunho(campaign: any, entrada: ResolverDivergenciaEntrada): ResolverDivergenciaResultado {
  let creatives: any[];
  let facts: CampaignFacts | undefined;
  try {
    creatives = JSON.parse(campaign?.creatives || "[]");
    facts = JSON.parse(campaign?.aiResponse || "{}")?.campaignFacts;
  } catch { return { ok: false, erro: "Rascunho com dados inválidos; regenere a campanha." }; }
  if (!Array.isArray(creatives) || !creatives[entrada.criativo]) return { ok: false, erro: "Criativo não encontrado neste rascunho." };
  const passos = passosDoCaminho(entrada.caminho);
  if (!passos) return { ok: false, erro: "Campo inválido." };
  const folha = passos.filter((p) => typeof p === "string").pop() as string;
  if (!CAMPOS_DE_COPY.test(folha)) return { ok: false, erro: "Só campos de texto da copy podem ser editados aqui." };
  const atual = ler(creatives[entrada.criativo], passos);
  if (typeof atual !== "string") return { ok: false, erro: "Esse campo não é um texto editável do criativo." };

  let novo: string;
  if (entrada.modo === "manual") {
    novo = String(entrada.novoTexto ?? "").replace(/\s+/g, " ").trim();
    if (!novo) return { ok: false, erro: "O texto novo não pode ficar vazio." };
    if (novo.length > 2000) return { ok: false, erro: "Texto longo demais." };
  } else {
    if (!facts?.confirmedClaimsRaw && facts?.confirmedClaimsRaw !== "") return { ok: false, erro: "Rascunho sem fatos validados; regenere a campanha." };
    const conflitos = validateCampaignFactIntegrity([{ text: atual }], facts as CampaignFacts).conflicts
      .filter((c) => c.kind && c.suggestion);
    if (!conflitos.length) return { ok: false, erro: "Não há sugestão baseada na oferta confirmada para este campo. Edite o texto ou confirme a oferta no briefing." };
    novo = applyOfferSuggestions(atual, conflitos as any);
    if (!novo) return { ok: false, erro: "A sugestão deixaria o campo vazio. Edite o texto manualmente." };
    if (novo === atual) return { ok: false, erro: "A sugestão não alterou o texto." };
  }
  if (!gravar(creatives[entrada.criativo], passos, novo)) return { ok: false, erro: "Não consegui gravar o campo." };
  return { ok: true, creatives, antes: atual, depois: novo };
}
