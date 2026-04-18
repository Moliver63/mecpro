import { useState } from "react";

// ── Tipos ──────────────────────────────────────────────────────────────────
interface DadosCNPJ {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  situacao_cadastral: string;
  data_situacao_cadastral?: string;
  natureza_juridica?: string;
  porte?: string;
  capital_social?: number;
  data_inicio_atividade?: string;
  email?: string;
  telefone?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  cnae_fiscal_descricao?: string;
  qsa?: { nome_socio: string; qualificacao_socio: string }[];
}

interface Processo {
  numeroProcesso: string;
  tribunal: string;
  classe?: string;
  assunto?: string;
  dataAjuizamento?: string;
  grau?: string;
  orgaoJulgador?: string;
}

interface ResultadoConsulta {
  tipo: "cpf" | "cnpj";
  documento: string;
  cnpj?: DadosCNPJ;
  processos?: Processo[];
  totalProcessos?: number;
  erro?: string;
  fonte: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatDoc(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length <= 11)
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function detectTipo(doc: string): "cpf" | "cnpj" | null {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return "cpf";
  if (d.length === 14) return "cnpj";
  return null;
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toUpperCase();
  const isAtiva = s?.includes("ATIVA") || s?.includes("ATIVO");
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
      background: isAtiva ? "#dcfce7" : "#fef2f2",
      color: isAtiva ? "#15803d" : "#dc2626",
    }}>
      {status || "—"}
    </span>
  );
}

