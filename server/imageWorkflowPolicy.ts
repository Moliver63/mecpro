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

/**
 * Linhas de boot sobre geracao de imagem.
 *
 * Achado real (boot de producao, 06 a 09/10): o boot anunciava
 * `IMAGE_PROVIDER (efetivo): huggingface ✅` — e isso enganava duas vezes.
 *
 * 1. **HuggingFace nao gera imagem em caminho nenhum.** `HF_MODELS` esta vazio
 *    no codigo, com o comentario "HF hf-inference nao suporta mais modelos de
 *    imagem — desabilitado". `generateWithHuggingFace` itera lista vazia e
 *    devolve null. O ✅ era num provedor morto.
 * 2. **A fila de imagens de campanha nao consulta `IMAGE_PROVIDER`.**
 *    `generateCampaignImageCandidate` vai direto no Cloudflare FLUX e cai pro
 *    Pixabay. A variavel so vale pros caminhos sincronos legados (`ai.ts`,
 *    `generateAdImage`, `_core/router.ts`), que continuam existindo.
 *
 * Quem fosse depurar geracao de imagem lendo esse boot comecava no lugar
 * errado — o mesmo tipo de armadilha do comentario que afirmava que o
 * Cloudinary normalizava o tamanho da imagem (nao normalizava, e isso custou
 * dias de diagnostico).
 *
 * Funcao pura, recebendo o env, pra poder ser testada sem subir o servidor.
 */
export function rotuloProvedorDeImagem(env: Record<string, string | undefined>) {
  const pedido = String(env.IMAGE_PROVIDER || "").trim().toLowerCase();
  const temHf = !!String(env.HUGGINGFACE_API_KEY || "").trim();
  const temHeygen = !!String(env.HEYGEN_API_KEY || "").trim();
  const temCloudflare = !!(String(env.CLOUDFLARE_ACCOUNT_ID || "").trim() && String(env.CLOUDFLARE_API_TOKEN || "").trim());
  const temPixabay = !!String(env.PIXABAY_API_KEY || "").trim();

  const filaDeCampanha = temCloudflare
    ? `Cloudflare FLUX ✅ (fallback banco de imagens: ${temPixabay ? "Pixabay ✅" : "Pixabay ausente"})`
    : `❌ sem gerador: CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN ausente${temPixabay ? " — so o fallback Pixabay responde" : " e PIXABAY_API_KEY tambem ausente"}`;

  // O resolvido do caminho legado, sem ✅ pra provedor que nao gera.
  const resolvido = pedido === "heygen" ? "heygen"
    : pedido === "huggingface" ? "huggingface"
    : pedido === "genspark" ? "genspark"
    : (!pedido && temHeygen) ? "heygen (auto-detectado)"
    : (!pedido && temHf) ? "huggingface (auto-detectado)"
    : "mock → SVG inline";

  const ehHuggingface = resolvido.startsWith("huggingface");
  const caminhoLegado = ehHuggingface
    ? `${resolvido} — ATENCAO: desabilitado no codigo (HF_MODELS vazio), nao gera imagem`
    : resolvido;

  return { filaDeCampanha, caminhoLegado };
}

export type TarefaDeImagem = { status?: string; attempts?: number; creative_index?: number; format?: string; reason?: string };

/**
 * A causa da indisponibilidade do validador vai se resolver esperando?
 *
 * Achado real (Michel, 10/10): a fila devolveu
 * `visual_validator_unavailable:gemini_http_403`, e o chat respondeu "aguarde
 * 10-15 minutos para revalidacao". **403 e permissao** — nao resolve esperando
 * nem em dez minutos nem em dez dias. Durante a semana eu vinha supondo 503
 * ("high demand"), que de fato seria transitorio; o codigo nomeado de 03/10
 * derrubou a suposicao assim que o revalidate rodou.
 *
 * Defeito meu, de 05/10: `resumoDeTarefasDeImagem` amarrou o aviso somente ao
 * esgotamento de tentativas. Com `attempts` zerado pelo revalidate,
 * `filaVaiAgir` fica true e nada avisava — mas as tres tentativas restantes
 * estavam condenadas a falhar igual. Tratar "a fila vai tentar" como "esperar
 * resolve" so vale pra causa transitoria.
 *
 * 4xx e configuracao (chave, permissao, API desabilitada, modelo, URL que nao
 * existe): repetir da o mesmo. 408 e 429 sao a excecao — limite de taxa passa.
 * 5xx e indisponibilidade do outro lado, que passa.
 */
