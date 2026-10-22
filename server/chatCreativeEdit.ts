import { createHash } from "node:crypto";
import { campanhaDoUsuario, type ChatWorkspaceStore } from "./chatWorkspace";
import { CREATIVE_TEXT_LIMITS } from "./creativeRewriteGuard";
import { scoreCreative } from "./creativeScoringEngine";
import { validateCampaignFactIntegrity } from "./campaignFactGuard";
import { syncCreativeTextToV2 } from "../shared/campaignCreative.sync";
import {
  diagnosticarRevisao, descreverDiagnostico, factsDaCampanha, textoDoCriativo,
  triarParaAprovacao, aplicarAprovacaoPorScore,
} from "./creativeReview";

/**
 * Ferramentas de chat que destravam a publicacao: editar o texto de um
 * criativo e aprovar a revisao de score baixo.
 *
 * Achado real (19/10, campanha 799): "ele precisa ser possivel publicar via
 * chat". Os 4 criativos estavam `needsReview` por score 57-68 e nada no produto
 * limpava a flag. Regra decidida pelo Michel ("So score baixo"): aprovacao
 * libera quando o UNICO motivo e score < 75; o resto exige corrigir o texto.
 *
 * O auditor de segmento vem injetado: ele mora em `ai.ts`, e este modulo nao
 * deve carregar o gerador inteiro so pra ser testado.
 */

export type AuditorDeSegmento = (creative: any, segment: string) => string[];

const CAMPOS_EDITAVEIS = ["headline", "description", "copy", "cta", "hook"] as const;

const PLACEHOLDER_RE = /\[[^\]]*?\]|\{[^}]*?\}|EMPRESA_AQUI|PRODUTO_AQUI|\bXXX+\b/i;

function lerCriativos(campaign: any): any[] | null {
  try {
    const v = JSON.parse(campaign.creatives || "[]");
    return Array.isArray(v) ? v : null;
  } catch { return null; }
}

export type CampoDeTexto = "headline" | "description" | "copy" | "cta" | "hook" | "pain" | "solution" | "script";

/**
 * Nucleo da edicao de texto, compartilhado pelo chat (`editar_criativo`) e pelo
 * MCP (`update_campaign_draft`): valida limite, placeholder e Fact Guard,
 * sincroniza aliases e V2, recalcula score/segmento/needsReview e apaga
 * aprovacao anterior. Puro: nao grava nada.
 */