// ── API calls ──────────────────────────────────────────────────────────────
async function consultarCNPJ(cnpj: string): Promise<DadosCNPJ> {
  const num = cnpj.replace(/\D/g, "");
  const res  = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${num}`);
  if (!res.ok) throw new Error(`CNPJ não encontrado (${res.status})`);
  return res.json();
}

async function consultarProcessosCNJ(doc: string, tipo: "cpf" | "cnpj"): Promise<{ hits: Processo[]; total: number }> {
  const num = doc.replace(/\D/g, "");
  // CNJ Datajud — API pública
  const body = {
    query: {
      bool: {
        should: [
          { match: { "numeroProcesso": num } },
          { wildcard: { "partes.documento": `*${num}*` } },
        ]
      }
    },
    size: 10,
    _source: ["numeroProcesso", "tribunal", "classe.nome", "assuntos", "dataAjuizamento", "grau", "orgaoJulgador.nome"],
  };

  const res = await fetch("https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "ApiKey cDZHYzlZa0JadVREZDJCendFbXNpTU5BZ2syeWVVWHVYRU9IYXZKaTNsRUI=" },
    body: JSON.stringify(body),
  });

  if (!res.ok) return { hits: [], total: 0 };
  const data = await res.json();
  const hits = (data.hits?.hits || []).map((h: any) => ({
    numeroProcesso: h._source?.numeroProcesso || "—",
    tribunal:       h._source?.tribunal || "TJSP",
    classe:         h._source?.classe?.nome,
    assunto:        h._source?.assuntos?.[0]?.nome,
    dataAjuizamento:h._source?.dataAjuizamento?.slice(0, 10),
    grau:           h._source?.grau,
    orgaoJulgador:  h._source?.orgaoJulgador?.nome,
  }));
  return { hits, total: data.hits?.total?.value || 0 };
}

// ── Widget principal ───────────────────────────────────────────────────────
export default function ConsultaWidget() {
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [resultado,  setResultado]  = useState<ResultadoConsulta | null>(null);
  const [erro,       setErro]       = useState("");
  const [tab,        setTab]        = useState<"dados" | "processos">("dados");

  const tipo = detectTipo(input);

  async function handleConsultar() {
    const doc = input.replace(/\D/g, "");
    if (!tipo) { setErro("Digite um CPF (11 dígitos) ou CNPJ (14 dígitos) válido"); return; }
    setErro("");
    setLoading(true);
    setResultado(null);

    try {
      const fontes: string[] = [];
      let cnpjData: DadosCNPJ | undefined;
      let processos: Processo[] = [];
      let totalProcessos = 0;

      // CNPJ — Receita Federal via BrasilAPI
      if (tipo === "cnpj") {
        try {
          cnpjData = await consultarCNPJ(doc);
          fontes.push("Receita Federal (BrasilAPI)");
        } catch (e: any) {
          setErro(e.message);
        }
      }

      // Processos — CNJ Datajud
      try {
        const r = await consultarProcessosCNJ(doc, tipo);
        processos     = r.hits;
        totalProcessos= r.total;
        if (r.total > 0) fontes.push("CNJ Datajud");
      } catch { /* silencia erro de processos */ }

      setResultado({
        tipo,
        documento: formatDoc(input),
        cnpj: cnpjData,
        processos,
        totalProcessos,
        fonte: fontes,
      });
      setTab("dados");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", marginTop: 24 }}>

      {/* Header */}
      <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🔍</div>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--black)" }}>Consulta CPF / CNPJ</h2>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>Dados cadastrais e processos judiciais — fontes públicas gratuitas</p>
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: "18px 24px", borderBottom: resultado ? "1px solid var(--border)" : "none" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              className="input"
              placeholder="Digite CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00)"
              value={input}
              onChange={e => {
                setErro("");
                setInput(formatDoc(e.target.value));
              }}
              onKeyDown={e => e.key === "Enter" && handleConsultar()}
              maxLength={18}
              style={{ width: "100%", paddingRight: tipo ? 90 : 12 }}
            />
            {tipo && (
              <span style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
                background: tipo === "cnpj" ? "#eff6ff" : "#f5f3ff",
                color: tipo === "cnpj" ? "#1e40af" : "#5b21b6",
              }}>
                {tipo.toUpperCase()}
              </span>
            )}
          </div>
          <button
            onClick={handleConsultar}
            disabled={loading || !tipo}
            style={{
              background: "var(--navy)", color: "white", fontWeight: 700, fontSize: 13,
              padding: "10px 20px", borderRadius: 10, border: "none",
              cursor: loading || !tipo ? "not-allowed" : "pointer",
              opacity: loading || !tipo ? 0.6 : 1, whiteSpace: "nowrap",
            }}>
            {loading ? "⏳ Consultando..." : "🔍 Consultar"}
          </button>
        </div>
        {erro && <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8 }}>⚠️ {erro}</p>}
        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
          Fontes: Receita Federal (via BrasilAPI) · CNJ Datajud · Dados públicos conforme LGPD
        </p>
      </div>

      {/* Resultado */}
      {resultado && (
        <div style={{ padding: "0 24px 24px" }}>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 20, paddingTop: 16 }}>
            {(["dados", "processos"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: "8px 8px 0 0",
                  border: "none", cursor: "pointer",
                  background: tab === t ? "var(--navy)" : "transparent",
                  color: tab === t ? "white" : "var(--muted)",
                  borderBottom: tab === t ? "2px solid var(--navy)" : "2px solid transparent",
                }}>
                {t === "dados" ? "📋 Dados Cadastrais" : `⚖️ Processos (${resultado.totalProcessos || 0})`}
              </button>
            ))}
          </div>

          {/* Tab: Dados Cadastrais */}
          {tab === "dados" && (
            <>
              {resultado.tipo === "cpf" && (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#15803d", marginBottom: 4 }}>CPF: {resultado.documento}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>
                    Consulta de CPF via API pública não retorna dados pessoais (LGPD).
                    Verifique processos na aba ao lado.
                  </p>
                </div>
              )}

              {resultado.cnpj && (
                <div style={{ display: "grid", gap: 12 }}>
                  {/* Cabeçalho empresa */}
                  <div style={{ background: "#f8fafc", borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <p style={{ fontSize: 15, fontWeight: 800, color: "var(--black)", marginBottom: 2 }}>
                          {resultado.cnpj.razao_social}
                        </p>
                        {resultado.cnpj.nome_fantasia && (
                          <p style={{ fontSize: 12, color: "var(--muted)" }}>"{resultado.cnpj.nome_fantasia}"</p>
                        )}
                      </div>
                      <StatusBadge status={resultado.cnpj.situacao_cadastral} />
                    </div>
                    <p style={{ fontSize: 12, color: "var(--muted)" }}>CNPJ: {resultado.documento}</p>
                  </div>

                  {/* Grid de informações */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      { label: "Natureza Jurídica", value: resultado.cnpj.natureza_juridica },
                      { label: "Porte",              value: resultado.cnpj.porte },
                      { label: "Capital Social",     value: resultado.cnpj.capital_social ? `R$ ${Number(resultado.cnpj.capital_social).toLocaleString("pt-BR")}` : null },
                      { label: "Abertura",           value: resultado.cnpj.data_inicio_atividade },
                      { label: "CNAE Principal",     value: resultado.cnpj.cnae_fiscal_descricao },
                      { label: "Email",              value: resultado.cnpj.email },
                      { label: "Telefone",           value: resultado.cnpj.telefone },
                      { label: "Endereço",           value: resultado.cnpj.logradouro ? `${resultado.cnpj.logradouro}, ${resultado.cnpj.numero} — ${resultado.cnpj.bairro}, ${resultado.cnpj.municipio}/${resultado.cnpj.uf}` : null },
                    ].filter(i => i.value).map(i => (
                      <div key={i.label} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase" }}>{i.label}</p>
                        <p style={{ fontSize: 12, color: "var(--black)", fontWeight: 600, lineHeight: 1.4 }}>{i.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Quadro societário */}
                  {resultado.cnpj.qsa && resultado.cnpj.qsa.length > 0 && (
                    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ background: "var(--navy)", padding: "10px 14px" }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "white" }}>👥 Quadro Societário</p>
                      </div>
                      {resultado.cnpj.qsa.map((s, i) => (
                        <div key={i} style={{ padding: "10px 14px", borderBottom: i < resultado.cnpj!.qsa!.length - 1 ? "1px solid var(--border)" : "none", display: "flex", justifyContent: "space-between" }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--black)" }}>{s.nome_socio}</p>
                          <p style={{ fontSize: 12, color: "var(--muted)" }}>{s.qualificacao_socio}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Tab: Processos */}
          {tab === "processos" && (
            <>
              {(resultado.totalProcessos || 0) === 0 ? (
                <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>◎</div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--black)", marginBottom: 4 }}>Nenhum processo encontrado</p>
                  <p style={{ fontSize: 12 }}>Consulta realizada no CNJ Datajud (TJSP)</p>
                </div>
              ) : (
                <>
                  <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                    <p style={{ fontSize: 12, color: "#9a3412", fontWeight: 600 }}>
                      ⚠️ {resultado.totalProcessos} processo(s) encontrado(s) — exibindo os 10 mais recentes
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {resultado.processos?.map((p, i) => (
                      <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", fontFamily: "monospace" }}>{p.numeroProcesso}</p>
                          <span style={{ fontSize: 10, fontWeight: 700, background: "#eff6ff", color: "#1e40af", padding: "2px 8px", borderRadius: 5 }}>
                            {p.tribunal}
                          </span>
                        </div>
                        {p.classe    && <p style={{ fontSize: 12, color: "var(--black)", fontWeight: 600, marginBottom: 2 }}>{p.classe}</p>}
                        {p.assunto   && <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Assunto: {p.assunto}</p>}
                        {p.orgaoJulgador && <p style={{ fontSize: 11, color: "var(--muted)" }}>📍 {p.orgaoJulgador}</p>}
                        {p.dataAjuizamento && <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>📅 Ajuizado em {p.dataAjuizamento}</p>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* Rodapé fontes */}
          <div style={{ marginTop: 16, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
            <p style={{ fontSize: 11, color: "var(--muted)" }}>
              📡 Fontes consultadas: {resultado.fonte.join(" · ") || "Nenhuma fonte retornou dados"}
              {" · "}Consulta realizada em {new Date().toLocaleString("pt-BR")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
