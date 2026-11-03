/**
 * limitesDeTextoMeta.ts — impedir que a copy chegue cortada ao anuncio.
 *
 * O caso que originou isto (campanha 804, 25/10): o texto principal dizia o
 * preco de R$ 19,90 no caractere 244. O feed do celular corta em ~125 e esconde
 * o resto atras de "Ver mais". O anuncio rodou um dia e meio sem mostrar o
 * preco a quem nao clicasse, e copy publicada na Meta NAO pode ser editada: so
 * criando anuncio novo, o que gasta e reinicia aprendizado. O erro custa depois.
 *
 * O ponto central, e a razao de este modulo existir: a Meta NAO reclama disso.
 * O texto e aceito, a API devolve sucesso, nenhuma validacao falha. O corte e
 * visual. Entao nenhum erro de publicacao jamais vai avisar — tem que ser
 * checagem deliberada, feita antes de publicar.
 *
 * Daqui sai a separacao que o resto do sistema usa:
 *
 *   - passar do MAXIMO rigido e recusa da Meta. Vira pendencia e bloqueia,
 *     porque publicar so gastaria a tentativa pra receber erro.
 *   - passar da DOBRA visivel e problema de leitura. Vira aviso e NAO bloqueia:
 *     texto cortado ainda e um anuncio valido, e travar publicacao por questao
 *     de qualidade repete a parede que a 799 ja criou pro usuario.
 *
 * E tem o achado que nao e tamanho, e sim ORDEM. Na 804 nenhum campo estourava
 * limite nenhum; o texto tinha menos de 500 caracteres, bem abaixo dos 2.200
 * aceitos. O problema era o preco estar depois da dobra. Contar caractere nao
 * pegaria isso. Por isso a analise tambem olha ONDE a oferta aparece.
 *
 * Limites conferidos em 25/10/2026 contra duas referencias independentes, que
 * concordam nos numeros. Sao do produto da Meta e mudam sem aviso, entao ficam
 * nomeados e num lugar so, em vez de espalhados pelo codigo.
 */

export interface LimiteDeCampo {
  /** Onde o texto passa a ficar escondido atras de "Ver mais". */
  visivel: number;
  /** Acima disto a Meta recusa o anuncio. */
  maximo: number;
  rotulo: string;
}

export const LIMITES: Record<string, LimiteDeCampo> = {
  textoPrincipal:     { visivel: 125, maximo: 2200, rotulo: "texto principal" },
  titulo:             { visivel: 27,  maximo: 40,   rotulo: "titulo" },
  descricao:          { visivel: 27,  maximo: 30,   rotulo: "descricao" },
  tituloCarrossel:    { visivel: 27,  maximo: 40,   rotulo: "titulo do card" },
  descricaoCarrossel: { visivel: 20,  maximo: 30,   rotulo: "descricao do card" },
};

/** Conta por ponto de codigo: acentuada e 1, emoji nao vira 2. */
export function contar(texto: string): number {
  return Array.from(String(texto ?? "")).length;
}

function cortar(texto: string, ate: number): string {
  return Array.from(String(texto ?? "")).slice(0, ate).join("");
}

function resto(texto: string, apos: number): string {
  return Array.from(String(texto ?? "")).slice(apos).join("");
}

export interface AchadoDeCampo {
  campo: string;
  rotulo: string;
  comprimento: number;
  visivel: number;
  maximo: number;
  /** A Meta recusa. Bloqueia. */
  excedeMaximo: boolean;
  /** Some atras de "Ver mais". Avisa, nao bloqueia. */
  cortado: boolean;
  trechoVisivel: string;
  trechoEscondido: string;
}

export function medirCampo(texto: string, campo: string): AchadoDeCampo | null {
  const limite = LIMITES[campo];
  if (!limite) return null;
  const t = String(texto ?? "").trim();
  if (!t) return null;
  const n = contar(t);
  return {
    campo, rotulo: limite.rotulo,
    comprimento: n,
    visivel: limite.visivel,
    maximo: limite.maximo,
    excedeMaximo: n > limite.maximo,
    cortado: n > limite.visivel,
    trechoVisivel: cortar(t, limite.visivel),
    trechoEscondido: n > limite.visivel ? resto(t, limite.visivel) : "",
  };
}

/** Preco em real, nas formas que a copy do produto costuma gerar. */
const PADRAO_DE_PRECO = /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/;

export interface PosicaoDaOferta {
  encontrado: boolean;
  texto: string | null;
  /** Posicao em pontos de codigo, contando do zero. */
  posicao: number | null;
  antesDaDobra: boolean;
}

