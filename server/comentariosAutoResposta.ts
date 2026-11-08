// Auto-resposta de comentarios (Meta): classificacao e geracao de resposta.
// Modulo PURO (sem banco, sem rede) para ser testado e reaproveitado por qualquer projeto.
// Regras de seguranca:
//  - nunca responde sozinho a comentario sensivel (saude emocional, luto, crise) nem a critica: escala para humano;
//  - so usa link/preco que o usuario configurou, nunca inventa fatos;
//  - nunca devolve texto com placeholder sem preencher nem frase repetida.

export type Categoria = "sensivel" | "spam" | "critica" | "preco" | "interesse" | "duvida" | "elogio" | "curto" | "outro";
export type Acao = "responder" | "ignorar" | "escalar";

export interface ConfigResposta {
  link?: string;
  preco?: string;
}

export interface EntradaDecisao {
  texto: string;
  nomeAutor?: string;
  commentId: string;
  config: ConfigResposta;
  /** O autor e a propria pagina (nao responder a si mesmo). */
  ehDaPagina?: boolean;
  /** Ja existe resposta (ou sugestao) para essa pessoa neste post. */
  jaRespondeuPessoa?: boolean;
}

export interface Decisao {
  categoria: Categoria;
  acao: Acao;
  motivo: string;
  resposta?: string;
  /** Segundos de espera sugeridos antes de publicar, para soar natural. */
  atrasoSegundos?: number;
}