export function aplicarEdicaoDeTexto(
  atual: any,
  args: Record<string, unknown>,
  campos: readonly CampoDeTexto[],
  facts: ReturnType<typeof factsDaCampanha>,
  auditarSegmento: AuditorDeSegmento,
  agora: () => Date = () => new Date(),
): { erro: string; conflitos?: string[]; instruction?: string } | { creative: any; diagnostico: ReturnType<typeof diagnosticarRevisao>; mudancas: Record<string, string>; avisos?: string[] } {
  const mudancas: Record<string, string> = {};
  const erros: string[] = [];
  for (const campo of campos) {
    const valor = args[campo];
    if (valor === undefined || valor === null) continue;
    if (typeof valor !== "string" || !valor.trim()) { erros.push(`${campo} vazio`); continue; }
    const texto = valor.trim();
    // Recusa em vez de cortar: cortar texto que o usuario aprovou muda o que
    // ele leu. Quem chamou reescreve mais curto e tenta de novo.
    if (texto.length > CREATIVE_TEXT_LIMITS[campo]) {
      erros.push(`${campo} tem ${texto.length} caracteres; maximo ${CREATIVE_TEXT_LIMITS[campo]}`);
      continue;
    }
    if (PLACEHOLDER_RE.test(texto)) { erros.push(`${campo} tem marcador nao preenchido`); continue; }
    mudancas[campo] = texto;
  }
  if (erros.length) return { erro: `Nada foi salvo: ${erros.join("; ")}.` };
  if (!Object.keys(mudancas).length) return { erro: `Nenhum campo de texto informado (${campos.join(", ")}).` };

  let proximo: any = { ...atual, ...mudancas };
  // O anuncio da Meta le `copy || bodyText` e `description || shortDescription`.
  // Alias velho ao lado do campo novo vira texto divergente em outro caminho.
  if (mudancas.copy !== undefined && "bodyText" in atual) proximo.bodyText = mudancas.copy;
  if (mudancas.description !== undefined && "shortDescription" in atual) proximo.shortDescription = mudancas.description;

  if (facts) {
    const auditoria = validateCampaignFactIntegrity([mudancas], facts);
    if (auditoria.status !== "passed") {
      return {
        erro: "Nada foi salvo: o texto novo traz alegacao que nao esta no briefing da campanha.",
        conflitos: auditoria.conflicts.slice(0, 5).map((c) => `${c.field.replace(/^creatives\.\d+\./, "")}: ${c.reason} ("${c.value}")`),
        instruction: "Reescreva sem essa alegacao, ou peca ao usuario o dado real (com fonte) e atualize o briefing antes.",
      };
    }
  }

  const segmento = facts?.intent?.segment || atual.segmentAlignment || "";
  proximo.segmentAlignmentIssues = segmento ? auditarSegmento(proximo, segmento) : [];
  proximo.hasPlaceholder = PLACEHOLDER_RE.test(textoDoCriativo(proximo));
  Object.assign(proximo, scoreCreative(proximo));
  proximo.textEditedAt = agora().toISOString();
  proximo._edited = true;
  // Aprovacao anterior valia para o texto anterior.
  delete proximo.reviewApprovedAt;
  delete proximo.reviewApprovedBy;
  delete proximo.reviewApprovalReason;
  delete proximo.reviewApprovedScore;

  const diagnostico = diagnosticarRevisao({ ...proximo, needsReview: false }, facts);

  /**
   * Efeito da edicao, dito em voz alta (22/10).
   *
   * Achado real: o chat disse ao Michel que o criativo 1 da 799 tinha
   * "depoimento invalido" (nao tinha — era o estado de 19/10, antes da
   * reescrita de 20/10) e mandou corrigir com
   * `editar_criativo(..., description="Texto corrigido")`. Essa string nao e
   * placeholder, cabe em 30 caracteres e nao alega nada, entao passa por todas
   * as travas e seria gravada num anuncio real.
   *
   * A primeira versao disto RECUSAVA edicao que nao resolvia motivo e baixava
   * o score. Dois testes de edicao legitima do usuario cairam na hora, e
   * estavam certos: trocar a propria copy, mesmo perdendo pontos da
   * heuristica, e decisao de quem escreve o anuncio. Nenhuma regra
   * deterministica separa "Texto corrigido" de uma copy curta boa — tentar
   * separar por vocabulario e a armadilha de 19/10 em outra roupa, e aqui o
   * custo do falso positivo e bloquear o trabalho do usuario.
   *
   * Entao a resposta INFORMA em vez de barrar: quem le a resposta (modelo ou
   * usuario) ve que a edicao nao resolveu bloqueio nenhum e quanto o score
   * caiu. A defesa de verdade esta antes, em nao inventar a pendencia: as
   * pendencias agora carregam o texto atual (`textos`) e os indices, e a
   * descricao da ferramenta diz que o texto vai pro anuncio.
   */
  const motivosAntes = diagnosticarRevisao({ ...atual, needsReview: false }, facts);
  const resolveuAlgo = motivosAntes.motivos.some((m) => !diagnostico.motivos.includes(m));
  const scoreAntes = typeof atual?.finalScore === "number" ? atual.finalScore : motivosAntes.score;
  const scoreDepois = typeof proximo.finalScore === "number" ? proximo.finalScore : diagnostico.score;
  const avisos: string[] = [];
  if (scoreDepois < scoreAntes) avisos.push(`o score caiu de ${scoreAntes} para ${scoreDepois}`);
  if (motivosAntes.motivos.length && !resolveuAlgo) {
    avisos.push(`a edicao nao resolveu nenhum bloqueio; continua: ${motivosAntes.motivos.join(", ")}`);
  }
  if (motivosAntes.motivos.length === 1 && motivosAntes.motivos[0] === "score_baixo" && !resolveuAlgo) {
    avisos.push("score abaixo de 75 nao e defeito que edicao conserta sozinha: reescreva com beneficio concreto do briefing, ou o usuario aprova como esta");
  }

  proximo.needsReview = diagnostico.motivos.length > 0;
  proximo = syncCreativeTextToV2(proximo);
  return { creative: proximo, diagnostico, mudancas, ...(avisos.length ? { avisos } : {}) };
}

