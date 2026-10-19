/**
 * O que de um briefing confirmado pode virar cena numa imagem.
 *
 * Modulo proprio, puro, sem rede e sem banco: e a unica fonte da decisao, e
 * tem teste de invariante proprio.
 *
 * ## Por que existe (19/10)
 *
 * Michel: *"essa alteracao precisa cobrir possiveis situacoes que venham surgir
 * no futuro"*. O pedido aponta uma fraqueza real do que eu tinha acabado de
 * escrever.
 *
 * A historia em tres passos:
 *
 *  1. O filtro de fatos visuais tinha **vocabulario de imovel**
 *     (`tipo|caracteristica|mobilia|pavimentos`) aplicado aos 16 segmentos.
 *     Para um infoproduto, todo fato confirmado era descartado — foi a raiz da
 *     saga do VR da campanha 799.
 *  2. Eu troquei por procedencia mais sanitizacao, e acrescentei uma lista de
 *     **20 rotulos transacionais** pra barrar "Venda:", "Contato:", "Preco:".
 *  3. Que e o mesmo erro invertido: troquei uma lista de 4 palavras que
 *     envelhece por uma de 20 que envelhece igual. O proximo briefing traz
 *     "Garantia", "Reembolso", "Parcelamento", "Redes sociais", "Horario de
 *     atendimento" — rotulos que eu nao listei, e cada um que escapa coloca
 *     texto nao-visual no prompt de imagem.
 *
 * ## O que generaliza, e o que nao
 *
 * **Generaliza**: regra de FORMA, que nao depende de eu adivinhar palavra.
 * Digito, URL, dominio, e-mail, @handle e aparte em parenteses nunca sao cena,
 * em nenhum segmento, em nenhum idioma de briefing.
 *
 * **Nao generaliza, e nao da pra fingir que generaliza**: nome de marca.
 * "Hotmart" e barrado pelo rotulo `plataforma`, que e vocabulario — nao forma.
 * "Hotmart" e barrado hoje porque vem sob rotulo transacional, mas
 * "Diferencial: parceria com a Nike" passaria. Marca em prompt de imagem e
 * pedido de logo. Nao existe regra determinística pra detectar marca sem lista
 * — e lista e exatamente o que envelhece. Isso fica para o portao visual, que
 * tem `blockers` e reprova logo e material de banco de imagem; esta registrado
 * como limite conhecido, nao resolvido.
 *
 * **Reduzido de tres listas para uma.** `VISUAL_EXPLICITO` (imovel) foi
 * eliminado: em vez de caso especial, o rotulo SEMPRE sai e o valor carrega o
 * conteudo — "tipo: apartamento de dois quartos" vira "apartamento de dois
 * quartos", que e melhor no prompt e dispensa a lista. Resta um unico
 * vocabulario, `TERMO_NAO_VISUAL`, aplicado ao fato INTEIRO (rotulo e valor),
 * entao funciona tambem em fato sem rotulo — "Compre no site oficial", solto,
 * era invisivel pro filtro por rotulo.
 *
 * ## Uma regra que eu considerei e descartei
 *
 * Barrar sigla em CAIXA ALTA (CNPJ, CPF, PIX) parecia generalizar. **Barraria
 * "VR"** — exatamente o fato que esta semana toda tentou fazer chegar na
 * imagem. CNPJ e CPF morrem de graca: o valor e digito e o rotulo sai, sobra
 * vazio. Regra desnecessaria que teria criado o bug seguinte.
 */

/**
 * Termo que marca transacao, canal, identificador ou clausula — nunca cena.
 *
 * Uniao de duas listas que viviam separadas: a comercial de
 * `sanitizarAssuntoVisual` e os rotulos transacionais do filtro de fatos. Uma
 * lista pra manter, aplicada ao fato inteiro.
 *
 * Quando um rotulo novo escapar, o lugar de corrigir e aqui — e o teste de
 * invariante (`imageSubjectSafety.test.ts`) falha antes de chegar em producao,
 * porque afirma propriedade da SAIDA, nao presenca de palavra na lista.
 */
const TERMO_NAO_VISUAL =
  // Os termos originais do `comercial` historico ficam intactos — cada um tem
  // razao propria, e "materia(l|is) complementar" tem bug documentado atras.
  /(r\$|reais|\/m[eê]s|mensal|mensalidade|assinatura|plano\b|parcel|pagamento|pague|desconto|promo|cupom|frete|certificad|garantia|matr[ií]cula|acesso ilimitado|materia(l|is)\s+complementar|conte[uú]dos? da plataforma|por apenas|a partir de|%)/i;

/**
 * Termos de transacao e canal, acrescentados em 19/10 — e PODADOS no mesmo dia.
 *
 * A primeira versao tinha tambem `atendimento`, `suporte`, `canal`,
 * `plataforma`, `valor`, `prazo`, `entrega`, `contato`, `telefone`, `e-mail`,
 * `cnpj`, `cpf` e `inscricao`. O teste de invariante derrubou na hora:
 * **`atendimento` matava "atendimento em VR com acompanhamento"** — cena
 * legitima, e justamente o fato que a semana toda tentou fazer chegar na
 * imagem. "atendimento domiciliar", "atendimento individual", "canal de luz",
 * "plano de aula": palavra generica em lista de bloqueio bloqueia demais.
 *
 * A poda tem criterio, nao gosto: **termo cujo VALOR tem forma de
 * identificador nao precisa estar aqui**, porque a regra de forma ja o mata.
 * "Contato: ola@x.com.br" perde o e-mail e sobra vazio; "Telefone: (11)
 * 99999-0000" perde digito e parentese e sobra vazio; "CNPJ: 12.345.678/0001"
 * sobra vazio. Treze palavras saíram da manutencao sem perder uma barreira.
 *
 * Fica aqui so o que chega como PROSA e ainda assim nunca e cena.
 */