export function normalizar(texto: string): string {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const SENSIVEL = [
  "depress", "ansied", "suicid", "me matar", "quero morrer", "nao aguento", "sem forca", "sofrend", "sofro ",
  "luto", "perdi meu", "perdi minha", "panico", "abuso", "violencia", "doente", "cancer", "remedio", "desesper",
];
const CRITICA = [
  "golpe", "fake", "mentira", "enganacao", "enganando", "lixo", "porcaria", "pilantra", "propaganda enganosa",
  "nao funciona", "charlatao", "charlatanismo", "estelionat", "processar", "denunciar",
];
const PRECO = ["quanto custa", "quanto e", "quanto fica", "valor", "preco", "r$", "custa", "mensalidade", "parcel"];
const INTERESSE = [
  "quero", "como faco", "como participo", "como participar", "como compro", "como comprar", "como me inscrevo",
  "inscrever", "inscricao", "me interessa", "tenho interesse", "interessad", "link", "onde acesso", "onde compro", "informacoes", "info ",
];
const PERGUNTA = ["como ", "qual ", "quais ", "quando ", "onde ", "tem ", "posso ", "pode ", "serve ", "funciona ", "existe "];
const ELOGIO = [
  "amem", "gratidao", "obrigad", "lindo", "linda", "maravilh", "parabens", "otimo", "perfeito", "excelente", "show",
  "deus", "abenco", "top", "incrivel", "amei", "adorei", "verdade", "concordo", "inspirador",
];

function contem(t: string, lista: string[]): boolean {
  return lista.some((k) => t.includes(k));
}

export function classificarComentario(textoBruto: string): Categoria {
  const t = normalizar(textoBruto);
  const letras = t.replace(/[^a-z]/g, "");
  if (letras.length < 3) return "curto";
  if (contem(t, SENSIVEL)) return "sensivel";
  if (/(https?:\/\/|www\.|\.com\b|\.br\b)/.test(t) || /(chama no pv|siga-?me|sigam|ganhe dinheiro|renda extra|me segue)/.test(t)) return "spam";
  if (contem(t, CRITICA)) return "critica";
  if (contem(t, PRECO)) return "preco";
  if (contem(t, INTERESSE)) return "interesse";
  if (t.includes("?") || PERGUNTA.some((p) => (t + " ").startsWith(p))) return "duvida";
  if (contem(t, ELOGIO)) return "elogio";
  return "outro";
}

interface Modelo { t: string }

// Textos neutros quanto a genero e sem promessas. {nome}, {link} e {preco} so entram se existirem.
const MODELOS: Partial<Record<Categoria, Modelo[]>> = {
  elogio: [
    { t: "Que bom ter você por aqui, {nome}!" },
    { t: "Gratidão pelo carinho, {nome}." },
    { t: "Fico feliz com a sua mensagem, {nome}. Um abraço!" },
    { t: "Obrigado por acompanhar, {nome}." },
    { t: "Que bom ter você por aqui!" },
    { t: "Gratidão pelo carinho." },
  ],
  duvida: [
    { t: "Os detalhes estão aqui: {link}" },
    { t: "Oi {nome}, tudo bem? Os detalhes estão aqui: {link}" },
    { t: "{nome}, você encontra tudo neste link: {link}. Se ficar com dúvida, é só chamar." },
    { t: "Oi {nome}! Pode me contar um pouco mais da sua dúvida? Assim consigo te ajudar melhor." },
  ],
  interesse: [
    { t: "Que bom o seu interesse, {nome}! É por aqui: {link}" },
    { t: "{nome}, para começar é só acessar: {link}" },
    { t: "Que bom o seu interesse! É por aqui: {link}" },
  ],
  preco: [
    { t: "O valor é {preco}. Os detalhes estão aqui: {link}" },
    { t: "{nome}, o valor é {preco}. Os detalhes estão aqui: {link}" },
    { t: "O valor é {preco}, {nome}." },
  ],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function primeiroNome(nome?: string): string {
  const p = String(nome || "").trim().split(/\s+/)[0] || "";
  if (!p || /[^\p{L}'-]/u.test(p)) return "";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/** Garante que nenhuma frase aparece duas vezes (bug visto em producao: "Oi X faça... Oi X faça..."). */
export function semFraseRepetida(texto: string): boolean {
  const norm = normalizar(texto);
  const partes = norm.split(/[.!?\n]+/).map((p) => p.trim()).filter((p) => p.length > 8);
  if (new Set(partes).size !== partes.length) return false;
  // Trecho de 4 palavras repetido (pega a duplicacao mesmo sem pontuacao entre as frases).
  const palavras = norm.replace(/[^a-z0-9 ]/g, " ").split(" ").filter(Boolean);
  const vistos = new Set<string>();
  for (let i = 0; i + 4 <= palavras.length; i++) {
    const trecho = palavras.slice(i, i + 4).join(" ");
    if (vistos.has(trecho)) return false;
    vistos.add(trecho);
  }
  return true;
}

export function montarResposta(categoria: Categoria, dados: { nome?: string; link?: string; preco?: string }, commentId: string): string | null {
  const modelos = MODELOS[categoria];
  if (!modelos) return null;
  const valores: Record<string, string> = {
    nome: primeiroNome(dados.nome),
    link: String(dados.link || "").trim(),
    preco: String(dados.preco || "").trim(),
  };
  const usaveis = modelos.filter((m) => {
    const campos = Array.from(m.t.matchAll(/\{(\w+)\}/g)).map((x) => x[1]);
    return campos.every((c) => valores[c]);
  });
  // Com nome utilizavel, prefere modelos que o usam; sem nome, so os que nao dependem dele.
  const comNome = usaveis.filter((m) => m.t.includes("{nome}"));
  const lista = valores.nome && comNome.length ? comNome : usaveis.filter((m) => !m.t.includes("{nome}"));
  if (!lista.length) return null;
  const escolhido = lista[hash(commentId) % lista.length];
  const texto = escolhido.t.replace(/\{(\w+)\}/g, (_, c) => valores[c]).replace(/\s+/g, " ").trim();
  if (/[{}]/.test(texto) || !semFraseRepetida(texto)) return null;
  return texto;
}

export function atrasoSugerido(commentId: string): number {
  return 120 + (hash("atraso" + commentId) % 481); // 2 a 10 minutos
}

export function decidir(e: EntradaDecisao): Decisao {
  if (e.ehDaPagina) return { categoria: "outro", acao: "ignorar", motivo: "Comentário da própria página." };
  const categoria = classificarComentario(e.texto);
  if (e.jaRespondeuPessoa) return { categoria, acao: "ignorar", motivo: "Esta pessoa já recebeu resposta neste post." };

  if (categoria === "sensivel") return { categoria, acao: "escalar", motivo: "Assunto sensível: precisa de atenção humana, sem resposta automática." };
  if (categoria === "critica") return { categoria, acao: "escalar", motivo: "Crítica ou reclamação: responda você mesmo." };
  if (categoria === "spam") return { categoria, acao: "ignorar", motivo: "Parece spam ou divulgação." };
  if (categoria === "curto") return { categoria, acao: "ignorar", motivo: "Só emoji ou texto muito curto." };
  if (categoria === "outro") return { categoria, acao: "ignorar", motivo: "Não identifiquei a intenção do comentário." };

  const resposta = montarResposta(categoria, { nome: e.nomeAutor, link: e.config.link, preco: e.config.preco }, e.commentId);
  if (!resposta) {
    return { categoria, acao: "escalar", motivo: categoria === "preco" ? "Pergunta de preço, mas o preço não está configurado." : "Faltou link ou dado configurado para responder." };
  }
  return { categoria, acao: "responder", motivo: "Resposta sugerida.", resposta, atrasoSegundos: atrasoSugerido(e.commentId) };
}