/** Reescreve campos de texto de um criativo e recalcula score, segmento, fatos e needsReview. */
export async function editarCriativo(
  userId: number,
  args: Record<string, unknown>,
  store: ChatWorkspaceStore,
  auditarSegmento: AuditorDeSegmento,
): Promise<Record<string, unknown>> {
  if (!Number.isSafeInteger(args.campaignId)) return { erro: "campaignId invalido." };
  const resolvido = await campanhaDoUsuario(userId, Number(args.campaignId), store);
  if ("erro" in resolvido) return resolvido;
  const { campaign } = resolvido;

  const creatives = lerCriativos(campaign);
  if (!creatives) return { erro: "Lista de criativos invalida." };
  const index = args.creativeIndex;
  if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 || !creatives[index]) {
    return { erro: "Criativo nao encontrado nesse indice.",
      criativosDisponiveis: creatives.map((c: any, i: number) => ({ index: i, headline: c?.headline || null })) };
  }

  const facts = factsDaCampanha(campaign);
  const aplicado = aplicarEdicaoDeTexto(creatives[index], args, CAMPOS_EDITAVEIS, facts, auditarSegmento);
  if ("erro" in aplicado) return aplicado;
  const { creative: proximo, diagnostico, mudancas } = aplicado;
  const avisosDaEdicao = (aplicado as any).avisos as string[] | undefined;

  const atualizados = [...creatives];
  atualizados[index] = proximo;
  await store.updateCampaignField(campaign.id, "creatives", JSON.stringify(atualizados));

  return {
    ok: true, campaignId: campaign.id, creativeIndex: index,
    camposAlterados: Object.keys(mudancas),
    criativo: { headline: proximo.headline, description: proximo.description, copy: proximo.copy, cta: proximo.cta, hook: proximo.hook },
    score: proximo.finalScore,
    precisaRevisao: proximo.needsReview,
    ...(proximo.needsReview ? { pendencia: descreverDiagnostico(index, diagnostico) } : {}),
    // Efeito da edicao em voz alta: salvar em silencio uma troca que piorou o
    // score e nao resolveu bloqueio foi o que deixou passar a edicao de
    // preenchimento de 22/10. Mostre ao usuario.
    ...(avisosDaEdicao?.length ? { avisos: avisosDaEdicao } : {}),
    scope: "mecpro_only", syncedToMeta: false,
    message: proximo.needsReview
      ? (diagnostico.liberavelPorAprovacao
        ? "Texto salvo. Score ainda abaixo de 75: o usuario pode aprovar assim mesmo (aprovar_revisao_criativo) ou pedir outra versao."
        : "Texto salvo, mas o criativo continua bloqueado pelo motivo em `pendencia`.")
      : "Texto salvo e criativo liberado para publicar.",
  };
}

function tokenDeAprovacao(campaignId: number, alvos: Array<{ index: number; c: any }>): string {
  const base = JSON.stringify({ campaignId, alvos: alvos.map(({ index, c }) => [index, textoDoCriativo(c)]) });
  return createHash("sha256").update(base).digest("hex").slice(0, 10);
}

