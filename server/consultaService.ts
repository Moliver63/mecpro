/**
 * MECPro — consultaService.ts  v3.0  "Solução de Ouro"
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * CNPJ  → cascata de 4 fontes gratuitas com fallback automático
 *         1ª ReceitaWS  →  2ª CNPJ.ws  →  3ª BrasilAPI  →  4ª MinhaReceita
 *
 * PROCESSOS → busca PARALELA em TODOS os 40+ tribunais do CNJ Datajud
 *             Usando Promise.allSettled() — nenhum estado fica de fora
 *             Resultados de todas as instâncias são agregados
 *
 * CPF   → sem dados cadastrais (LGPD) — apenas processos judiciais
 * ──────────────────────────────────────────────────────────────────────────────
 */

// ── Logger inline (zero dependência externa) ─────────────────────────────────
const log = {
  info:  (ctx: string, msg: string, data?: unknown) =>
    console.log(`[INFO ] [${ctx}] ${msg}`, data ?? ""),
  warn:  (ctx: string, msg: string, data?: unknown) =>
    console.warn(`[WARN ] [${ctx}] ${msg}`, data ?? ""),
  error: (ctx: string, msg: string, data?: unknown) =>
    console.error(`[ERROR] [${ctx}] ${msg}`, data ?? ""),
  debug: (ctx: string, msg: string, data?: unknown) =>
    console.log(`[DEBUG] [${ctx}] ${msg}`, data ?? ""),
};

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface DadosCNPJ {
  razaoSocial:     string;
  nomeFantasia?:   string;
  situacao:        string;
  porte?:          string;
  capitalSocial?:  number;
  dataAbertura?:   string;
  cnae?:           string;
  email?:          string;
  telefone?:       string;
  logradouro?:     string;
  numero?:         string;
  bairro?:         string;
  municipio?:      string;
  uf?:             string;
  cep?:            string;
  qsa?:            { nome: string; qualificacao: string }[];
  fonte:           string;
}

export interface Processo {
  numeroProcesso:   string;
  tribunal:         string;
  classe?:          string;
  assunto?:         string;
  dataAjuizamento?: string;
  orgaoJulgador?:   string;
  grau?:            string;
  segmento?:        string;
}


export interface SancaoCGU {
  id?:                     number;
  nomeInformadoPeloOrgao?: string;
  cnpj?:                   string;
  cpf?:                    string;
  numero?:                 string;
  tipoSancao?:             string;
  dataInicioSancao?:       string;
  dataFinalSancao?:        string;
  dataPublicacao?:         string;
  orgaoSancionador?:       string;
  ufOrgaoSancionador?:     string;
  codigoSancao?:           string;
  valorMulta?:             number;
  fundamentacaoLegal?:     string;
  descricao?:              string;
  fonte:                   "CEIS" | "CNEP";
}

export interface SimplesNacional {
  cnpj:                    string;
  simples?:                {
    optante:               boolean;
    dataOpcao?:            string;
    dataExclusao?:         string;
    ultimaAtualizacao?:    string;
  };
  simei?:                  {
    optante:               boolean;
    dataOpcao?:            string;
    dataExclusao?:         string;
    ultimaAtualizacao?:    string;
  };
}

export interface ResultadoConsulta {
  documento:       string;
  tipo:            "cpf" | "cnpj";
  cnpj?:           DadosCNPJ;
  processos:       Processo[];
  totalProcessos:  number;
  fontes:          string[];
  tribunaisOk?:    string[];
  fonteUsada?:     string;
  sancoesCEIS?:    SancaoCGU[];
  sancoesCNEP?:    SancaoCGU[];
  simplesNacional?: SimplesNacional | null;
  // Escavador
  escavadorNome?:          string;
  escavadorNascimento?:    string;
  escavadorCPF?:           string;
  escavadorEmails?:        string[];
  escavadorTelefones?:     string[];
  escavadorEnderecos?:     string[];
  escavadorTotalProcessos?: number;
  escavadorSocios?:        { nome: string; qualificacao: string }[];
  escavadorProcessos?:     Processo[];
}