/**
 * Onde o preco aparece no texto principal.
 *
 * Nao e exigencia de que todo anuncio tenha preco: campanha de marca nao tem, e
 * a ausencia nao gera aviso. Quando TEM preco, porem, esconde-lo atras do "Ver
 * mais" desperdica a impressao, que foi exatamente o caso da 804.
 */
export function posicaoDaOferta(textoPrincipal: string, dobra = LIMITES.textoPrincipal.visivel): PosicaoDaOferta {
  const t = String(textoPrincipal ?? "");
  const m = t.match(PADRAO_DE_PRECO);
  if (!m || m.index === undefined) return { encontrado: false, texto: null, posicao: null, antesDaDobra: false };
  // index vem em unidades UTF-16; converte pra pontos de codigo pra bater com a contagem.
  const posicao = contar(t.slice(0, m.index));
  // O preco precisa caber INTEIRO antes da dobra, nao so comecar antes dela.
  const fim = posicao + contar(m[0]);
  return { encontrado: true, texto: m[0], posicao, antesDaDobra: fim <= dobra };
}

export interface CriativoParaAnalise {
  copy?: string | null;
  bodyText?: string | null;
  headline?: string | null;
  description?: string | null;
  format?: string | null;
}

export interface AnaliseDeCriativo {
  indice: number;
  achados: AchadoDeCampo[];
  oferta: PosicaoDaOferta;
  /** Impedem publicar: a Meta recusaria. */
  bloqueios: string[];
  /** Nao impedem publicar: o anuncio fica pior, nao invalido. */
  avisos: string[];
}

export interface AnaliseDeTextos {
  ok: boolean;
  bloqueios: string[];
  avisos: string[];
  porCriativo: AnaliseDeCriativo[];
}

function ehCarrossel(formato?: string | null): boolean {
  return /carrossel|carousel/i.test(String(formato ?? ""));
}

export function analisarCriativo(criativo: CriativoParaAnalise, indice: number): AnaliseDeCriativo {
  const carrossel = ehCarrossel(criativo?.format);
  const principal = String(criativo?.copy || criativo?.bodyText || "").trim();

  const achados: AchadoDeCampo[] = [];
  const empilhar = (texto: any, campo: string) => {
    const a = medirCampo(texto, campo);
    if (a) achados.push(a);
  };
  empilhar(principal, "textoPrincipal");
  empilhar(criativo?.headline, carrossel ? "tituloCarrossel" : "titulo");
  empilhar(criativo?.description, carrossel ? "descricaoCarrossel" : "descricao");

  const bloqueios: string[] = [];
  const avisos: string[] = [];

  for (const a of achados) {
    if (a.excedeMaximo) {
      bloqueios.push(
        `Criativo ${indice}: ${a.rotulo} com ${a.comprimento} caracteres, acima do maximo de ${a.maximo} que a Meta aceita. A publicacao seria recusada.`,
      );
    } else if (a.cortado && a.campo !== "textoPrincipal") {
      avisos.push(
        `Criativo ${indice}: ${a.rotulo} com ${a.comprimento} caracteres; o feed do celular mostra cerca de ${a.visivel}, entao "${a.trechoEscondido}" nao aparece.`,
      );
    }
  }

  const oferta = posicaoDaOferta(principal);
  if (oferta.encontrado && !oferta.antesDaDobra) {
    avisos.push(
      `Criativo ${indice}: o preco ${oferta.texto} aparece no caractere ${oferta.posicao} do texto principal, depois da dobra de ${LIMITES.textoPrincipal.visivel}. ` +
      `Quem nao clicar em "Ver mais" nao ve o preco. Mova a oferta para a primeira frase.`,
    );
  } else if (!oferta.encontrado) {
    const principalCortado = achados.find((a) => a.campo === "textoPrincipal")?.cortado;
    if (principalCortado) {
      avisos.push(
        `Criativo ${indice}: o texto principal passa de ${LIMITES.textoPrincipal.visivel} caracteres e sera cortado. Confira se o que importa esta na primeira frase.`,
      );
    }
  }

  return { indice, achados, oferta, bloqueios, avisos };
}

/**
 * Analisa a campanha inteira.
 *
 * `ok` reflete SO os bloqueios. Aviso nunca derruba publicacao: ver o
 * cabecalho deste arquivo.
 */
export function analisarTextosDaCampanha(criativos: readonly CriativoParaAnalise[]): AnaliseDeTextos {
  const porCriativo = (criativos || []).map((c, i) => analisarCriativo(c || {}, i));
  const bloqueios = porCriativo.flatMap((c) => c.bloqueios);
  const avisos = porCriativo.flatMap((c) => c.avisos);
  return { ok: bloqueios.length === 0, bloqueios, avisos, porCriativo };
}