/**
 * Libera criativos cujo unico motivo de revisao e score baixo. Duas etapas,
 * como publicar: a primeira mostra os textos e devolve a frase de confirmacao;
 * a segunda so aplica se a mensagem ATUAL do usuario for exatamente a frase.
 * O token amarra os textos: se algum texto mudar entre as etapas, a frase
 * antiga deixa de valer.
 */
export async function aprovarRevisaoCriativo(
  userId: number,
  args: Record<string, unknown>,
  store: ChatWorkspaceStore,
  mensagemAtual: string,
  agora: () => Date = () => new Date(),
): Promise<Record<string, unknown>> {
  if (!Number.isSafeInteger(args.campaignId)) return { erro: "campaignId invalido." };
  const resolvido = await campanhaDoUsuario(userId, Number(args.campaignId), store);
  if ("erro" in resolvido) return resolvido;
  const { campaign } = resolvido;

  const creatives = lerCriativos(campaign);
  if (!creatives) return { erro: "Lista de criativos invalida." };

  const pedidos = args.creativeIndexes;
  if (pedidos !== undefined && pedidos !== null && !Array.isArray(pedidos)) {
    return { erro: "creativeIndexes invalido.", criativosDisponiveis: creatives.length };
  }

  const facts = factsDaCampanha(campaign);
  const triagem = triarParaAprovacao(creatives, pedidos as number[] | null | undefined, facts);
  if (triagem.invalidos.length) {
    return { erro: "creativeIndexes invalido.", criativosDisponiveis: creatives.length };
  }
  if (!triagem.emRevisao.length) return { ok: true, campaignId: campaign.id, message: "Nenhum desses criativos esta aguardando revisao." };

  const liberaveis = triagem.liberaveis.map((x) => ({ ...x, c: creatives[x.index] }));
  const bloqueadosDescritos = triagem.bloqueados;

  if (!liberaveis.length) {
    return {
      ok: false, campaignId: campaign.id,
      erro: "Nenhum criativo pode ser aprovado assim: a aprovacao no chat so libera score baixo. Corrija o texto com editar_criativo.",
      bloqueados: bloqueadosDescritos,
    };
  }

  const token = tokenDeAprovacao(campaign.id, liberaveis);
  const frase = `APROVAR CRIATIVOS ${token}`;
  if (mensagemAtual.trim() !== frase) {
    return {
      ok: false, confirmationRequired: true, campaignId: campaign.id,
      paraAprovar: liberaveis.map(({ index, score, c }) => ({
        index, score,
        headline: c.headline, description: c.description, copy: c.copy, cta: c.cta,
      })),
      ...(bloqueadosDescritos.length ? { bloqueados: bloqueadosDescritos } : {}),
      erro: `Nada foi aprovado ainda. Mostre ao usuario o texto completo de cada criativo em paraAprovar e o score (abaixo de 75 = a IA achou fraco). Se ele quiser aprovar assim mesmo, deve enviar exatamente: ${frase}. Se preferir melhorar, use editar_criativo.`,
    };
  }

  const atualizados = aplicarAprovacaoPorScore(
    creatives,
    liberaveis.map((x) => x.index),
    userId,
    agora().toISOString(),
  );
  await store.updateCampaignField(campaign.id, "creatives", JSON.stringify(atualizados));
  return {
    ok: true, campaignId: campaign.id,
    aprovados: liberaveis.map((x) => x.index),
    ...(bloqueadosDescritos.length ? { bloqueados: bloqueadosDescritos } : {}),
    scope: "mecpro_only",
    message: bloqueadosDescritos.length
      ? "Aprovados. Os criativos em `bloqueados` ainda impedem a publicacao."
      : "Aprovados. A campanha pode seguir para publicar_campanha (que pede a propria confirmacao).",
  };
}
