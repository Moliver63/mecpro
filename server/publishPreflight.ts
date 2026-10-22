import { auditCarouselCreatives, orderedCreativesForCarousel, getCreativeMedia } from "./carouselAudit";
import { verificarIntegridadeParaPublicar } from "./campaignPublishIntegrity";
import { diagnosticarRevisao, descreverDiagnostico, factsDaCampanha } from "./creativeReview";

/**
 * Pre-checagem LOCAL de publicacao: so leitura, sem rede e sem banco.
 *
 * Mora em modulo proprio de proposito. A primeira versao disto ficou dentro de
 * `campaignPublish.ts`, e o `await import("./campaignPublish")` no caminho de
 * pre-checagem arrastava `./_core/router` — o servidor inteiro — so pra contar
 * se havia imagem num criativo. Quebrou os testes na hora, e em producao seria
 * custo de carga em cada verificacao. Uma checagem pura nao pertence ao lado do
 * codigo que escreve na rede.
 */

/**
 * Pendencias LOCAIS que impedem publicar, antes de tocar na Meta.
 *
 * Achado real (15/10, campanha 799). O chat disse ao Michel: "a campanha esta
 * PAUSADA. Para publicar: acesse a campanha, clique em Publicar, confirme a
 * URL". Duas coisas erradas, e as duas nasceram da ferramenta nao contar o
 * estado:
 *
 *  1. A 799 **nao podia ser publicada**. Das tarefas de imagem dela, duas
 *     foram reprovadas e uma aprovada, e `publicarCampanhaNaMeta` recusa com
 *     "Nenhuma imagem encontrada nos criativos" quando nenhum criativo tem
 *     imagem. Michel seria mandado clicar em Publicar pra receber a recusa.
 *  2. "PAUSADA" nao e status da campanha. O status local nasce `draft`, e a
 *     publicacao do chat publica pausada de proposito — a string da propria
 *     ferramenta diz "Para publicar pausada, ele deve enviar...". O modelo leu
 *     isso e reportou a campanha COMO pausada.
 *
 * E a ordem agravava: `publishChatAds` pedia o token de confirmacao ANTES de
 * qualquer uma destas checagens. O usuario confirmava e so entao descobria que
 * era impossivel — gastando, de quebra, a reserva de idempotencia.
 *
 * Fonte unica: `publicarCampanhaNaMeta` usa esta funcao, e o chat tambem, antes
 * de pedir confirmacao. So checagens locais entram aqui; nada de rede.
 */
// Forma PLANA, nao uniao discriminada: `tsconfig.server.json` roda com
// `strict: false`, e sem `strictNullChecks` o TypeScript nao estreita uniao por
// discriminante booleano. Com `{ ok: true } | { ok: false; erro: string }`, ler
// `local.erro` depois de `if (!local.ok)` vira erro de compilacao no chamador.
export interface PendenciaDePublicacao {
  ok: boolean;
  erro?: string;
  issues?: string[];
  /** TODAS as pendencias, nao so a primeira. Ver o comentario de `tipo`. */
  pendencias?: ItemDePendencia[];
}

/**
 * Por que o retorno virou lista (22/10).
 *
 * A versao anterior saia na PRIMEIRA pendencia. Para o Michel isso significa
 * descobrir uma parede por clique: aprova os 4 criativos, clica em publicar,
 * descobre o conflito de fato; resolve o fato, clica, descobre a copy do
 * carrossel. Cada volta custa um deploy de paciencia e nao da pra planejar o
 * trabalho. Agora roda tudo e devolve tudo.
 *
 * `erro` e `issues` continuam preenchidos com a primeira pendencia, porque
 * `campaignPublish.ts` e `chatAdsTools.ts` leem esses dois campos.
 */
export type TipoDePendencia =
  | "sem_conjuntos"
  | "copy_carrossel"
  | "sem_imagem"
  | "revisao_aprovavel"
  | "revisao_bloqueada"
  | "integridade";

export type AcaoDePendencia =
  | "aprovar_criativo"
  | "editar_texto"
  | "enviar_imagem"
  | "regenerar_campanha";

export interface ItemDePendencia {
  tipo: TipoDePendencia;
  /** Uma linha dizendo o que esta errado, sem nome de ferramenta interna. */
  titulo: string;
  /** Uma linha por criativo ou por conflito. */
  detalhes: string[];
  /** Indices dos criativos afetados; vazio quando nao se aplica. */
  criativos: number[];
  acao: AcaoDePendencia;
}

