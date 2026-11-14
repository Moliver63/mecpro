import { z } from "zod";
import { validateCampaignFactIntegrity, type CampaignFacts } from "./campaignFactGuard";

// Achado real (log de produção, 19/09, e novamente 23/09 com campo
// diferente): campos que a estrutura do criativo realmente tem — "pain"
// (dor que o criativo endereça) e "solution" (solução que o produto
// oferece) — checados pelo Fact Guard igual qualquer outro campo de
// texto, mas NUNCA faziam parte do que o modelo era autorizado a
// reescrever aqui (só headline/description/copy/hook/cta). Resultado
// real: violação detectada em "pain"/"solution" → sistema pede pro
// modelo "remova essa alegação" → modelo não tem como, porque o campo
// nem está na lista do que ele pode editar → campanha falha sempre, em
// TODAS as tentativas, sem chance real de sucesso. Limites (160 pra
// pain, 220 pra solution) já eram usados em outros lugares do código
// pra esses mesmos campos (server/ai.ts).
export const CREATIVE_TEXT_LIMITS = { headline: 40, description: 30, copy: 500, hook: 200, cta: 80, pain: 160, solution: 220, script: 900, shortDescription: 30, bodyText: 500 } as const;
export type CreativeTextField = keyof typeof CREATIVE_TEXT_LIMITS;
const rewriteSchema = z.object({
  headline: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.headline),
  description: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.description),
  copy: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.copy),
  hook: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.hook),
  cta: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.cta),
  pain: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.pain).optional(),
  solution: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.solution).optional(),
  script: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.script).optional(),
  shortDescription: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.shortDescription).optional(),
  bodyText: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.bodyText).optional(),

}).strict();

export const CREATIVE_REWRITE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: Object.fromEntries(Object.entries(CREATIVE_TEXT_LIMITS)

    .map(([key, limit]) => [key, { type: "STRING", description: `Texto nao vazio, no maximo ${limit} caracteres.` }])),
  required: ["headline", "description", "copy", "hook", "cta", "pain", "solution"],
};

export function parseCreativeRewrite(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(text); }
  catch { throw new Error("rewrite_invalid_json: retorne JSON completo com aspas duplas e sete campos; nao corte strings."); }
}

export function creativeRewriteFeedback(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const detail = /^rewrite_(invalid_schema|invalid_json|fact_conflict|placeholder)/.test(message)
    ? message.slice(0, 700) : "Resposta incompleta ou indisponivel; devolva novamente o objeto completo.";
  return `ERRO DA TENTATIVA ANTERIOR (validacao, nao fatos da oferta): ${detail}\nCorrija o erro sem acrescentar fatos e preserve os sete campos.\n`;
}

export function acceptCreativeRewrite(original: any, response: unknown, facts: CampaignFacts, auditSegment?: (candidate: any) => string[]) {
  const parsed = rewriteSchema.safeParse(response);
  if (!parsed.success) {
    // Achado real (log de producao, 21/09): "rewrite_invalid_schema"
    // acontecia com frequencia (3 de 8 tentativas de melhoria num unico
    // log real) sem NENHUM detalhe de qual campo falhou — o erro do Zod
    // (que diria exatamente "cta: no maximo 80 caracteres" ou "campo
    // extra nao permitido: reasoning") era descartado por completo antes
    // de chegar no log. Inclui os detalhes reais no throw — quem chama
    // ja loga e.message, entao isso vira diagnostico automatico sem
    // precisar mudar mais nada la.
    const detalhes = parsed.error.issues.map(i => `${i.path.join(".") || "(raiz)"}: ${i.message}`).join("; ");
    throw new Error(`rewrite_invalid_schema: ${detalhes}`);
  }
  const texts = Object.values(parsed.data).join(" ");
  if (/\[[^\]]+\]|\{[^}]+\}|EMPRESA_AQUI|PRODUTO_AQUI|\bXXX+\b/i.test(texts)) {
    throw new Error("rewrite_placeholder");
  }
  // Update only text aliases of the old copy, never IDs, ordering or media.
  const candidate = applyTextPatch(original, parsed.data);
  if (auditSegment) candidate.segmentAlignmentIssues = auditSegment(candidate);
  const audit = validateCampaignFactIntegrity([candidate], facts);
  if (audit.status !== "passed") throw new Error(`rewrite_fact_conflict:${audit.conflicts.map(c => c.reason).join(",")}`);
  return candidate;
}