// ── Helper fetch com timeout ──────────────────────────────────────────────────
async function fetchJson(
  url: string,
  options?: RequestInit,
  timeoutMs = 10_000,
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FONTE 1 — ReceitaWS  (gratuita, 3 req/min sem key)
// ══════════════════════════════════════════════════════════════════════════════
async function fetchReceitaWS(cnpj: string): Promise<DadosCNPJ | null> {
  try {
    const data = await fetchJson(
      `https://www.receitaws.com.br/v1/cnpj/${cnpj}`,
      {},
      8_000,
    );
    if (data.status === "ERROR" || !data.nome) return null;
    return {
      razaoSocial:   data.nome,
      nomeFantasia:  data.fantasia || undefined,
      situacao:      data.situacao,
      porte:         data.porte || undefined,
      capitalSocial: data.capital_social
        ? Math.round(parseFloat(String(data.capital_social).replace(/\./g, "").replace(",", ".")))
        : undefined,
      dataAbertura:  data.abertura || undefined,
      cnae:          data.atividade_principal?.[0]
        ? `${data.atividade_principal[0].code} — ${data.atividade_principal[0].text}`
        : undefined,
      email:         data.email || undefined,
      telefone:      data.telefone || undefined,
      logradouro:    data.logradouro || undefined,
      numero:        data.numero || undefined,
      bairro:        data.bairro || undefined,
      municipio:     data.municipio || undefined,
      uf:            data.uf || undefined,
      cep:           data.cep || undefined,
      qsa:           (data.qsa || []).map((s: any) => ({ nome: s.nome, qualificacao: s.qual })),
      fonte: "ReceitaWS",
    };
  } catch (e: any) {
    log.warn("consulta", "ReceitaWS falhou", { cnpj, err: e.message });
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FONTE 2 — CNPJ.ws  (gratuita, sem limite documentado)
// ══════════════════════════════════════════════════════════════════════════════
async function fetchCNPJws(cnpj: string): Promise<DadosCNPJ | null> {
  try {
    const data = await fetchJson(`https://publica.cnpj.ws/cnpj/${cnpj}`, {}, 10_000);
    if (!data.razao_social) return null;
    const est = data.estabelecimento;
    return {
      razaoSocial:   data.razao_social,
      nomeFantasia:  est?.nome_fantasia || undefined,
      situacao:      est?.situacao_cadastral || "DESCONHECIDA",
      porte:         data.porte?.descricao || undefined,
      capitalSocial: data.capital_social ? Math.round(Number(data.capital_social)) : undefined,
      dataAbertura:  est?.data_inicio_atividade || undefined,
      cnae:          est?.atividade_principal
        ? `${est.atividade_principal.subclasse} — ${est.atividade_principal.descricao}`
        : undefined,
      email:         est?.email || undefined,
      telefone:      est?.ddd1 && est?.telefone1 ? `(${est.ddd1}) ${est.telefone1}` : undefined,
      logradouro:    est?.logradouro || undefined,
      numero:        est?.numero || undefined,
      bairro:        est?.bairro || undefined,
      municipio:     est?.cidade?.nome || undefined,
      uf:            est?.estado?.sigla || undefined,
      cep:           est?.cep || undefined,
      qsa:           (data.socios || []).map((s: any) => ({
        nome: s.nome,
        qualificacao: s.qualificacao_socio?.descricao || "",
      })),
      fonte: "CNPJ.ws",
    };
  } catch (e: any) {
    log.warn("consulta", "CNPJ.ws falhou", { cnpj, err: e.message });
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FONTE 3 — BrasilAPI  (gratuita, às vezes 403)
// ══════════════════════════════════════════════════════════════════════════════
async function fetchBrasilAPI(cnpj: string): Promise<DadosCNPJ | null> {
  try {
    const data = await fetchJson(
      `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
      { headers: { "User-Agent": "MECPro/3.0" } },
      10_000,
    );
    if (!data.razao_social) return null;
    return {
      razaoSocial:   data.razao_social,
      nomeFantasia:  data.nome_fantasia || undefined,
      situacao:      data.situacao_cadastral,
      porte:         data.porte || undefined,
      capitalSocial: data.capital_social ? Math.round(Number(data.capital_social)) : undefined,
      dataAbertura:  data.data_inicio_atividade || undefined,
      cnae:          data.cnae_fiscal_descricao || undefined,
      email:         data.email || undefined,
      telefone:      data.telefone || undefined,
      logradouro:    data.logradouro || undefined,
      numero:        data.numero || undefined,
      bairro:        data.bairro || undefined,
      municipio:     data.municipio || undefined,
      uf:            data.uf || undefined,
      cep:           data.cep || undefined,
      qsa:           (data.qsa || []).map((s: any) => ({
        nome: s.nome_socio,
        qualificacao: s.qualificacao_socio,
      })),
      fonte: "BrasilAPI / Receita Federal",
    };
  } catch (e: any) {
    log.warn("consulta", "BrasilAPI falhou", { cnpj, err: e.message });
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FONTE 4 — Minha Receita  (backup final, open source)
// ══════════════════════════════════════════════════════════════════════════════
async function fetchMinhaReceita(cnpj: string): Promise<DadosCNPJ | null> {
  try {
    const data = await fetchJson(
      `https://minhareceita.org/${cnpj}`,
      { headers: { "User-Agent": "MECPro/3.0" } },
      10_000,
    );
    if (!data.razao_social) return null;
    return {
      razaoSocial:   data.razao_social,
      nomeFantasia:  data.nome_fantasia || undefined,
      situacao:      data.descricao_situacao_cadastral || data.situacao_cadastral || "ATIVA",
      porte:         data.descricao_porte || undefined,
      capitalSocial: data.capital_social ? Math.round(Number(data.capital_social)) : undefined,
      dataAbertura:  data.data_inicio_atividade || undefined,
      cnae:          data.cnae_fiscal_descricao || undefined,
      email:         data.email || undefined,
      telefone:      data.ddd_telefone_1 ? data.ddd_telefone_1.trim() : undefined,
      logradouro:    data.logradouro || undefined,
      numero:        data.numero || undefined,
      bairro:        data.bairro || undefined,
      municipio:     data.municipio || undefined,
      uf:            data.uf || undefined,
      cep:           data.cep || undefined,
      qsa:           (data.qsa || []).map((s: any) => ({
        nome: s.nome_socio || s.nome || "",
        qualificacao: s.qualificacao_socio || "",
      })),
      fonte: "Minha Receita",
    };
  } catch (e: any) {
    log.warn("consulta", "MinhaReceita falhou", { cnpj, err: e.message });
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CNPJ — cascata 4 fontes
// ══════════════════════════════════════════════════════════════════════════════
export async function consultarCNPJ(cnpj: string): Promise<DadosCNPJ | null> {
  const fontes = [fetchReceitaWS, fetchCNPJws, fetchBrasilAPI, fetchMinhaReceita];
  for (const fn of fontes) {
    const resultado = await fn(cnpj);
    if (resultado) {
      log.info("consulta", `CNPJ OK via ${resultado.fonte}`, { cnpj });
      return resultado;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  log.warn("consulta", "Todas as fontes CNPJ falharam", { cnpj });
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// CNJ Datajud — TODOS os 40+ tribunais (busca PARALELA)
// ══════════════════════════════════════════════════════════════════════════════

// Chave pública oficial CNJ — lê do .env ou usa a vigente
const _RAW_CNJ_KEY = process.env.CNJ_API_KEY ??
  "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";
// Garante o prefixo "ApiKey " com case correto (CNJ é case-sensitive)
const CNJ_KEY = _RAW_CNJ_KEY.startsWith("ApiKey ") ? _RAW_CNJ_KEY
  : _RAW_CNJ_KEY.startsWith("APIKey ") ? _RAW_CNJ_KEY.replace(/^APIKey /, "ApiKey ")
  : `ApiKey ${_RAW_CNJ_KEY}`;

const BASE = "https://api-publica.datajud.cnj.jus.br";

// Lista COMPLETA de todos os tribunais brasileiros no Datajud
const ALL_TRIBUNAIS: { nome: string; alias: string; segmento: string }[] = [
  // Tribunais Superiores
  { nome: "STF",    alias: "api_publica_stf",    segmento: "Superior" },
  { nome: "STJ",    alias: "api_publica_stj",    segmento: "Superior" },
  { nome: "TST",    alias: "api_publica_tst",    segmento: "Superior" },
  { nome: "TSE",    alias: "api_publica_tse",    segmento: "Superior" },
  { nome: "STM",    alias: "api_publica_stm",    segmento: "Superior" },
  // Justiça Federal
  { nome: "TRF1",   alias: "api_publica_trf1",   segmento: "Federal" },
  { nome: "TRF2",   alias: "api_publica_trf2",   segmento: "Federal" },
  { nome: "TRF3",   alias: "api_publica_trf3",   segmento: "Federal" },
  { nome: "TRF4",   alias: "api_publica_trf4",   segmento: "Federal" },
  { nome: "TRF5",   alias: "api_publica_trf5",   segmento: "Federal" },
  { nome: "TRF6",   alias: "api_publica_trf6",   segmento: "Federal" },
  // Justiça Estadual — todos os 27 TJs
  { nome: "TJAC",   alias: "api_publica_tjac",   segmento: "Estadual" },
  { nome: "TJAL",   alias: "api_publica_tjal",   segmento: "Estadual" },
  { nome: "TJAM",   alias: "api_publica_tjam",   segmento: "Estadual" },
  { nome: "TJAP",   alias: "api_publica_tjap",   segmento: "Estadual" },
  { nome: "TJBA",   alias: "api_publica_tjba",   segmento: "Estadual" },
  { nome: "TJCE",   alias: "api_publica_tjce",   segmento: "Estadual" },
  { nome: "TJDFT",  alias: "api_publica_tjdft",  segmento: "Estadual" },
  { nome: "TJES",   alias: "api_publica_tjes",   segmento: "Estadual" },
  { nome: "TJGO",   alias: "api_publica_tjgo",   segmento: "Estadual" },
  { nome: "TJMA",   alias: "api_publica_tjma",   segmento: "Estadual" },
  { nome: "TJMG",   alias: "api_publica_tjmg",   segmento: "Estadual" },
  { nome: "TJMS",   alias: "api_publica_tjms",   segmento: "Estadual" },
  { nome: "TJMT",   alias: "api_publica_tjmt",   segmento: "Estadual" },
  { nome: "TJPA",   alias: "api_publica_tjpa",   segmento: "Estadual" },
  { nome: "TJPB",   alias: "api_publica_tjpb",   segmento: "Estadual" },
  { nome: "TJPE",   alias: "api_publica_tjpe",   segmento: "Estadual" },
  { nome: "TJPI",   alias: "api_publica_tjpi",   segmento: "Estadual" },
  { nome: "TJPR",   alias: "api_publica_tjpr",   segmento: "Estadual" },
  { nome: "TJRJ",   alias: "api_publica_tjrj",   segmento: "Estadual" },
  { nome: "TJRN",   alias: "api_publica_tjrn",   segmento: "Estadual" },
  { nome: "TJRO",   alias: "api_publica_tjro",   segmento: "Estadual" },
  { nome: "TJRR",   alias: "api_publica_tjrr",   segmento: "Estadual" },
  { nome: "TJRS",   alias: "api_publica_tjrs",   segmento: "Estadual" },
  { nome: "TJSC",   alias: "api_publica_tjsc",   segmento: "Estadual" },
  { nome: "TJSE",   alias: "api_publica_tjse",   segmento: "Estadual" },
  { nome: "TJSP",   alias: "api_publica_tjsp",   segmento: "Estadual" },
  { nome: "TJTO",   alias: "api_publica_tjto",   segmento: "Estadual" },
  // Justiça do Trabalho — TRT1 a TRT24
  { nome: "TRT1",   alias: "api_publica_trt1",   segmento: "Trabalho" },
  { nome: "TRT2",   alias: "api_publica_trt2",   segmento: "Trabalho" },
  { nome: "TRT3",   alias: "api_publica_trt3",   segmento: "Trabalho" },
  { nome: "TRT4",   alias: "api_publica_trt4",   segmento: "Trabalho" },
  { nome: "TRT5",   alias: "api_publica_trt5",   segmento: "Trabalho" },
  { nome: "TRT6",   alias: "api_publica_trt6",   segmento: "Trabalho" },
  { nome: "TRT7",   alias: "api_publica_trt7",   segmento: "Trabalho" },
  { nome: "TRT8",   alias: "api_publica_trt8",   segmento: "Trabalho" },
  { nome: "TRT9",   alias: "api_publica_trt9",   segmento: "Trabalho" },
  { nome: "TRT10",  alias: "api_publica_trt10",  segmento: "Trabalho" },
  { nome: "TRT11",  alias: "api_publica_trt11",  segmento: "Trabalho" },
  { nome: "TRT12",  alias: "api_publica_trt12",  segmento: "Trabalho" },
  { nome: "TRT13",  alias: "api_publica_trt13",  segmento: "Trabalho" },
  { nome: "TRT14",  alias: "api_publica_trt14",  segmento: "Trabalho" },
  { nome: "TRT15",  alias: "api_publica_trt15",  segmento: "Trabalho" },
  { nome: "TRT16",  alias: "api_publica_trt16",  segmento: "Trabalho" },
  { nome: "TRT17",  alias: "api_publica_trt17",  segmento: "Trabalho" },
  { nome: "TRT18",  alias: "api_publica_trt18",  segmento: "Trabalho" },
  { nome: "TRT19",  alias: "api_publica_trt19",  segmento: "Trabalho" },
  { nome: "TRT20",  alias: "api_publica_trt20",  segmento: "Trabalho" },
  { nome: "TRT21",  alias: "api_publica_trt21",  segmento: "Trabalho" },
  { nome: "TRT22",  alias: "api_publica_trt22",  segmento: "Trabalho" },
  { nome: "TRT23",  alias: "api_publica_trt23",  segmento: "Trabalho" },
  { nome: "TRT24",  alias: "api_publica_trt24",  segmento: "Trabalho" },
  // Justiça Eleitoral
  { nome: "TRE-AC", alias: "api_publica_treac",  segmento: "Eleitoral" },
  { nome: "TRE-AL", alias: "api_publica_treal",  segmento: "Eleitoral" },
  { nome: "TRE-AM", alias: "api_publica_tream",  segmento: "Eleitoral" },
  { nome: "TRE-AP", alias: "api_publica_treap",  segmento: "Eleitoral" },
  { nome: "TRE-BA", alias: "api_publica_treba",  segmento: "Eleitoral" },
  { nome: "TRE-CE", alias: "api_publica_trece",  segmento: "Eleitoral" },
  { nome: "TRE-DF", alias: "api_publica_tredf",  segmento: "Eleitoral" },
  { nome: "TRE-ES", alias: "api_publica_trees",  segmento: "Eleitoral" },
  { nome: "TRE-GO", alias: "api_publica_trego",  segmento: "Eleitoral" },
  { nome: "TRE-MA", alias: "api_publica_trema",  segmento: "Eleitoral" },
  { nome: "TRE-MG", alias: "api_publica_tremg",  segmento: "Eleitoral" },
  { nome: "TRE-MS", alias: "api_publica_trems",  segmento: "Eleitoral" },
  { nome: "TRE-MT", alias: "api_publica_tremt",  segmento: "Eleitoral" },
  { nome: "TRE-PA", alias: "api_publica_trepa",  segmento: "Eleitoral" },
  { nome: "TRE-PB", alias: "api_publica_trepb",  segmento: "Eleitoral" },
  { nome: "TRE-PE", alias: "api_publica_trepe",  segmento: "Eleitoral" },
  { nome: "TRE-PI", alias: "api_publica_trepi",  segmento: "Eleitoral" },
  { nome: "TRE-PR", alias: "api_publica_trepr",  segmento: "Eleitoral" },
  { nome: "TRE-RJ", alias: "api_publica_trerj",  segmento: "Eleitoral" },
  { nome: "TRE-RN", alias: "api_publica_trern",  segmento: "Eleitoral" },
  { nome: "TRE-RO", alias: "api_publica_trero",  segmento: "Eleitoral" },
  { nome: "TRE-RR", alias: "api_publica_trerr",  segmento: "Eleitoral" },
  { nome: "TRE-RS", alias: "api_publica_trers",  segmento: "Eleitoral" },
  { nome: "TRE-SC", alias: "api_publica_tresc",  segmento: "Eleitoral" },
  { nome: "TRE-SE", alias: "api_publica_trese",  segmento: "Eleitoral" },
  { nome: "TRE-SP", alias: "api_publica_tresp",  segmento: "Eleitoral" },
  { nome: "TRE-TO", alias: "api_publica_treto",  segmento: "Eleitoral" },
];

// Monta body da query Elasticsearch para buscar por documento
function buildQueryBody(doc: string) {
  return {
    query: {
      bool: {
        should: [
          // Busca por número do processo (caso seja um número de processo)
          { match: { numeroProcesso: doc } },
          // Busca nas partes pelo documento (CPF/CNPJ)
          { nested: {
              path: "partes",
              query: {
                bool: {
                  should: [
                    { match: { "partes.documento": doc } },
                    { wildcard: { "partes.documento": `*${doc}*` } },
                  ],
                },
              },
            },
          },
          // Busca por representante
          { nested: {
              path: "partes.advogados",
              query: { match: { "partes.advogados.nome": doc } },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
    size: 5,
    sort: [{ dataAjuizamento: { order: "desc" } }],
    _source: [
      "numeroProcesso",
      "tribunal",
      "classe.nome",
      "assuntos",
      "dataAjuizamento",
      "grau",
      "orgaoJulgador.nome",
    ],
  };
}

// Consulta um único tribunal com timeout
async function consultarTribunal(
  tribunal: { nome: string; alias: string; segmento: string },
  doc: string,
): Promise<{ processos: Processo[]; total: number } | null> {
  const url = `${BASE}/${tribunal.alias}/_search`;
  const body = buildQueryBody(doc);

  try {
    const data = await fetchJson(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   CNJ_KEY,
        },
        body: JSON.stringify(body),
      },
      8_000, // 8s timeout por tribunal
    );

    if (data.error || !data.hits) return null;

    const total = data.hits?.total?.value ?? 0;
    if (total === 0) return { processos: [], total: 0 };

    const processos: Processo[] = (data.hits?.hits ?? []).map((h: any) => ({
      numeroProcesso:   h._source?.numeroProcesso ?? "—",
      tribunal:         h._source?.tribunal ?? tribunal.nome,
      classe:           h._source?.classe?.nome,
      assunto:          h._source?.assuntos?.[0]?.nome,
      dataAjuizamento:  h._source?.dataAjuizamento?.slice(0, 10),
      orgaoJulgador:    h._source?.orgaoJulgador?.nome,
      grau:             h._source?.grau,
      segmento:         tribunal.segmento,
    }));

    return { processos, total };
  } catch (_) {
    return null; // timeout ou erro — ignora silenciosamente
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ESCAVADOR — Fonte premium de dados de CPF, CNPJ e processos
// Token JWT Bearer — lê do .env ou usa o token fixo de produção
// ══════════════════════════════════════════════════════════════════════════════
// Token principal (pago) — env ESCAVADOR_API_TOKEN
// Token playground (para testes) — env ESCAVADOR_MEC_PLAYGOUND
const ESCAVADOR_TOKEN = process.env.ESCAVADOR_API_TOKEN
  ?? process.env.ESCAVADOR_MEC_PLAYGOUND
  ?? "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiYWU4NjQ4NzczYTdkMzM1ZGM0NzdjYzg1MDUxMDQ5MTY5M2YzN2ZjOTExYzdkMDg2YTU1ZTIwY2E5N2RjODc4ZWQyYWQ2ZDU1YzNiNTJkNDMiLCJpYXQiOjE3NzQ0NTg3OTcuNjc5Njg4LCJuYmYiOjE3NzQ0NTg3OTcuNjc5Njg5LCJleHAiOjIwOTAwNzc5OTcuNjc3OTUxLCJzdWIiOiI3NTI3MDYiLCJzY29wZXMiOlsiYWNlc3Nhcl9hcGlfcGFnYSIsImFjZXNzYXJfYXBpX3BsYXlncm91bmQiXX0.Z2I6sIMD5kTS0BsR1fCYanw-v0JkHXxl01WCjXkOP9nokyq53KwFsC0KhJiC6tuYWA4bkUO4yLqrTfy1nUj1QeODfjfG1_JhBF_tq2vlAtmrrGN5aD7ZAxkylx4zz7D_DJYPtmYgiKZxWgRlSMCCiJ-D5G-dSNX5BSu5bx7yoU1rCqAXY6bO9j5TInT2qUr3EeDiePL9gqu1WggDIKxbdmcwZ-JTg_Hqx4rmLQjMY8f5uo_qQj0gPJtAdCzqZkTb0LundUagUfWnZuSKhk8f-PicKEPTp6qz7x90AL-99fEFgCmdwP8qJn5QIUAdZs2CKGSfy3TeHWOrs4LXOXqDl_u2fCQh3TZfQHDU99CeJvs3KmnqWFz37w7cKUNVU1s4uBOuMxzEQYkq_mUDe_qv_e4q1hjWYRTpwm5OQMsMPZ4CxitGr5QtoywL4A37BW_hod7X36D3b4GX1bXDJxnuhoGzskfr_U8ahACTbj9ezlNFCLb-rI0PUu4rnv2mHRxQpCVH0SbQCDlwf1_ZgR_PHAgNw9ppsHLD-Bgzw6IQ33VM4ZqD0f9nGXMGmCKMSq7CtjYWnvV7DYPoNm-qopDcDXsYOF0f6sQnqhWMX6NiPmP8pK0FKKpVg-X5wVTnyFTP4rWDG1C6t-gJQcgsykEJDnliAxiDOh85RhPUtB6_Tqc";

// Base URL da API v2
const ESCAVADOR_BASE = "https://api.escavador.com/api/v2";

// Headers padrão para todas as requisições Escavador
const escavadorHeaders = () => ({
  Authorization:      `Bearer ${ESCAVADOR_TOKEN}`,
  "Content-Type":     "application/json",
  Accept:             "application/json",
  "X-Requested-With": "XMLHttpRequest",
});

/** Consulta dados de PESSOA FÍSICA (CPF) via Escavador API v2
 *  Endpoints:
 *    GET /api/v2/envolvido/processos?cpf_cnpj={cpf}  — processos do envolvido
 *    GET /api/v2/pessoas-fisicas/busca?cpf={cpf}      — dados cadastrais
 *  Docs: https://api.escavador.com/v2/docs/
 */
async function consultarCPFEscavador(cpf: string): Promise<{
  nome?: string;
  nascimento?: string;
  cpf?: string;
  emails?: string[];
  telefones?: string[];
  enderecos?: string[];
  processos?: Processo[];
  totalProcessos?: number;
  fonte: string;
} | null> {
  try {
    const cpfNum = cpf.replace(/\D/g, "");

    // Faz as duas requisições em paralelo para melhor performance
    const [procRes, pessoaRes] = await Promise.allSettled([
      // Endpoint 1: processos do envolvido por CPF
      fetchJson(
        `${ESCAVADOR_BASE}/envolvido/processos?cpf_cnpj=${cpfNum}&limit=30&ordem=data_inicio_desc`,
        { headers: escavadorHeaders() },
        15_000,
      ),
      // Endpoint 2: dados cadastrais da pessoa física
      fetchJson(
        `${ESCAVADOR_BASE}/pessoas-fisicas/busca?cpf=${cpfNum}`,
        { headers: escavadorHeaders() },
        10_000,
      ),
    ]);

    // ── Processa processos ──────────────────────────────────────────────────
    let envolvido: any = null;
    let processos: Processo[] = [];
    let totalProcessos: number | undefined;

    if (procRes.status === "fulfilled" && procRes.value) {
      const r   = procRes.value;
      envolvido = r?.envolvido ?? r?.data?.envolvido ?? null;
      const itens = r?.itens ?? r?.data?.itens ?? r?.items ?? [];
      totalProcessos = r?.quantidade_processos ?? r?.total ?? itens.length;

      processos = itens.map((p: any) => ({
        numeroProcesso:     p.numero_cnj          ?? p.numero              ?? "—",
        tribunal:           p.fontes?.[0]?.tribunal?.sigla
                         ?? p.tribunal?.sigla      ?? p.tribunal           ?? "—",
        classe:             p.fontes?.[0]?.classe?.nome
                         ?? p.classe?.nome         ?? p.classe             ?? undefined,
        assunto:            p.fontes?.[0]?.assuntos?.[0]?.nome
                         ?? p.assuntos?.[0]?.nome  ?? undefined,
        dataAjuizamento:    p.data_inicio          ?? p.data_ajuizamento   ?? undefined,
        orgaoJulgador:      p.fontes?.[0]?.orgao_julgador?.nome            ?? undefined,
        grau:               p.fontes?.[0]?.grau    ?? p.grau               ?? undefined,
        segmento:           p.fontes?.[0]?.tribunal?.tipo                   ?? undefined,
        ultimaMovimentacao: p.data_ultima_movimentacao                      ?? undefined,
        ativo:              p.ativo ?? undefined,
        valor_causa:        p.fontes?.[0]?.valor_causa ?? undefined,
      }));
    }

    // ── Processa dados cadastrais ───────────────────────────────────────────
    let nome:      string | undefined = envolvido?.nome;
    let nascimento: string | undefined = envolvido?.data_nascimento;
    let emails:    string[] = [];
    let telefones: string[] = [];
    let enderecos: string[] = [];

    if (pessoaRes.status === "fulfilled" && pessoaRes.value) {
      const p = pessoaRes.value?.items?.[0]
             ?? pessoaRes.value?.data?.[0]
             ?? pessoaRes.value?.itens?.[0]
             ?? null;
      if (p) {
        nome      = nome      || p.nome            || p.razao_social;
        nascimento = nascimento || p.data_nascimento || p.nascimento;
        emails    = (p.emails    || p.contatos?.emails    || []).map((e: any) => e.email    ?? e);
        telefones = (p.telefones || p.contatos?.telefones || []).map((t: any) => t.telefone ?? t.numero ?? t);
        enderecos = (p.enderecos || []).map((e: any) =>
          [e.logradouro, e.numero, e.complemento, e.bairro, e.municipio, e.uf]
            .filter(Boolean).join(", ")
        );
      }
    }

    log.info("escavador-cpf", `OK — ${processos.length} processos`, {
      cpf: cpfNum, nome, totalProcessos,
    });

    return {
      nome,
      nascimento,
      cpf:      cpfNum,
      emails:   emails.length   > 0 ? emails   : undefined,
      telefones: telefones.length > 0 ? telefones : undefined,
      enderecos: enderecos.length > 0 ? enderecos : undefined,
      processos,
      totalProcessos,
      fonte: "Escavador",
    };
  } catch (e: any) {
    log.warn("escavador-cpf", `Falhou: ${e.message}`);
    return null;
  }
}

/** Consulta dados de CNPJ via Escavador API v2 (complementa ReceitaWS)
 *  Endpoint principal: GET /api/v2/envolvido/processos?cpf_cnpj={cnpj}
 *  Endpoint sócios:    GET /api/v2/pessoas-juridicas/busca?cnpj={cnpj}
 *  Docs: https://api.escavador.com/v2/docs/#processos-de-envolvidos-por-nome-ou-cpfcnpj
 */
async function consultarCNPJEscavador(cnpj: string): Promise<{
  socios?: { nome: string; qualificacao: string }[];
  processos?: Processo[];
  totalProcessos?: number;
  fonte: string;
} | null> {
  try {
    const cnpjNum = cnpj.replace(/\D/g, "");

    // v2: endpoint unificado por CNPJ — retorna processos e envolvido
    const [procRes, empresaRes] = await Promise.allSettled([
      fetchJson(
        `${ESCAVADOR_BASE}/envolvido/processos?cpf_cnpj=${cnpjNum}&limit=20`,
        {
          headers: escavadorHeaders(),
        },
        15_000,
      ),
      fetchJson(
        `${ESCAVADOR_BASE}/pessoas-juridicas/busca?cnpj=${cnpjNum}&limit=1`,
        {
          headers: escavadorHeaders(),
        },
        15_000,
      ),
    ]);

    // Processa processos
    let processos: Processo[] = [];
    if (procRes.status === "fulfilled" && procRes.value) {
      const itens = procRes.value?.itens ?? procRes.value?.items ?? procRes.value?.data?.itens ?? [];
      processos = itens.map((p: any) => ({
        numeroProcesso:     p.numero_cnj     ?? p.numero        ?? "—",
        tribunal:           p.fontes?.[0]?.tribunal?.sigla
                         ?? p.tribunal?.sigla ?? p.tribunal     ?? "—",
        classe:             p.fontes?.[0]?.classe?.nome
                         ?? p.classe?.nome   ?? p.classe        ?? undefined,
        assunto:            p.fontes?.[0]?.assuntos?.[0]?.nome
                         ?? p.assuntos?.[0]?.nome               ?? undefined,
        dataAjuizamento:    p.data_inicio    ?? p.data_ajuizamento ?? undefined,
        orgaoJulgador:      p.fontes?.[0]?.orgao_julgador?.nome ?? undefined,
        grau:               p.fontes?.[0]?.grau ?? p.grau       ?? undefined,
        segmento:           p.fontes?.[0]?.tribunal?.tipo       ?? undefined,
        ultimaMovimentacao: p.data_ultima_movimentacao          ?? undefined,
      }));
    }

    // Processa sócios
    let socios: { nome: string; qualificacao: string }[] = [];
    if (empresaRes.status === "fulfilled" && empresaRes.value) {
      const empresa = empresaRes.value?.items?.[0]
                   ?? empresaRes.value?.data?.[0]
                   ?? empresaRes.value?.itens?.[0]
                   ?? null;
      if (empresa) {
        socios = (empresa.socios ?? empresa.quadro_societario ?? []).map((s: any) => ({
          nome:         s.nome ?? s.razao_social ?? "—",
          qualificacao: s.qualificacao ?? s.cargo ?? "—",
        }));
      }
    }

    log.info("escavador-cnpj", `OK — ${processos.length} processos, ${socios.length} sócios`, {
      cnpj: cnpjNum,
    });

    return {
      socios,
      processos,
      totalProcessos: procRes.status === "fulfilled"
        ? (procRes.value?.quantidade_processos ?? procRes.value?.total ?? processos.length)
        : processos.length,
      fonte: "Escavador",
    };
  } catch (e: any) {
    log.warn("escavador-cnpj", `Falhou: ${e.message}`);
    return null;
  }
}

/** Consulta processo por número CNJ via Escavador API v2
 *  Endpoint: GET /api/v2/processos/numero_cnj/{numero}
 *  Docs: https://api.escavador.com/v2/docs/#processo-por-numerao-cnj
 */
export async function consultarProcessoPorCNJ(numeroCNJ: string): Promise<{
  processo: any;
  movimentacoes: any[];
  fonte: string;
} | null> {
  try {
    const cnj = numeroCNJ.replace(/[^0-9.-]/g, "").trim();

    const [procRes, movRes] = await Promise.allSettled([
      fetchJson(
        `${ESCAVADOR_BASE}/processos/numero_cnj/${encodeURIComponent(cnj)}`,
        {
          headers: escavadorHeaders(),
        },
        15_000,
      ),
      fetchJson(
        `${ESCAVADOR_BASE}/processos/numero_cnj/${encodeURIComponent(cnj)}/movimentacoes?limit=10`,
        {
          headers: escavadorHeaders(),
        },
        15_000,
      ),
    ]);

    const processo     = procRes.status === "fulfilled" ? procRes.value : null;
    const movimentacoes = movRes.status  === "fulfilled"
      ? (movRes.value?.itens ?? movRes.value?.items ?? [])
      : [];

    if (!processo) return null;

    log.info("escavador-cnj", `Processo encontrado`, { cnj, movimentacoes: movimentacoes.length });

    return { processo, movimentacoes, fonte: "Escavador" };
  } catch (e: any) {
    log.warn("escavador-cnj", `Falhou: ${e.message}`);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// BUSCA PARALELA em todos os tribunais
// ══════════════════════════════════════════════════════════════════════════════
export async function consultarProcessos(doc: string): Promise<{
  processos: Processo[];
  total:     number;
  tribunaisOk: string[];
}> {
  const num = doc.replace(/\D/g, "");

  log.info("consulta", `Buscando processos em ${ALL_TRIBUNAIS.length} tribunais (paralelo)`, { doc: num });

  // Dispara TODAS as consultas em paralelo
  const results = await Promise.allSettled(
    ALL_TRIBUNAIS.map(t => consultarTribunal(t, num)),
  );

  const todosProcessos: Processo[] = [];
  const tribunaisOk: string[] = [];
  let totalGeral = 0;

  results.forEach((result, idx) => {
    if (result.status === "fulfilled" && result.value !== null) {
      const { processos, total } = result.value;
      if (total > 0) {
        todosProcessos.push(...processos);
        totalGeral += total;
        tribunaisOk.push(ALL_TRIBUNAIS[idx].nome);
      }
    }
  });

  // Ordena por data mais recente
  todosProcessos.sort((a, b) => {
    const dA = a.dataAjuizamento ?? "";
    const dB = b.dataAjuizamento ?? "";
    return dB.localeCompare(dA);
  });

  // Limita a 20 processos exibidos (mas totalGeral é o real)
  const processosExibidos = todosProcessos.slice(0, 20);

  log.info("consulta", `Processos encontrados: ${totalGeral} em ${tribunaisOk.length} tribunais`, {
    doc: num,
    tribunais: tribunaisOk,
  });

  return {
    processos:    processosExibidos,
    total:        totalGeral,
    tribunaisOk,
  };
}


// ══════════════════════════════════════════════════════════════════════════════
// CGU — CEIS (Cadastro de Empresas Inidôneas e Suspensas)
// Endpoint: https://api.portaldatransparencia.gov.br/api-de-dados/ceis
// ══════════════════════════════════════════════════════════════════════════════
export async function consultarCEIS(cnpj: string): Promise<SancaoCGU[]> {
  const doc = cnpj.replace(/\D/g, "");
  const apiKey = process.env.CGU_API_KEY ?? "";
  if (!apiKey) {
    log.warn("consulta", "CGU_API_KEY não definida — CEIS ignorado");
    return [];
  }
  try {
    const url = `https://api.portaldatransparencia.gov.br/api-de-dados/ceis?cnpjSancionado=${doc}&pagina=1`;
    const data = await fetchJson(url, {
      headers: {
        "chave-api-dados": apiKey,
        "Accept": "application/json",
      },
    }, 15_000);
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      id:                     item.id,
      nomeInformadoPeloOrgao: item.nomeInformadoPeloOrgao,
      cnpj:                   item.cnpjSancionado,
      numero:                 item.numero,
      tipoSancao:             item.tipoSancao?.descricaoResumida,
      dataInicioSancao:       item.dataInicioSancao,
      dataFinalSancao:        item.dataFinalSancao,
      dataPublicacao:         item.dataPublicacaoDou,
      orgaoSancionador:       item.orgaoSancionador?.nome,
      ufOrgaoSancionador:     item.orgaoSancionador?.uf,
      codigoSancao:           item.codigoSancao,
      valorMulta:             item.valorMulta,
      fundamentacaoLegal:     item.fundamentacaoLegal,
      fonte:                  "CEIS" as const,
    }));
  } catch (err) {
    log.warn("consulta", "Falha ao consultar CEIS", { cnpj: doc, err });
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CGU — CNEP (Cadastro Nacional de Empresas Punidas)
// Endpoint: https://api.portaldatransparencia.gov.br/api-de-dados/cnep
// ══════════════════════════════════════════════════════════════════════════════
export async function consultarCNEP(cnpj: string): Promise<SancaoCGU[]> {
  const doc = cnpj.replace(/\D/g, "");
  const apiKey = process.env.CGU_API_KEY ?? "";
  if (!apiKey) {
    log.warn("consulta", "CGU_API_KEY não definida — CNEP ignorado");
    return [];
  }
  try {
    const url = `https://api.portaldatransparencia.gov.br/api-de-dados/cnep?cnpjSancionado=${doc}&pagina=1`;
    const data = await fetchJson(url, {
      headers: {
        "chave-api-dados": apiKey,
        "Accept": "application/json",
      },
    }, 15_000);
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      id:                     item.id,
      nomeInformadoPeloOrgao: item.nomeInformadoPeloOrgao,
      cnpj:                   item.cnpjSancionado,
      numero:                 item.numero,
      tipoSancao:             item.tipoSancao?.descricaoResumida,
      dataInicioSancao:       item.dataInicioSancao,
      dataFinalSancao:        item.dataFinalSancao,
      dataPublicacao:         item.dataPublicacaoDou,
      orgaoSancionador:       item.orgaoSancionador?.nome,
      ufOrgaoSancionador:     item.orgaoSancionador?.uf,
      codigoSancao:           item.codigoSancao,
      valorMulta:             item.valorMulta,
      fundamentacaoLegal:     item.fundamentacaoLegal,
      descricao:              item.descricaoSancao,
      fonte:                  "CNEP" as const,
    }));
  } catch (err) {
    log.warn("consulta", "Falha ao consultar CNEP", { cnpj: doc, err });
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// BrasilAPI — Simples Nacional
// Endpoint: https://brasilapi.com.br/api/simples/v1/{cnpj}
// ══════════════════════════════════════════════════════════════════════════════
export async function consultarSimples(cnpj: string): Promise<SimplesNacional | null> {
  const doc = cnpj.replace(/\D/g, "");
  try {
    const url = `https://brasilapi.com.br/api/simples/v1/${doc}`;
    const data = await fetchJson(url, {}, 10_000);
    return {
      cnpj: doc,
      simples: data.simples
        ? {
            optante:            data.simples.optante ?? false,
            dataOpcao:          data.simples.data_opcao,
            dataExclusao:       data.simples.data_exclusao,
            ultimaAtualizacao:  data.simples.ultima_atualizacao,
          }
        : { optante: false },
      simei: data.simei
        ? {
            optante:            data.simei.optante ?? false,
            dataOpcao:          data.simei.data_opcao,
            dataExclusao:       data.simei.data_exclusao,
            ultimaAtualizacao:  data.simei.ultima_atualizacao,
          }
        : { optante: false },
    };
  } catch (err) {
    log.warn("consulta", "Falha ao consultar Simples Nacional", { cnpj: doc, err });
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Função principal — orquestra tudo
// ══════════════════════════════════════════════════════════════════════════════
export async function executarConsulta(
  documentoOrOpts: string | { documento: string; tipo: "cpf" | "cnpj"; userId?: number },
  tipoArg?: "cpf" | "cnpj",
): Promise<ResultadoConsulta> {
  // Aceita tanto assinatura antiga (string, tipo) quanto objeto { documento, tipo }
  let documento: string;
  let tipo: "cpf" | "cnpj";
  if (typeof documentoOrOpts === "object") {
    documento = documentoOrOpts.documento;
    tipo      = documentoOrOpts.tipo;
  } else {
    documento = documentoOrOpts;
    tipo      = tipoArg!;
  }

  const doc    = documento.replace(/\D/g, "");
  const fontes: string[] = [];

  // 1. Dados cadastrais (só CNPJ — CPF bloqueado por LGPD)
  let cnpj: DadosCNPJ | undefined;
  let sancoesCEIS: SancaoCGU[]        = [];
  let sancoesCNEP: SancaoCGU[]        = [];
  let simplesNacional: SimplesNacional | null = null;
  // Escavador extras
  let escavadorNome:           string | undefined;
  let escavadorNascimento:     string | undefined;
  let escavadorCPF:            string | undefined;
  let escavadorEmails:         string[] | undefined;
  let escavadorTelefones:      string[] | undefined;
  let escavadorEnderecos:      string[] | undefined;
  let escavadorTotalProcessos: number  | undefined;
  let escavadorSocios:         { nome: string; qualificacao: string }[] | undefined;
  let escavadorProcessos:      Processo[] | undefined;

  if (tipo === "cnpj") {
    // Executa CNPJ cadastral + CEIS + CNEP + Simples + Escavador em paralelo
    const [cnpjResult, ceisResult, cnepResult, simplesResult, escavadorResult] = await Promise.allSettled([
      consultarCNPJ(doc),
      consultarCEIS(doc),
      consultarCNEP(doc),
      consultarSimples(doc),
      consultarCNPJEscavador(doc),
    ]);

    if (cnpjResult.status === "fulfilled" && cnpjResult.value) {
      cnpj = cnpjResult.value;
      fontes.push(cnpjResult.value.fonte);
    }
    if (ceisResult.status === "fulfilled") {
      sancoesCEIS = ceisResult.value;
      if (sancoesCEIS.length > 0) fontes.push(`CEIS (${sancoesCEIS.length} sanção(ões))`);
    }
    if (cnepResult.status === "fulfilled") {
      sancoesCNEP = cnepResult.value;
      if (sancoesCNEP.length > 0) fontes.push(`CNEP (${sancoesCNEP.length} sanção(ões))`);
    }
    if (simplesResult.status === "fulfilled") {
      simplesNacional = simplesResult.value;
      if (simplesNacional) fontes.push("Simples Nacional (BrasilAPI)");
    }

    // Escavador — sócios e processos adicionais
    if (escavadorResult.status === "fulfilled" && escavadorResult.value) {
      const esc = escavadorResult.value;
      if (esc.socios && esc.socios.length > 0) {
        // Enriquece o QSA do CNPJ com dados do Escavador se estiver vazio
        if (cnpj && (!cnpj.qsa || cnpj.qsa.length === 0)) {
          cnpj = { ...cnpj, qsa: esc.socios };
        }
      }
      if (esc.processos && esc.processos.length > 0) {
        escavadorProcessos      = esc.processos;
        escavadorTotalProcessos = esc.totalProcessos;
        fontes.push(`Escavador (${esc.processos.length} processo(s))`);
      } else {
        fontes.push("Escavador ✓");
      }
    }
  }

  // 1b. CPF — dados via Escavador (LGPD: apenas processos e dados públicos)
  if (tipo === "cpf") {
    const escCpf = await consultarCPFEscavador(doc);
    if (escCpf) {
      escavadorNome           = escCpf.nome;
      escavadorNascimento     = escCpf.nascimento;
      escavadorCPF            = escCpf.cpf;
      escavadorEmails         = escCpf.emails;
      escavadorTelefones      = escCpf.telefones;
      escavadorEnderecos      = escCpf.enderecos;
      escavadorTotalProcessos = escCpf.totalProcessos;
      escavadorProcessos      = escCpf.processos;
      fontes.push(`Escavador${escCpf.processos?.length ? ` (${escCpf.processos.length} processo(s))` : " ✓"}`);
    }
  }

  // 2. Processos judiciais — PARALELO em todos os tribunais
  const { processos, total, tribunaisOk } = await consultarProcessos(doc);
  if (total > 0) {
    fontes.push(`CNJ Datajud (${tribunaisOk.join(", ")})`);
  } else {
    fontes.push("CNJ Datajud — sem ocorrências");
  }

  return {
    documento,
    tipo,
    cnpj,
    processos,
    totalProcessos: total,
    fontes,
    tribunaisOk,
    fonteUsada: cnpj?.fonte,
    sancoesCEIS,
    sancoesCNEP,
    simplesNacional,
    escavadorNome,
    escavadorNascimento,
    escavadorCPF,
    escavadorEmails,
    escavadorTelefones,
    escavadorEnderecos,
    escavadorTotalProcessos,
    escavadorSocios,
    escavadorProcessos,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BUSCA UNIFICADA ESCAVADOR — CPF / CNPJ / Nome
// Detecta automaticamente o tipo, chama o endpoint correto e retorna
// resposta normalizada para o frontend.
// ─────────────────────────────────────────────────────────────────────────────

export interface EscavadorSearchResult {
  mode:    "cpf" | "cnpj" | "nome";
  success: boolean;
  // CPF / CNPJ
  nome?:             string;
  documento?:        string;
  tipo_pessoa?:      "FISICA" | "JURIDICA";
  quantidade_processos?: number;
  participacoes?:    EscavadorParticipacao[];
  emails?:           string[];
  telefones?:        string[];
  enderecos?:        string[];
  nascimento?:       string;
  socios?:           { nome: string; qualificacao: string }[];
  // Busca por nome
  resultados?:       EscavadorNomeResultado[];
  // Erros / meta
  error?:  string;
  fonte:   string;
}

export interface EscavadorParticipacao {
  tipo:      string;
  polo:      string;
  tribunal:  string;
  grau?:     string;
  numero?:   string;
  assunto?:  string;
  data?:     string;
  ativo?:    boolean;
}

export interface EscavadorNomeResultado {
  id?:                   number;
  nome:                  string;
  tipo_pessoa:           "FISICA" | "JURIDICA";
  documento?:            string;
  quantidade_processos:  number;
  url_escavador?:        string;
}

export async function consultarEscavadorUnificado(
  query: string,
  _userId?: number,
): Promise<EscavadorSearchResult> {
  const digits = query.replace(/\D/g, "");
  const mode   = digits.length === 11 ? "cpf"
               : digits.length === 14 ? "cnpj"
               : "nome";

  const headers = escavadorHeaders();

  // ── Rate limit básico por sessão ──────────────────────────────────────────
  // O plano playground tem limite de requisições. Logamos para monitorar.
  log.info("escavador-unified", `Consulta ${mode.toUpperCase()}`, {
    query: mode !== "nome" ? digits.slice(0, 4) + "***" : query.slice(0, 20),
  });

  try {
    // ── MODO CPF ─────────────────────────────────────────────────────────────
    if (mode === "cpf") {
      const [procRes, pessoaRes] = await Promise.allSettled([
        fetchJson(
          `${ESCAVADOR_BASE}/envolvido/processos?cpf_cnpj=${digits}&limit=30&ordem=data_inicio_desc`,
          { headers }, 15_000,
        ),
        fetchJson(
          `${ESCAVADOR_BASE}/pessoas-fisicas/busca?cpf=${digits}`,
          { headers }, 10_000,
        ),
      ]);

      let nome: string | undefined;
      let nascimento: string | undefined;
      let emails: string[] = [];
      let telefones: string[] = [];
      let enderecos: string[] = [];
      let participacoes: EscavadorParticipacao[] = [];
      let total = 0;

      if (procRes.status === "fulfilled" && procRes.value) {
        const r       = procRes.value;
        const env     = r?.envolvido ?? r?.data?.envolvido ?? null;
        nome          = env?.nome;
        nascimento    = env?.data_nascimento;
        total         = r?.quantidade_processos ?? r?.total ?? 0;
        const itens   = r?.itens ?? r?.data?.itens ?? r?.items ?? [];
        participacoes = itens.slice(0, 30).map((p: any) => ({
          tipo:     p.tipo_participacao ?? p.tipo ?? "ENVOLVIDO",
          polo:     p.polo_processual   ?? p.polo ?? "—",
          tribunal: p.fontes?.[0]?.tribunal?.sigla ?? p.tribunal?.sigla ?? p.tribunal ?? "—",
          grau:     p.fontes?.[0]?.grau ?? p.grau ?? undefined,
          numero:   p.numero_cnj        ?? p.numero ?? undefined,
          assunto:  p.fontes?.[0]?.assuntos?.[0]?.nome ?? p.assuntos?.[0]?.nome ?? undefined,
          data:     p.data_inicio       ?? p.data_ajuizamento ?? undefined,
          ativo:    p.ativo             ?? undefined,
        }));
      }

      if (pessoaRes.status === "fulfilled" && pessoaRes.value) {
        const p = pessoaRes.value?.items?.[0]
               ?? pessoaRes.value?.data?.[0]
               ?? pessoaRes.value?.itens?.[0]
               ?? null;
        if (p) {
          nome       = nome || p.nome || p.razao_social;
          nascimento = nascimento || p.data_nascimento;
          emails     = (p.emails    || p.contatos?.emails    || []).map((e: any) => e.email    ?? e).filter(Boolean);
          telefones  = (p.telefones || p.contatos?.telefones || []).map((t: any) => t.telefone ?? t.numero ?? t).filter(Boolean);
          enderecos  = (p.enderecos || []).map((e: any) =>
            [e.logradouro, e.numero, e.bairro, e.municipio, e.uf].filter(Boolean).join(", ")
          ).filter(Boolean);
        }
      }

      return {
        mode, success: true, fonte: "Escavador",
        nome, documento: digits, tipo_pessoa: "FISICA",
        quantidade_processos: total || participacoes.length,
        participacoes, nascimento,
        emails:   emails.length   ? emails   : undefined,
        telefones: telefones.length ? telefones : undefined,
        enderecos: enderecos.length ? enderecos : undefined,
      };
    }

    // ── MODO CNPJ ────────────────────────────────────────────────────────────
    if (mode === "cnpj") {
      const [procRes, empresaRes] = await Promise.allSettled([
        fetchJson(
          `${ESCAVADOR_BASE}/envolvido/processos?cpf_cnpj=${digits}&limit=30&ordem=data_inicio_desc`,
          { headers }, 15_000,
        ),
        fetchJson(
          `${ESCAVADOR_BASE}/pessoas-juridicas/busca?cnpj=${digits}&limit=1`,
          { headers }, 10_000,
        ),
      ]);

      let nome: string | undefined;
      let participacoes: EscavadorParticipacao[] = [];
      let socios: { nome: string; qualificacao: string }[] = [];
      let total = 0;

      if (procRes.status === "fulfilled" && procRes.value) {
        const r     = procRes.value;
        const env   = r?.envolvido ?? r?.data?.envolvido ?? null;
        nome        = env?.nome;
        total       = r?.quantidade_processos ?? r?.total ?? 0;
        const itens = r?.itens ?? r?.data?.itens ?? r?.items ?? [];
        participacoes = itens.slice(0, 30).map((p: any) => ({
          tipo:     p.tipo_participacao ?? p.tipo ?? "ENVOLVIDO",
          polo:     p.polo_processual   ?? p.polo ?? "—",
          tribunal: p.fontes?.[0]?.tribunal?.sigla ?? p.tribunal?.sigla ?? p.tribunal ?? "—",
          grau:     p.fontes?.[0]?.grau ?? p.grau ?? undefined,
          numero:   p.numero_cnj        ?? p.numero ?? undefined,
          assunto:  p.fontes?.[0]?.assuntos?.[0]?.nome ?? p.assuntos?.[0]?.nome ?? undefined,
          data:     p.data_inicio       ?? p.data_ajuizamento ?? undefined,
          ativo:    p.ativo             ?? undefined,
        }));
      }

      if (empresaRes.status === "fulfilled" && empresaRes.value) {
        const emp = empresaRes.value?.items?.[0]
                 ?? empresaRes.value?.data?.[0]
                 ?? empresaRes.value?.itens?.[0]
                 ?? null;
        if (emp) {
          nome   = nome || emp.nome || emp.razao_social;
          socios = (emp.socios ?? emp.quadro_societario ?? []).map((s: any) => ({
            nome:         s.nome ?? s.razao_social ?? "—",
            qualificacao: s.qualificacao ?? s.cargo ?? "—",
          }));
        }
      }

      return {
        mode, success: true, fonte: "Escavador",
        nome, documento: digits, tipo_pessoa: "JURIDICA",
        quantidade_processos: total || participacoes.length,
        participacoes,
        socios: socios.length ? socios : undefined,
      };
    }

    // ── MODO NOME ────────────────────────────────────────────────────────────
    const nomeLimpo = query.trim();
    const res = await fetchJson(
      `${ESCAVADOR_BASE}/pessoas-fisicas/busca?nome=${encodeURIComponent(nomeLimpo)}&limit=10`,
      { headers }, 15_000,
    );

    // Tenta também pessoas jurídicas
    const resJur = await fetchJson(
      `${ESCAVADOR_BASE}/pessoas-juridicas/busca?nome=${encodeURIComponent(nomeLimpo)}&limit=5`,
      { headers }, 10_000,
    ).catch(() => null);

    const fisicas: EscavadorNomeResultado[] = (res?.items ?? res?.data ?? res?.itens ?? [])
      .map((p: any) => ({
        id:                   p.id,
        nome:                 p.nome ?? p.razao_social ?? "—",
        tipo_pessoa:          "FISICA" as const,
        documento:            p.cpf ? p.cpf.replace(/\d(?=\d{4})/g, "*") : undefined,
        quantidade_processos: p.quantidade_processos ?? 0,
        url_escavador:        p.url_escavador,
      }));

    const juridicas: EscavadorNomeResultado[] = (resJur?.items ?? resJur?.data ?? resJur?.itens ?? [])
      .map((p: any) => ({
        id:                   p.id,
        nome:                 p.nome ?? p.razao_social ?? "—",
        tipo_pessoa:          "JURIDICA" as const,
        documento:            p.cnpj ? p.cnpj.replace(/\d(?=\d{6})/g, "*") : undefined,
        quantidade_processos: p.quantidade_processos ?? 0,
        url_escavador:        p.url_escavador,
      }));

    const resultados = [...fisicas, ...juridicas]
      .sort((a, b) => b.quantidade_processos - a.quantidade_processos);

    return {
      mode, success: true, fonte: "Escavador",
      resultados: resultados.length ? resultados : [],
    };

  } catch (e: any) {
    const msg = e?.message ?? "Erro desconhecido";
    const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("rate") || msg.includes("quota");
    log.warn("escavador-unified", `Falha ${mode}`, { message: msg });
    return {
      mode, success: false, fonte: "Escavador",
      error: isRateLimit
        ? "Limite de requisições atingido. Aguarde alguns minutos."
        : `Erro ao consultar Escavador: ${msg.slice(0, 120)}`,
    };
  }
}