const TERMO_TRANSACIONAL =
  /(pix\b|boleto|cart[aã]o de cr[eé]dito|reembolso|vendas?\b|comprar|compre\b|inscreva|checkout|pre[cç]o|site\b|link\b|url\b|whatsapp|redes sociais|instagram|facebook|youtube|tiktok|hor[aá]rio de atendimento|canal de atendimento|pol[ií]tica de cancelamento|plataforma)/i;

/** Qualquer das duas listas barra. Separadas so pra manter a historia de cada uma. */
function termoNaoVisual(texto: string): boolean {
  return TERMO_NAO_VISUAL.test(texto) || TERMO_TRANSACIONAL.test(texto);
}

/** Formas que nunca sao cena, sem depender de vocabulario. */
function removerFormasNaoVisuais(texto: string): string {
  return texto
    // URL inteira primeiro: depois o split por "." picaria o dominio em
    // pedacos que escapam.
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+/gi, " ")
    .replace(/(^|\s)@[\w.]+/g, " ")
    .replace(/\b[\w-]+\.(com|br|net|org|io|app|me|co|shop|store|online|site)(\.[a-z]{2})?\b/gi, " ")
    // Aparte em parenteses ("(se aplicavel)", "(opcional)") e ressalva de
    // briefing, nao elemento de cena.
    .replace(/\([^)]*\)/g, " ");
}

/**
 * Texto visualmente usavel de uma frase de briefing.
 *
 * Mantem o nome e o contrato antigos: era exportado de `imageGeneration.ts` e
 * ha teste em cima dele.
 */
export function sanitizarAssuntoVisual(texto: string): string {
  if (!texto || !String(texto).trim()) return "";

  const limpo = removerFormasNaoVisuais(String(texto))
    .split(/[,;.]/)
    .map(parte => parte.trim())
    .filter(parte => parte.length > 2 && !termoNaoVisual(parte))
    // Numero remanescente sai: o prompt nao pede numero na imagem. SEM \b de
    // proposito — com fronteira de palavra, "120m2" escapava inteiro, porque
    // entre "0" e "m" nao existe fronteira. Metragem e quantidade de quartos
    // chegavam no modelo mesmo com a proibicao no prompt.
    .map(parte => parte.replace(/\d+([.,]\d+)?/g, "").replace(/\s{2,}/g, " ").trim())
    .filter(Boolean)
    .join(", ");

  // Assunto longo demais dilui o peso no modelo; corta em 20 palavras.
  return limpo.split(/\s+/).slice(0, 20).join(" ").replace(/[,\s]+$/, "");
}

/** Letras de verdade, pra descartar resto de rotulo ("Contato:", "Veja em"). */
function letras(texto: string): number {
  return (texto.match(/\p{L}/gu) || []).length;
}

export const ORCAMENTO_FATOS_VISUAIS = 320;
export const MAX_FATOS_VISUAIS = 6;

/**
 * Fatos confirmados que podem virar cena, prontos pro prompt.
 *
 * O teto e de CARACTERES, nao so de contagem: seis fatos curtos somam pouco e
 * seis fatos verbosos diluem o assunto inteiro. Briefing futuro pode ter fato
 * de qualquer tamanho, e orcamento aguenta isso; contagem nao.
 */
export function fatosVisuaisDoBriefing(
  fatos: unknown,
  orcamento = ORCAMENTO_FATOS_VISUAIS,
  maximo = MAX_FATOS_VISUAIS,
): string[] {
  if (!Array.isArray(fatos)) return [];

  const aceitos: string[] = [];
  let usado = 0;

  for (const bruto of fatos) {
    if (aceitos.length >= maximo || usado >= orcamento) break;
    const texto = typeof bruto === "string" ? bruto : "";
    if (!texto.trim()) continue;

    // Rotulo SEMPRE sai: o valor e que carrega a cena, e sem caso especial nao
    // ha segunda lista pra manter.
    const semRotulo = texto.replace(/^[^:]{2,50}:\s*/, "");
    const limpo = sanitizarAssuntoVisual(semRotulo);
    if (letras(limpo) < 4) continue;
    // REGRA CONSIDERADA E DESCARTADA: "fato de uma palavra nao e cena".
    //
    // Entrou pra pegar "Plataforma: Hotmart" depois que eu tirei `plataforma`
    // da lista, e foi derrubada por um teste que ja existia:
    // "Caracteristica: ar-condicionado" e UMA palavra e e cena legitima. Com
    // ela, "churrasqueira", "varanda" e "piscina" tambem morriam.
    //
    // Pelo criterio do proprio pedido — cobrir o futuro —, ela e PIOR que a
    // palavra que eu tinha tirado: a superficie de erro dela e todo fato visual
    // de um token, e a da palavra e so "plataforma" aparecendo como objeto de
    // cena, que nesse dominio e raro. Uma palavra estreita de volta na lista
    // ganha de uma regra larga.
    // Checado tambem no fato INTEIRO: fato sem rotulo ("Compre no site
    // oficial") era invisivel pro filtro que olhava so o rotulo.
    if (termoNaoVisual(texto)) continue;

    aceitos.push(limpo);
    usado += limpo.length;
  }

  return aceitos;
}