export function duplicateCreativeFields(creatives: any[], index: number): CreativeTextField[] {
  const normalized = (value: unknown) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  return (["headline", "description"] as CreativeTextField[]).filter(field => {
    const text = normalized(creatives[index]?.[field]);
    return !!text && creatives.slice(0, index).some(c => normalized(c[field]) === text);
  });
}

export function creativeTextIssues(creative: any): string[] {
  const texts = Object.fromEntries(Object.keys(CREATIVE_TEXT_LIMITS).filter(k => creative[k] !== undefined).map(k => [k, creative[k]]));
  const result = rewriteSchema.safeParse(texts);
  return result.success ? [] : result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`);
}

function applyTextPatch(original: any, patch: Record<string, string>) {
  const candidate = structuredClone(original);
  const pairs = Object.entries(patch).map(([key, value]) => [original[key], value]);
  function sync(node: any) {
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) {
      if (typeof node[key] === "object") sync(node[key]);
      else if (["text", "headline", "copy", "bodyText", "description", "shortDescription", "hook", "cta", "pain", "solution", "script"].includes(key)) {
        const pair = pairs.find(([old]) => typeof old === "string" && old && node[key] === old);
        if (pair) node[key] = pair[1];
      }
    }
  }
  // Do not infer aliases between distinct primary fields that happen to match.
  for (const value of Object.values(candidate)) if (value && typeof value === "object") sync(value);
  Object.assign(candidate, patch);
  if (patch.copy !== undefined) candidate.bodyText = patch.copy;
  if (patch.description !== undefined) candidate.shortDescription = patch.description;
  return candidate;
}

/** Accept independent valid fields without discarding them because a sibling failed.
 * The caller must still audit the complete campaign before saving/publication. */
export function repairCreativeFields(original: any, response: unknown, facts: CampaignFacts,
  fields: CreativeTextField[] = Object.keys(CREATIVE_TEXT_LIMITS) as CreativeTextField[]) {
  if (!response || typeof response !== "object" || Array.isArray(response)) throw new Error("rewrite_invalid_schema: objeto de textos esperado");
  const input = response as Record<string, unknown>;
  if (Object.keys(input).some(key => !(key in CREATIVE_TEXT_LIMITS))) throw new Error("rewrite_invalid_schema: campo nao autorizado");
  const patch: Record<string, string> = {};
  const rejected: CreativeTextField[] = [];
  const issues: string[] = [];
  for (const field of fields) {
    if (field === "bodyText" && input.copy !== undefined && fields.includes("copy")) continue;
    if (field === "shortDescription" && input.description !== undefined && fields.includes("description")) continue;
    if (["pain", "solution", "script", "bodyText", "shortDescription"].includes(field) && original[field] === undefined && input[field] === undefined) continue;
    const result = z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS[field]).safeParse(input[field]);
    let reason = result.success ? "" : `use de 1 a ${CREATIVE_TEXT_LIMITS[field]} caracteres`;
    if (result.success) {
      if (/\[[^\]]+\]|\{[^}]+\}|EMPRESA_AQUI|PRODUTO_AQUI|\bXXX+\b/i.test(result.data)) reason = "remova placeholders";
      const audit = validateCampaignFactIntegrity([{ [field]: result.data }], facts);
      if (audit.status !== "passed") reason = audit.conflicts.map(c => `${c.reason}: ${c.value}`).join("; ");
    }
    if (reason) { rejected.push(field); issues.push(`${field}: ${reason}`); }
    else if (result.success) patch[field] = result.data;
  }
  return { candidate: applyTextPatch(original, patch), rejected, issues, accepted: Object.keys(patch) };
}

/**
 * Escolhe a melhor reescrita entre candidatos de provedores diferentes.
 *
 * Cada candidato ja passou por `repairCreativeFields` (schema, placeholder e
 * Fact Guard campo a campo), sempre a partir da MESMA base. Aqui so se
 * ordena, de forma determinística:
 *   1. Fact Guard do criativo INTEIRO aprovado (campo rejeitado preserva o
 *      original, que pode ser justamente o que tinha a alegacao — por isso o
 *      criativo inteiro vem antes da contagem de rejeitados)
 *   2. menos campos rejeitados
 *   3. menos problemas extras (headline/description repetida de outro card,
 *      vocabulario de outro segmento) — no reparo de irmaos do carrossel, a
 *      repeticao e o motivo da chamada
 *   4. menos problemas de comprimento/formato (`creativeTextIssues`)
 *   5. maior score
 *   6. empate: a ordem de entrada (o primeiro e o provedor primario)
 * Score e problemas extras entram por parametro pra funcao nao depender do
 * motor de scoring nem do contexto da campanha.
 * Ver docs/specs/2026-11-14-reescrita-multi-provedor.md.
 */
export type CandidatoReescrita = {
  provedor: string;
  candidate: any;
  rejected: CreativeTextField[];
  issues: string[];
  accepted: string[];
};

export type ReescritaAvaliada = CandidatoReescrita & {
  score: number; factOk: boolean; textIssues: number; extras: number;
};

export function avaliarReescrita(
  c: CandidatoReescrita,
  facts: CampaignFacts,
  pontuar: (creative: any) => number,
  problemasExtras: (creative: any) => number = () => 0,
): ReescritaAvaliada {
  return {
    ...c,
    score: pontuar(c.candidate),
    factOk: validateCampaignFactIntegrity([c.candidate], facts).status === "passed",
    textIssues: creativeTextIssues(c.candidate).length,
    extras: problemasExtras(c.candidate),
  };
}

/** Reescrita boa o bastante pra nao esperar o segundo provedor. */
export function reescritaSuficiente(r: ReescritaAvaliada, limiarScore: number): boolean {
  return r.factOk && !r.rejected.length && !r.extras && !r.textIssues && r.score >= limiarScore;
}

export function escolherMelhorReescrita(
  candidatos: CandidatoReescrita[],
  facts: CampaignFacts,
  pontuar: (creative: any) => number,
  problemasExtras: (creative: any) => number = () => 0,
): ReescritaAvaliada | null {
  if (!candidatos.length) return null;
  const avaliados = candidatos.map((c, ordem) => ({ ...avaliarReescrita(c, facts, pontuar, problemasExtras), ordem }));
  avaliados.sort((a, b) =>
    Number(b.factOk) - Number(a.factOk)
    || a.rejected.length - b.rejected.length
    || a.extras - b.extras
    || a.textIssues - b.textIssues
    || b.score - a.score
    || a.ordem - b.ordem);
  const { ordem: _ordem, ...melhor } = avaliados[0];
  return melhor;
}

/**
 * Erros OBJETIVOS por campo: comprimento, placeholder, Fact Guard do campo
 * isolado e repeticao entre cards. Score baixo (hook fraco, falta de urgencia)
 * nao entra aqui de proposito: isso e qualidade, nao erro, e "consertar"
 * urgencia sem fato confirmado seria inventar prazo.
 * Espelhos: bodyText → copy, shortDescription → description.
 * Ver docs/specs/2026-11-14-conserto-dirigido-cloudflare.md.
 */
const ESPELHOS: Partial<Record<CreativeTextField, CreativeTextField>> = { bodyText: "copy", shortDescription: "description" };
// Mesma definicao do hasResidualPlaceholder de ai.ts (aceita [] vazio), pra o
// conserto e a saida antecipada do laco concordarem sobre "tem placeholder".
const PLACEHOLDER_RE = /\[[^\]]*?\]|\{[^}]*?\}|EMPRESA_AQUI|PRODUTO_AQUI|\bXXX+\b/i;

export function camposComErroObjetivo(
  creative: any,
  facts: CampaignFacts,
  duplicados: CreativeTextField[] = [],
): Array<{ campo: CreativeTextField; motivos: string[] }> {
  const porCampo = new Map<CreativeTextField, string[]>();
  const anotar = (campo: CreativeTextField, motivo: string) => {
    // Espelho vira o principal so quando carrega o mesmo texto; senao o
    // pedido mostraria o texto do principal com o motivo do espelho.
    const principal = ESPELHOS[campo];
    const alvo = principal && typeof creative?.[principal] === "string" && String(creative[principal]).trim() === String(creative[campo]).trim() ? principal : campo;
    const lista = porCampo.get(alvo) || [];
    if (!lista.includes(motivo)) lista.push(motivo);
    porCampo.set(alvo, lista);
  };
  for (const campo of Object.keys(CREATIVE_TEXT_LIMITS) as CreativeTextField[]) {
    const valor = creative?.[campo];
    if (typeof valor !== "string") continue;
    const limite = CREATIVE_TEXT_LIMITS[campo];
    const texto = valor.trim();
    if (!texto) { anotar(campo, "vazio"); continue; }
    if (texto.length > limite) anotar(campo, `acima de ${limite} caracteres (tem ${texto.length})`);
    if (PLACEHOLDER_RE.test(texto)) anotar(campo, "placeholder nao substituido");
    const audit = validateCampaignFactIntegrity([{ [campo]: texto }], facts);
    if (audit.status !== "passed") {
      for (const c of audit.conflicts) anotar(campo, `alegacao nao confirmada: "${c.value}" (${c.reason})`);
    }
  }
  for (const campo of duplicados) anotar(campo, "repetido em outro card");
  return [...porCampo.entries()].map(([campo, motivos]) => ({ campo, motivos }));
}

/**
 * Travas deterministicas para campo devolvido pelo conserto dirigido, alem do
 * Fact Guard (revisao Goldfish, 14/11):
 *  - negacao perdida reprova (mesma trava do truncarCamposNoLimite: encurtar
 *    "Nao garantimos aprovacao" pode virar "Garantimos aprovacao")
 *  - numero novo reprova: o Fact Guard nao pega "ultimas 10 vagas" nem prazo
 *    com numero; todo numero do texto novo precisa existir no texto original
 *    ou nos fatos confirmados.
 */
export function textoDeFatosConfirmados(facts: CampaignFacts): string {
  // SO o que o cliente confirmou. Nunca formatCampaignFactsForPrompt: ele
  // inclui a lista PROIBIDO ("3 suites", "4 vagas", "24h") e liberaria
  // justamente esses numeros (revisao Goldfish do diff, 14/11).
  return [...(facts.offerAnchor || []), ...(facts.verifiedFacts || []), facts.confirmedClaimsRaw || ""].join(" ");
}

export function motivoParaRecusarConserto(original: string, novo: string, fatosConfirmados: string): string | null {
  if (contarNegacoes(novo) < contarNegacoes(original)) return "negacao_perdida";
  const numeros = (t: string) => String(t).match(/\d+(?:[.,]\d+)*/g) || [];
  const formas = (n: string) => [n, n.replace(",", "."), n.replace(/\D/g, "")];
  const conhecidos = new Set([...numeros(original), ...numeros(fatosConfirmados)].flatMap(formas));
  const novos = numeros(novo).filter(n => !formas(n).some(f => conhecidos.has(f)));
  return novos.length ? `numero_novo:${novos.join(",")}` : null;
}

/**
 * Melhor versao entre tentativas. Mesma ordem da escolha entre provedores,
 * sem contar pendentes; empate fica com a versao guardada.
 */
export function manterMelhorVersao<T extends { criativo: any; pendentes?: CreativeTextField[] }>(
  guardada: T, nova: T, facts: CampaignFacts,
  pontuar: (creative: any) => number, problemasExtras: (creative: any) => number = () => 0,
): T {
  // Pendentes NAO entram no ranking: campo rejeitado mantem o original, que
  // costuma estar limpo, e contar isso descartava reescrita de score 88 por
  // uma de 55 (revisao do diff, 14/11). Duplicata ja conta em problemasExtras
  // e erro de verdade aparece em Fact Guard/limites.
  const comoCandidato = (v: T): CandidatoReescrita =>
    ({ provedor: "versao", candidate: v.criativo, rejected: [], issues: [], accepted: [] });
  const r = escolherMelhorReescrita([comoCandidato(guardada), comoCandidato(nova)], facts, pontuar, problemasExtras);
  return r && r.candidate === nova.criativo && nova.criativo !== guardada.criativo ? nova : guardada;
}

/** Tira raciocinio (<think>) e texto em volta do JSON. Sem JSON, devolve o texto limpo. */
export function extrairJsonDeResposta(texto: string): string {
  const semThink = String(texto ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "").trim();
  const ini = semThink.indexOf("{");
  const fim = semThink.lastIndexOf("}");
  return ini >= 0 && fim > ini ? semThink.slice(ini, fim + 1) : semThink;
}

/**
 * Corta texto no limite sem deixar fragmento feio.
 *
 * Preferencia: fim de frase; depois fronteira de palavra; nunca no meio da
 * palavra (a nao ser que a palavra sozinha ja estoure o limite). Sem reticencias
 * — headline de anuncio terminando em "..." parece bug, nao escolha.
 */
const CONECTORES_SOLTOS = new Set(["e", "ou", "de", "da", "do", "das", "dos", "para", "pra", "com", "sem",
  "que", "a", "o", "as", "os", "em", "no", "na", "nos", "nas", "por", "pelo", "pela", "ao", "aos", "à", "às",
  "um", "uma", "se", "mas", "como", "ate", "até", "mais", "seu", "sua", "meu", "minha", "nosso", "nossa"]);

export function cortarNoLimite(texto: string, limite: number): string {
  const limpo = String(texto ?? "").trim();
  if (limpo.length <= limite) return limpo;
  const janela = limpo.slice(0, limite);

  // Fim de frase ganha de fronteira de palavra quase sempre: terminar no meio da
  // frase e o defeito que aparece no anuncio ("Entenda sua historia. Comece a
  // jornada"), e isso pesa mais que o numero de caracteres preservados. O piso
  // de 30% nao existe pra maximizar texto, existe pra evitar corte absurdo —
  // texto que comeca em "Ex. " nao pode virar uma headline de tres letras.
  const fimDeFrase = Math.max(janela.lastIndexOf("."), janela.lastIndexOf("!"), janela.lastIndexOf("?"));
  if (fimDeFrase >= Math.floor(limite * 0.3)) return janela.slice(0, fimDeFrase + 1).trim();

  // Se o caractere seguinte ao limite ja e espaco, a janela termina em fim de
  // palavra: recuar pro espaco anterior jogaria fora uma palavra inteira que
  // cabia ("...todos os alunos" perderia "alunos").
  const espaco = /\s/.test(limpo[limite] || "") ? janela.length : janela.lastIndexOf(" ");
  let corte = (espaco > 0 ? janela.slice(0, espaco) : janela).trim();

  // Colchete ou chave aberta e nao fechada vira "[nova" visivel no anuncio, e o
  // teste de placeholder (que exige o par) nao pega isso. Corta no abre.
  for (const [abre, fecha] of [["[", "]"], ["{", "}"]] as const) {
    const ultimoAbre = corte.lastIndexOf(abre);
    if (ultimoAbre > 0 && corte.indexOf(fecha, ultimoAbre) === -1) corte = corte.slice(0, ultimoAbre).trim();
  }

  // Nao terminar em pontuacao solta nem conector pendurado ("Jornada de" ).
  for (let i = 0; i < 4; i++) {
    const antes = corte;
    corte = corte.replace(/[\s,;:·\-–—/|(\[{"']+$/u, "").trim();
    const partes = corte.split(/\s+/);
    const ultima = (partes[partes.length - 1] || "").toLowerCase().replace(/[.,;:!?]+$/u, "");
    if (partes.length > 1 && CONECTORES_SOLTOS.has(ultima)) { partes.pop(); corte = partes.join(" "); }
    if (corte === antes) break;
  }

  // Se a limpeza comeu tudo, corte duro: estar no limite vale mais que elegancia.
  return corte.trim() || limpo.slice(0, limite).trim();
}

/**
 * Truncagem determinística como ULTIMO recurso de comprimento.
 *
 * Achado real (log de producao, 14/10, projeto 49 — Shadia Hasan):
 *
 *  - card 1: `headline` reprovada nas DUAS tentativas de reescrita
 *  - card 4: `copy` reprovada nas DUAS tentativas
 *  - fim do laco: `CREATIVE_REPAIR_REQUIRED: card 1: headline: ao menos 40
 *    caracteres; card 4: copy/bodyText: ao menos 500` e a campanha inteira morre
 *
 * A causa nao e o modelo ter ido mal: e estrutural. `repairCreativeFields`
 * rejeita a reescrita ruim e **preserva o campo original**, sem nunca checar se
 * o original e valido. Quando o que esta quebrado E o original (longo demais) e
 * o modelo falha dentro do limite de tentativas, o laco termina segurando um
 * campo invalido e sem saida nenhuma. O log "preservando campos validos" estava
 * literalmente errado nesse caso: preservou campo INVALIDO.
 *
 * E o prompt ja pedia certo — "máx 40 caracteres — mire em até 34 pra ter folga
 * (conte antes de responder)". Pedia duas vezes, com margem. Modelo de
 * linguagem nao conta caractere de forma confiavel: era restricao determinística
 * sendo cobrada de um processo probabilistico, sem plano B.
 *
 * Contar e cortar nao precisa de LLM. Mesmo padrao e mesma logica do
 * `stripPlaceholders` em ai.ts: regeneracao falhou, limpeza determinística vale
 * mais que falhar a campanha.
 *
 * DUAS travas, porque cortar texto PODE inverter sentido ("não garantimos
 * retorno" → "garantimos retorno" seria catastrofico num anuncio em nome do
 * cliente):
 *
 *  1. Negacao perdida reprova o corte. Se o original tem `não/nunca/jamais/
 *     nenhum/sem` e o corte tem menos, o campo nao e truncado.
 *  2. Fact Guard roda no texto JA cortado. Corte que vira alegacao nao
 *     confirmada e descartado.
 *
 * Campo que nao passa nas travas continua invalido e a campanha continua
 * falhando — de proposito. A assimetria manda: reprovar a mais custa um erro
 * claro (que e o que ja acontece hoje), aprovar a mais custa anuncio publicado
 * com sentido invertido.
 */
// Lookaround, nao grupo: delimitador consumido faria "nao nunca" contar 1 em vez
// de 2, e subcontar o ORIGINAL e justamente o erro que libera um corte perigoso.
const NEGACOES = String.raw`(?<![\p{L}])(?:n[ãa]o|nunca|jamais|nenhum[ao]?s?|sem)(?![\p{L}])`;

function contarNegacoes(texto: string): number {
  // `lastIndex` compartilhado entre chamadas daria contagem errada: recria.
  return (String(texto).match(new RegExp(NEGACOES, "giu")) || []).length;
}

export function truncarCamposNoLimite(original: any, facts: CampaignFacts) {
  const patch: Record<string, string> = {};
  const truncados: CreativeTextField[] = [];
  const naoResolvidos: string[] = [];

  // `bodyText`/`shortDescription` entram no laco igual aos outros: se `copy` ou
  // `description` tambem forem truncadas, o espelhamento de `applyTextPatch`
  // sobrescreve o par e eles ficam alinhados. Se so o espelho estourar o limite
  // (par ja divergente antes daqui), ele e corrigido sozinho — melhor que
  // deixar campo invalido e derrubar a campanha por ele.
  for (const campo of Object.keys(CREATIVE_TEXT_LIMITS) as CreativeTextField[]) {
    const valor = original[campo];
    if (typeof valor !== "string") continue;
    const limite = CREATIVE_TEXT_LIMITS[campo];
    if (valor.trim().length <= limite) continue;

    const corte = cortarNoLimite(valor, limite);
    if (!corte || corte.length > limite) { naoResolvidos.push(`${campo}: corte nao coube no limite`); continue; }
    if (contarNegacoes(corte) < contarNegacoes(valor)) { naoResolvidos.push(`${campo}: corte removeria uma negacao`); continue; }
    if (/\[[^\]]+\]|\{[^}]+\}|EMPRESA_AQUI|PRODUTO_AQUI|\bXXX+\b/i.test(corte)) { naoResolvidos.push(`${campo}: corte expoe placeholder`); continue; }
    const audit = validateCampaignFactIntegrity([{ [campo]: corte }], facts);
    if (audit.status !== "passed") { naoResolvidos.push(`${campo}: corte vira alegacao nao confirmada`); continue; }

    patch[campo] = corte;
    truncados.push(campo);
  }

  return { candidate: truncados.length ? applyTextPatch(original, patch) : original, truncados, naoResolvidos };
}

/**
 * O erro do enriquecimento deve subir pro usuario, ou pode ser engolido?
 *
 * Achado real (log de producao, 10/10, campanha 797 — cadeia completa):
 *
 *  1. A geracao escreveu no criativo 2 uma `description` com prova social
 *     ("Depoimentos de quem ja fez...") que nao esta nos fatos confirmados.
 *  2. O laco de reparo DETECTOU e CORRIGIU: na tentativa 2 a `description` foi
 *     aceita — e `repairCreativeFields` so aceita campo que passa no Fact
 *     Guard, entao o texto novo estava limpo.
 *  3. Mas o **card 1** tinha `description` acima de 30 caracteres que duas
 *     reescritas nao resolveram, e a checagem final lanca
 *     `CREATIVE_REPAIR_REQUIRED`.
 *  4. O catch em ai.ts ENGOLIA esse erro, e `creatives` nunca era reatribuido
 *     — a lista reparada inteira ia pro lixo e a campanha seguia com os
 *     criativos ORIGINAIS.
 *  5. O Fact Guard de fora rodava nos originais e matava a campanha pela prova
 *     social do criativo 2 — a que ja tinha sido consertada no passo 2.
 *
 * Resultado: sete chamadas de LLM de reparo jogadas fora por causa de OUTRO
 * card, e uma mensagem de erro culpando "informacao nao confirmada" quando a
 * causa real era comprimento de campo. Essa troca de culpa me levou a tres
 * hipoteses erradas antes de eu ler a linha de cima no log.
 *
 * Agora sobe. Isso e mais ESTRITO que antes: quando os criativos originais
 * passavam por acaso no Fact Guard, a campanha salvava — porem sem
 * enriquecimento nenhum (sem score, sem copy melhorada). Preferi erro visivel
 * a degradacao silenciosa: campanha salva com criativo nao enriquecido e
 * exatamente o resultado "parece feito por IA" que o produto existe pra
 * evitar, e ninguem tem como perceber que aconteceu.
 */
export function erroDeEnriquecimentoDeveSubir(mensagem: unknown): boolean {
  const texto = String((mensagem as { message?: string })?.message ?? mensagem ?? "");
  return texto.startsWith("FACT_CONFLICT:") || texto.startsWith("CREATIVE_REPAIR_REQUIRED:");
}
