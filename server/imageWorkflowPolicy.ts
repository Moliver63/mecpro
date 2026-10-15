import { createHash } from "node:crypto";

export type VisualDecision = { status: "approved" | "rejected" | "pending_validation"; score: number | null; reason: string; evidence?: string; issues?: string[]; blockers?: string[]; model?: string };

export const QUALIDADE_MINIMA = 0.72;

/**
 * Decide se a imagem pode entrar no criativo.
 *
 * Reescrito em 13/10, depois de **dez dias e zero imagens aprovadas**. O
 * portao anterior era:
 *
 *   approved = matchesBrief && safe && !hasText && quality >= 0.72 && !issues.length
 *
 * Cinco condicoes simultaneas, e duas praticamente impossiveis:
 *
 * 1. **`!issues.length`**: `issues` e campo OBRIGATORIO no schema, e a
 *    instrucao do sistema pede ao modelo pra apontar problemas. Modelo de
 *    visao a quem se pede lista de problemas PREENCHE a lista — qualquer
 *    ressalva cosmetica ("o enquadramento poderia ser mais fechado") zerava a
 *    aprovacao. Uma observacao estava funcionando como veto.
 * 2. **`!hasText`**: reprovava QUALQUER texto visivel, quando o proprio
 *    systemInstruction diz que o critério e "illegible text". Rotulo numa
 *    embalagem, placa ao fundo, numero numa fachada — tudo reprovava. E o
 *    FLUX quase sempre renderiza algum glifo.
 *
 * O que mudou: `issues` volta a ser OBSERVACAO (registrada, nao veta) e quem
 * veta e `blockers`, que o modelo preenche so com o que nao pode ir ao ar. O
 * texto passou a vetar apenas quando ilegivel.
 *
 * Isso NAO afrouxa a seguranca: `matchesBrief` e `safe` continuam vetando, e
 * `blockers` existe exatamente pra segmento errado, oferta inventada, garantia
 * financeira, conteudo inseguro e banco de imagens passado como foto real do
 * produto — a lista que o systemInstruction sempre teve. O que saiu foi o veto
 * por qualquer observacao e o veto por qualquer pixel de texto. E ganho de
 * precisao, nao de permissividade.
 *
 * Compatibilidade: resposta no formato antigo (sem `blockers`/`illegibleText`)
 * volta `validator_invalid_response` em vez de ser interpretada pela metade —
 * preferivel a aprovar com criterio que nao foi avaliado.
 */
export function visualDecision(value: unknown): VisualDecision {
  const v = value as any;
  const listaDeTextos = (x: unknown) => Array.isArray(x) && x.every(i => typeof i === "string");
  if (!v || typeof v.matchesBrief !== "boolean" || typeof v.safe !== "boolean" ||
      typeof v.illegibleText !== "boolean" ||
      typeof v.quality !== "number" || !Number.isFinite(v.quality) || v.quality < 0 || v.quality > 1 ||
      !listaDeTextos(v.issues) || !listaDeTextos(v.blockers) ||
      typeof v.evidence !== "string" || !v.evidence.trim()) {
    return { status: "pending_validation", score: null, reason: "validator_invalid_response" };
  }
  const corta = (lista: string[]) => lista.slice(0, 10).map((s: string) => s.slice(0, 300));
  const blockers = corta(v.blockers);
  const issues = corta(v.issues);

  const reprovas = [
    !v.matchesBrief ? "fora do briefing" : "",
    !v.safe ? "conteudo inseguro" : "",
    v.illegibleText ? "texto ilegivel na imagem" : "",
    v.quality < QUALIDADE_MINIMA ? `qualidade ${v.quality.toFixed(2)} abaixo de ${QUALIDADE_MINIMA}` : "",
    blockers.length ? `impedimentos: ${blockers.join("; ")}` : "",
  ].filter(Boolean);

  if (!reprovas.length) {
    // Aprovada COM observacoes continua aprovada: a observacao fica registrada
    // na tarefa pra revisao, sem bloquear a campanha.
    return { status: "approved", score: v.quality, reason: "visual_checks_passed", evidence: v.evidence.slice(0, 2000), issues, blockers };
  }
  // O motivo agora diz QUAL criterio reprovou, em vez do antigo
  // "visual_mismatch_or_quality" pra qualquer uma das cinco causas.
  return { status: "rejected", score: v.quality, reason: `visual_rejected: ${reprovas.join(" | ")}`.slice(0, 300), evidence: v.evidence.slice(0, 2000), issues, blockers };
}

