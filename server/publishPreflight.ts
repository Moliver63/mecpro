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
}

export function pendenciasLocaisParaPublicar(campaign: any): PendenciaDePublicacao {
  const adSets: any[] = (() => { try { return JSON.parse(campaign?.adSets || "[]"); } catch { return []; } })();
  const creatives: any[] = (() => { try { return JSON.parse(campaign?.creatives || "[]"); } catch { return []; } })();

  if (adSets.length === 0) return { ok: false, erro: "Essa campanha não tem conjuntos de anúncios gerados." };

  const copyAudit = auditCarouselCreatives(creatives);
  if (!copyAudit.ok) {
    return {
      ok: false,
      erro: "Publicação bloqueada pela auditoria de carrossel: há cards com copy fraca, curta ou repetida. Regenere ou atualize os criativos antes de publicar.",
      issues: copyAudit.issues,
    };
  }

  const temImagem = orderedCreativesForCarousel(creatives)
    .map((c: any) => getCreativeMedia(c))
    .some((x: any) => x?.hash || x?.url);
  if (!temImagem) return { ok: false, erro: "Nenhuma imagem encontrada nos criativos — não é possível publicar sem imagem." };

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
    const liberaveis = diagnosticos.filter((x) => x.d.liberavelPorAprovacao).map((x) => x.index);
    const bloqueados = diagnosticos.filter((x) => !x.d.liberavelPorAprovacao).map((x) => x.index);
    const caminhos = [
      liberaveis.length ? `criativo(s) ${liberaveis.join(", ")} tem so score baixo e podem ser aprovados pelo usuario com aprovar_revisao_criativo` : "",
      bloqueados.length ? `criativo(s) ${bloqueados.join(", ")} precisam ter o texto corrigido com editar_criativo antes` : "",
    ].filter(Boolean).join("; ");
    return {
      ok: false,
      erro: `Publicação bloqueada: ${emRevisao.length} criativo(s) ainda precisam de revisão. ${caminhos}.`,
      issues: diagnosticos.map((x) => descreverDiagnostico(x.index, x.d)),
    };
  }

  // Mesma regra da publicacao real (snapshot de fatos, objetivo, Fact Guard).
  const integridade = verificarIntegridadeParaPublicar(campaign);
  if (!integridade.ok) return { ok: false, erro: integridade.erro };

  return { ok: true };
}