export function causaEhPermanente(motivo: unknown): boolean {
  const texto = String(motivo || "");
  const causa = texto.includes(":") ? texto.slice(texto.indexOf(":") + 1) : texto;

  // Configuracao do nosso lado: repetir nao muda nada.
  if (/^(sem_chave_gemini|host_nao_permitido|modelo_invalido)$/.test(causa)) return true;
  // Problema do candidato ja gravado: a mesma URL devolve o mesmo resultado.
  if (/^(mime_inesperado|imagem_grande_demais|corpo_vazio)$/.test(causa)) return true;

  const http = /^(?:gemini|download)_http_(\d{3})$/.exec(causa);
  if (http) {
    const codigo = Number(http[1]);
    if (codigo === 408 || codigo === 429) return false; // limite de taxa passa
    return codigo >= 400 && codigo < 500;
  }
  // timeout, excecao, validator_invalid_response e o que nao reconhecemos:
  // trata como transitorio, porque chutar "permanente" pararia a fila de
  // tentar numa falha que talvez passasse.
  return false;
}

/** Causa permanente em portugues, sem jargao, pro usuario final. */
export function causaPermanenteEmPortugues(motivo: unknown): string | null {
  const texto = String(motivo || "");
  const causa = texto.includes(":") ? texto.slice(texto.indexOf(":") + 1) : texto;
  if (!causaEhPermanente(causa)) return null;
  if (causa === "sem_chave_gemini") return "a validacao automatica de imagem nao esta configurada";
  if (causa === "host_nao_permitido") return "a imagem esta hospedada fora do servidor permitido";
  if (causa === "modelo_invalido") return "o modelo de validacao configurado e invalido";
  if (causa === "mime_inesperado") return "o arquivo gravado nao e uma imagem valida";
  if (causa === "imagem_grande_demais") return "a imagem gravada passa do tamanho aceito";
  if (causa === "corpo_vazio") return "a imagem gravada chegou vazia";
  if (/^gemini_http_(401|403)$/.test(causa)) return "a chave usada para validar imagem nao tem permissao de acesso";
  if (/^gemini_http_404$/.test(causa)) return "o modelo de validacao nao foi encontrado na conta";
  if (/^gemini_http_/.test(causa)) return "o servico de validacao recusou a requisicao";
  if (/^download_http_/.test(causa)) return "a imagem gravada nao pode mais ser baixada";
  return "a validacao automatica esta com problema de configuracao";
}

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

  // Causa permanente: a fila pode ate ter tentativas sobrando, mas elas vao
  // falhar igual. Ver causaEhPermanente — isto conserta o buraco de 05/10, em
  // que `destravar` so olhava esgotamento de tentativa.
  const bloqueadas = linhas.filter(t => causaEhPermanente(t?.reason));
  const causas = Array.from(new Set(
    bloqueadas.map(t => causaPermanenteEmPortugues(t?.reason)).filter((c): c is string => !!c)));
  const esperarResolve = filaVaiAgir && bloqueadas.length === 0;

  let destravar: string | null = null;
  if (causas.length) {
    // Primeiro, porque e o caso em que esperar e ativamente a resposta errada.
    destravar = `${bloqueadas.length} tarefa(s) travada(s) por configuracao, nao por fila: ${causas.join("; ")}. ` +
      `Esperar NAO resolve — as tentativas que sobraram vao falhar igual. Precisa corrigir a configuracao da validacao; ` +
      `revalidate depois disso reaproveita as imagens que ja existem, sem gerar outra.`;
  } else if (!filaVaiAgir && paradas.length > 0) {
    destravar = `${paradas.length} tarefa(s) esgotaram as ${MAX_TENTATIVAS_VALIDACAO} tentativas de validacao e a fila NAO vai pegar de novo sozinha. Esperar nao resolve. Use action=revalidate: zera o contador e reanalisa a imagem que ja existe, sem gerar outra.`;
  }

  return {
    total: linhas.length,
    porStatus,
    aprovadas: aprovadas.length,
    aguardandoFila: aguardandoFila.length,
    paradasSemTentativa: paradas.length,
    bloqueadasPorConfiguracao: bloqueadas.length,
    causasPermanentes: causas,
    filaVaiAgir,
    // `filaVaiAgir` diz se o worker volta a pegar. `esperarResolve` diz se
    // isso tem chance de dar em algo. Com causa permanente os dois divergem,
    // e e `esperarResolve` que decide se cabe mandar o usuario aguardar.
    esperarResolve,
    destravar,
    // Frase pronta pro assistente: deterministica, pra ele nao precisar
    // inferir o estado a partir do formato das linhas.
    resumo: linhas.length === 0
      ? "Nenhuma tarefa de imagem registrada para esta campanha."
      : `${linhas.length} tarefa(s): ${Object.entries(porStatus).map(([s, n]) => `${n} ${s}`).join(", ")}. ` +
        (causas.length
          ? `${bloqueadas.length} travada(s) por configuracao (${causas.join("; ")}) — esperar nao resolve.`
          : filaVaiAgir
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