export function imageBrief(campaign: any, creative: any) {
  const facts = JSON.parse(campaign.aiResponse || "{}").campaignFacts;
  if (!facts?.intent?.segment || !Array.isArray(facts.verifiedFacts) || !facts.verifiedFacts.length || !facts.verifiedFacts.every((f: unknown) => typeof f === "string")) {
    throw new Error("missing_confirmed_brief");
  }
  return { version: 2, segment: facts.intent.segment, objective: campaign.objective,
    offerAnchor: facts.offerAnchor || [], facts: facts.verifiedFacts, intent: facts.intent,
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
  // `bloqueado_seguranca_*` entra aqui (14/10): o filtro do Gemini barrou ESTA
  // imagem, entao repetir com a mesma URL da o mesmo veredito. Nao e esperar que
  // resolve — e gerar outra imagem. As demais causas novas do validador
  // (`resposta_truncada`, `json_invalido`, `sem_candidato`, `corpo_nao_json`)
  // ficam transitorias de proposito: sao da resposta, nao da imagem, e podem
  // passar numa nova tentativa.
  if (/^(mime_inesperado|imagem_grande_demais|corpo_vazio)$/.test(causa)) return true;
  if (/^bloqueado_seguranca(_[a-z0-9_]+)?$/.test(causa)) return true;

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
  if (/^bloqueado_seguranca(_[a-z0-9_]+)?$/.test(causa)) return "o filtro de conteudo do validador barrou esta imagem";
  if (/^gemini_http_(401|403)$/.test(causa)) return "a chave usada para validar imagem nao tem permissao de acesso";
  if (/^gemini_http_404$/.test(causa)) return "o modelo de validacao nao foi encontrado na conta";
  if (/^gemini_http_/.test(causa)) return "o servico de validacao recusou a requisicao";
  if (/^download_http_/.test(causa)) return "a imagem gravada nao pode mais ser baixada";
  return "a validacao automatica esta com problema de configuracao";
}

/**
 * Causa permanente que pede IMAGEM NOVA, nao correcao de configuracao.
 *
 * Achado por leitura (14/10): `destravar` dizia sempre "travada por
 * configuracao (...) Precisa corrigir a configuracao da validacao; revalidate
 * depois disso reaproveita as imagens que ja existem". Pra causa que esta na
 * IMAGEM gravada — arquivo que nao e imagem, corpo vazio, URL que nao baixa
 * mais, e agora filtro de conteudo — esse conselho e ativamente errado:
 * `revalidate` reanalisa a MESMA imagem e devolve o mesmo veredito. Michel
 * seguiria a instrucao e nao sairia do lugar.
 *
 * Defeito pre-existente (valia pra `mime_inesperado` e `corpo_vazio` desde
 * 05/10); o `bloqueado_seguranca` novo so o deixou visivel.
 */
export function causaPedeNovaImagem(motivo: unknown): boolean {
  const texto = String(motivo || "");
  const causa = texto.includes(":") ? texto.slice(texto.indexOf(":") + 1) : texto;
  if (!causaEhPermanente(causa)) return false;
  if (/^(mime_inesperado|imagem_grande_demais|corpo_vazio)$/.test(causa)) return true;
  if (/^bloqueado_seguranca(_[a-z0-9_]+)?$/.test(causa)) return true;
  if (/^download_http_/.test(causa)) return true;
  return false;
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
/**
 * Familia do critério que reprovou, a partir do `reason` do portao.
 *
 * `visualDecision` monta `visual_rejected: <criterio> | <criterio> | ...` desde
 * 13/10. Agrupar por familia (e tirar o numero da qualidade) faz 15 reprovas
 * virarem duas ou tres causas distintas em vez de quinze strings.
 */
export function criteriosDeReprova(motivo: unknown): string[] {
  const texto = String(motivo || "");
  if (!texto.startsWith("visual_rejected:")) return [];
  return Array.from(new Set(texto.slice("visual_rejected:".length).split("|").map(parte => {
    const p = parte.trim().toLowerCase();
    if (!p) return "";
    if (p.startsWith("fora do briefing")) return "fora do briefing";
    if (p.startsWith("conteudo inseguro")) return "conteudo inseguro";
    if (p.startsWith("texto ilegivel")) return "texto ilegivel na imagem";
    // "qualidade 0.64 abaixo de 0.72" → familia, sem o numero.
    if (p.startsWith("qualidade")) return "qualidade abaixo do minimo";
    if (p.startsWith("impedimentos")) return "impedimentos apontados pelo validador";
    return p.slice(0, 60);
  }).filter(Boolean)));
}

/**
 * O que destrava uma REPROVA, por familia de critério.
 *
 * Achado real (14/10 e 15/10, campanha 798): o chat mandou a Michel, duas vezes,
 * palavra por palavra, "as 15 imagens foram rejeitadas por nao mostrar VR
 * (diferencial central do briefing) (...) Corrija o briefing para incluir 'VR',
 * 'imersao' e 'metodo Shadia Hasan' NOS TEXTOS".
 *
 * Nao era desobediencia do modelo, pela mesma razao de 05/10: `estado` nao
 * dizia NADA sobre `rejected`. Reprova e o resultado mais informativo que
 * existe aqui — o portao leu a imagem e nomeou o critério desde 13/10 — e a
 * ferramenta nao devolvia nem o criterio nem a acao. O modelo preencheu a
 * lacuna lendo o briefing e inventando a causa.
 *
 * Dois erros vinham dessa lacuna, e os dois sao corrigiveis por contrato:
 *
 *  1. Afirmar a causa. O chat nao recebia `validation`, onde o validador grava
 *     `evidence`, `issues` e `blockers` — so o `reason` cortado em 300 chars.
 *  2. Apontar o lugar errado da correcao. "Incluir nos TEXTOS" e copy do
 *     anuncio; `matchesBrief` audita o que `offerAnchor` confirma, e
 *     `offerAnchor` vem de productName, productService,
 *     uniqueValueProposition e productDifferentials. Texto de anuncio nao
 *     entra nessa lista.
 */
export function acaoParaReprova(criterios: string[]): string {
  const tem = (c: string) => criterios.includes(c);
  const partes: string[] = [];
  if (tem("fora do briefing")) {
    partes.push("A imagem nao bate com o que o briefing CONFIRMA. O que o validador audita vem de productName, " +
      "productService, uniqueValueProposition e productDifferentials — reescrever headline ou copy do anuncio NAO " +
      "muda isso. Se o diferencial que se espera ver na imagem nao estiver num desses quatro campos, ele nao existe " +
      "nem pro gerador nem pro validador.");
  }
  if (tem("qualidade abaixo do minimo")) {
    partes.push("Reprova por qualidade usa limiar nao calibrado (0.72) sobre heuristica do proprio modelo: com imagem " +
      "visivelmente boa, o numero e o suspeito, nao a imagem.");
  }
  if (tem("texto ilegivel na imagem")) partes.push("Texto ilegivel na imagem pede imagem nova, nao revalidate.");
  if (tem("conteudo inseguro")) partes.push("Conteudo inseguro pede imagem nova e revisao manual antes de qualquer publicacao.");
  if (tem("impedimentos apontados pelo validador")) partes.push("Os impedimentos estao em `validation.blockers`, com o que o validador viu em `validation.evidence`: cite de la, nao suponha.");
  return partes.join(" ");
}

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
  const reprovadas = linhas.filter(t => t?.status === "rejected");
  const criteriosDeReprovaDistintos = Array.from(new Set(reprovadas.flatMap(t => criteriosDeReprova(t?.reason))));

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
    const pedemNovaImagem = bloqueadas.filter(t => causaPedeNovaImagem(t?.reason)).length;
    const acao = pedemNovaImagem === bloqueadas.length
      ? `O problema esta na imagem gravada, nao na configuracao: revalidate reanalisa a MESMA imagem e devolve o mesmo veredito. Precisa gerar outra.`
      : pedemNovaImagem === 0
        ? `Precisa corrigir a configuracao da validacao; revalidate depois disso reaproveita as imagens que ja existem, sem gerar outra.`
        : `${pedemNovaImagem} de ${bloqueadas.length} esta na imagem gravada e precisa de imagem nova; o resto e configuracao da validacao, e para essas o revalidate reaproveita a imagem que ja existe.`;
    destravar = `${bloqueadas.length} tarefa(s) travada(s), e nao por fila: ${causas.join("; ")}. ` +
      `Esperar NAO resolve — as tentativas que sobraram vao falhar igual. ${acao}`;
  } else if (!filaVaiAgir && paradas.length > 0) {
    destravar = `${paradas.length} tarefa(s) esgotaram as ${MAX_TENTATIVAS_VALIDACAO} tentativas de validacao e a fila NAO vai pegar de novo sozinha. Esperar nao resolve. Use action=revalidate: zera o contador e reanalisa a imagem que ja existe, sem gerar outra.`;
  } else if (!filaVaiAgir && reprovadas.length > 0) {
    // Reprova nunca foi contemplada aqui, e e o caso mais informativo: o portao
    // LEU a imagem e nomeou o critério. Sem isto, o chat inventava a causa.
    destravar = `${reprovadas.length} tarefa(s) reprovada(s) pelo portao visual, por: ${criteriosDeReprovaDistintos.join("; ") || "critério nao informado na linha"}. ` +
      `Reprova significa que o validador LEU a imagem: revalidate sobre a MESMA imagem e o MESMO briefing devolve o mesmo veredito. ` +
      `Esperar nao resolve. ${acaoParaReprova(criteriosDeReprovaDistintos)}`;
  }

  return {
    total: linhas.length,
    porStatus,
    aprovadas: aprovadas.length,
    reprovadas: reprovadas.length,
    // Critérios REAIS, extraidos do `reason` que o portao gravou. Existe pra o
    // assistente citar daqui em vez de supor a causa a partir do briefing.
    criteriosDeReprova: criteriosDeReprovaDistintos,
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
  if (/educa|infoprod|saude|psic|bem.?estar|servic/.test(s) && /\bvr\b|realidade virtual|virtual reality|headset/i.test(facts)) {
    return [
      "adult wearing a virtual reality headset in a guided self-reflection session",
      "close-up portrait of a person using a virtual reality headset in a calm room",
      "virtual reality headset in use during a personal development session",
    ][index % 3];
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