export function pendenciasLocaisParaPublicar(campaign: any): PendenciaDePublicacao {
  const adSets: any[] = (() => { try { return JSON.parse(campaign?.adSets || "[]"); } catch { return []; } })();
  const creatives: any[] = (() => { try { return JSON.parse(campaign?.creatives || "[]"); } catch { return []; } })();
  const pendencias: ItemDePendencia[] = [];

  if (adSets.length === 0) {
    pendencias.push({
      tipo: "sem_conjuntos", criativos: [], acao: "regenerar_campanha",
      titulo: "Essa campanha não tem conjuntos de anúncios gerados.",
      detalhes: [],
    });
  }

  const copyAudit = auditCarouselCreatives(creatives);
  if (!copyAudit.ok) {
    pendencias.push({
      tipo: "copy_carrossel", criativos: [], acao: "editar_texto",
      titulo: "Há cards com copy fraca, curta ou repetida. Regenere ou atualize os criativos antes de publicar.",
      detalhes: copyAudit.issues || [],
    });
  }

  const temImagem = orderedCreativesForCarousel(creatives)
    .map((c: any) => getCreativeMedia(c))
    .some((x: any) => x?.hash || x?.url);
  if (!temImagem) {
    pendencias.push({
      tipo: "sem_imagem", criativos: [], acao: "enviar_imagem",
      titulo: "Nenhuma imagem encontrada nos criativos — não é possível publicar sem imagem.",
      detalhes: [],
    });
  }

  // Criativo marcado pra revisao: `assertCampaignPublishIntegrity` recusa na
  // publicacao real. Achado real (19/10, campanha 799): os 4 criativos estavam
  // marcados e o chat emitia o token de confirmacao mesmo assim. Aqui a recusa
  // vem antes e diz, por criativo, se basta aprovar (score baixo) ou se o
  // texto precisa ser corrigido.
  const facts = factsDaCampanha(campaign);
  const emRevisao = creatives
    .map((c: any, index: number) => ({ c, index }))
    .filter(({ c }) => c?.needsReview === true);
  if (emRevisao.length) {
    const diagnosticos = emRevisao.map(({ c, index }) => ({ index, d: diagnosticarRevisao(c, facts) }));
    const liberaveis = diagnosticos.filter((x) => x.d.liberavelPorAprovacao);
    const bloqueados = diagnosticos.filter((x) => !x.d.liberavelPorAprovacao);
    if (liberaveis.length) {
      pendencias.push({
        tipo: "revisao_aprovavel", acao: "aprovar_criativo",
        criativos: liberaveis.map((x) => x.index),
        titulo: `${liberaveis.length} criativo(s) ficaram em revisão só por score baixo. Você pode aprovar como está.`,
        detalhes: liberaveis.map((x) => descreverDiagnostico(x.index, x.d)),
      });
    }
    if (bloqueados.length) {
      pendencias.push({
        tipo: "revisao_bloqueada", acao: "editar_texto",
        criativos: bloqueados.map((x) => x.index),
        titulo: `${bloqueados.length} criativo(s) precisam ter o texto corrigido antes de publicar.`,
        detalhes: bloqueados.map((x) => descreverDiagnostico(x.index, x.d)),
      });
    }
  }

  // Mesma regra da publicacao real (snapshot de fatos, objetivo, Fact Guard).
  //
  // Rodado com `needsReview` limpo numa COPIA: o proprio
  // `assertCampaignPublishIntegrity` tambem reprova por needsReview, e isso ja
  // esta reportado acima. Sem a copia, a revisao aparece duas vezes e esconde o
  // que vem DEPOIS dela — que e justamente o que o usuario precisa saber antes
  // de aprovar, pra nao bater na parede seguinte.
  const campanhaSemRevisao = emRevisao.length
    ? { ...campaign, creatives: JSON.stringify(creatives.map((c: any) => ({ ...c, needsReview: false }))) }
    : campaign;
  const integridade = verificarIntegridadeParaPublicar(campanhaSemRevisao);
  if (!integridade.ok) {
    pendencias.push({
      tipo: "integridade", criativos: [], acao: "editar_texto",
      titulo: String(integridade.erro || "").replace(/^CAMPAIGN_INTEGRITY:\s*/, "") || "Integridade da campanha reprovada.",
      detalhes: [],
    });
  }

  if (!pendencias.length) return { ok: true, pendencias: [] };

  const primeira = pendencias[0];
  return {
    ok: false,
    erro: primeira.titulo,
    ...(primeira.detalhes.length ? { issues: primeira.detalhes } : {}),
    pendencias,
  };
}
