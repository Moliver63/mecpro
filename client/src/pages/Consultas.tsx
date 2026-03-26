import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { EscavadorSearch } from "@/components/EscavadorSearch";

// ── Tipos ──────────────────────────────────────────────────────────────────
interface ProcessoCNJ {
  numeroProcesso:   string;
  tribunal:         string;
  classe?:          string;
  assunto?:         string;
  dataAjuizamento?: string;
  orgaoJulgador?:   string;
  grau?:            string;
  segmento?:        string;
}

interface SancaoCGU {
  id?:                     number;
  nomeInformadoPeloOrgao?: string;
  cnpj?:                   string;
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

interface SimplesNacional {
  cnpj:        string;
  simples?:    { optante: boolean; dataOpcao?: string; dataExclusao?: string; };
  simei?:      { optante: boolean; dataOpcao?: string; dataExclusao?: string; };
}

interface ResultadoBusca {
  documento:        string;
  tipo:             "cpf" | "cnpj";
  cnpj?:            any;
  processos:        ProcessoCNJ[];
  totalProcessos:   number;
  fontes:           string[];
  tribunaisOk?:     string[];
  sancoesCEIS?:     SancaoCGU[];
  sancoesCNEP?:     SancaoCGU[];
  simplesNacional?: SimplesNacional | null;
  // Escavador
  escavadorNome?:           string;
  escavadorNascimento?:     string;
  escavadorCPF?:            string;
  escavadorEmails?:         string[];
  escavadorTelefones?:      string[];
  escavadorEnderecos?:      string[];
  escavadorTotalProcessos?: number;
  escavadorSocios?:         { nome: string; qualificacao: string }[];
  escavadorProcessos?:      ProcessoCNJ[];
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

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </p>
      <p style={{ fontSize: 13, color: "var(--black)", fontWeight: 600, lineHeight: 1.4 }}>{value}</p>
    </div>
  );
}

const SEGMENTO_COLOR: Record<string, { bg: string; color: string }> = {
  Superior:  { bg: "#fdf4ff", color: "#7e22ce" },
  Federal:   { bg: "#eff6ff", color: "#1d4ed8" },
  Estadual:  { bg: "#f0fdf4", color: "#15803d" },
  Trabalho:  { bg: "#fff7ed", color: "#c2410c" },
  Eleitoral: { bg: "#fefce8", color: "#a16207" },
  Militar:   { bg: "#f1f5f9", color: "#475569" },
};

// ── Componente principal ───────────────────────────────────────────────────
export default function Consultas() {
  const [, setLocation] = useLocation();
  const [mainTab,   setMainTab]   = useState<"consulta" | "escavador">("consulta");
  const [input,     setInput]     = useState("");
  const [tab,       setTab]       = useState<"dados" | "processos" | "sancoes">("dados");
  const [resultado, setResultado] = useState<ResultadoBusca | null>(null);
  const [erro,      setErro]      = useState("");
  const [loading,   setLoading]   = useState(false);

  const tipo = detectTipo(input);

  const buscar  = trpc.consultas.buscar.useMutation();
  const { data: historico, refetch: refetchHistorico } = trpc.consultas.list.useQuery({ limit: 10 });
  const { data: total } = trpc.consultas.count.useQuery();

  async function handleBuscar() {
    if (!tipo) { setErro("Digite um CPF (11 dígitos) ou CNPJ (14 dígitos) válido"); return; }
    setErro("");
    setLoading(true);
    setResultado(null);
    try {
      const res = await buscar.mutateAsync({ documento: input, tipo });
      setResultado({
        ...res,
        processos:           (res.processos ?? []) as ProcessoCNJ[],
        fontes:              res.fontes ?? [],
        tribunaisOk:         (res as any).tribunaisOk ?? [],
        sancoesCEIS:         (res as any).sancoesCEIS  ?? [],
        sancoesCNEP:         (res as any).sancoesCNEP  ?? [],
        simplesNacional:     (res as any).simplesNacional ?? null,
        escavadorNome:           (res as any).escavadorNome,
        escavadorNascimento:     (res as any).escavadorNascimento,
        escavadorCPF:            (res as any).escavadorCPF,
        escavadorEmails:         (res as any).escavadorEmails,
        escavadorTelefones:      (res as any).escavadorTelefones,
        escavadorEnderecos:      (res as any).escavadorEnderecos,
        escavadorTotalProcessos: (res as any).escavadorTotalProcessos,
        escavadorSocios:         (res as any).escavadorSocios,
        escavadorProcessos:      (res as any).escavadorProcessos,
      });
      setTab("dados");
      refetchHistorico();
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao consultar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function handleHistoricoClick(item: any) {
    setInput(item.documento);
    const cnpj = item.razaoSocial ? {
      razao_social:           item.razaoSocial,
      nome_fantasia:          item.nomeFantasia,
      situacao_cadastral:     item.situacao,
      porte:                  item.porte,
      capital_social:         item.capitalSocial,
      data_inicio_atividade:  item.dataAbertura,
      cnae_fiscal_descricao:  item.cnae,
      email:                  item.email,
      telefone:               item.telefone,
      qsa:  item.socios ? JSON.parse(item.socios) : [],
    } : undefined;
    setResultado({
      documento:      item.documento,
      tipo:           item.tipo as "cpf" | "cnpj",
      cnpj,
      processos:      item.processos ? JSON.parse(item.processos) : [],
      totalProcessos: item.totalProcessos ?? 0,
      fontes:         item.fontes ? JSON.parse(item.fontes) : [],
      tribunaisOk:    [],
    });
    setTab("dados");
  }

  const situacaoAtiva = resultado?.cnpj?.situacao_cadastral?.toUpperCase().includes("ATIVA");

  // Agrupar processos por segmento
  const processosPorSegmento = resultado?.processos.reduce((acc, p) => {
    const seg = p.segmento ?? "Estadual";
    if (!acc[seg]) acc[seg] = [];
    acc[seg].push(p);
    return acc;
  }, {} as Record<string, ProcessoCNJ[]>) ?? {};

  return (
    <Layout>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
            Consulta CPF / CNPJ
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted)" }}>
            Dados cadastrais da Receita Federal (4 fontes) + processos judiciais via CNJ Datajud + busca por nome via Escavador
          </p>

          {/* Tabs principais */}
          <div style={{ display: "flex", gap: 4, marginTop: 16, borderBottom: "2px solid var(--border)" }}>
            {[
              { key: "consulta",  label: "🏛️ Receita Federal + CNJ" },
              { key: "escavador", label: "🔍 Escavador — CPF / CNPJ / Nome" },
            ].map(t => (
              <button key={t.key}
                onClick={() => setMainTab(t.key as any)}
                style={{
                  padding: "10px 18px", border: "none", borderRadius: "8px 8px 0 0",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  background: mainTab === t.key ? "var(--navy)" : "transparent",
                  color: mainTab === t.key ? "white" : "var(--muted)",
                  borderBottom: mainTab === t.key ? "2px solid var(--navy)" : "2px solid transparent",
                  marginBottom: -2,
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {mainTab === "escavador" && (
          <div style={{ marginTop: 20 }}>
            <EscavadorSearch />
          </div>
        )}

        {mainTab === "consulta" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>

            {/* ── Coluna principal ── */}
            <div>
              {/* Barra de busca */}
              <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <input
                      className="input"
                      placeholder="Digite CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00)"
                      value={input}
                      onChange={e => { setErro(""); setInput(formatDoc(e.target.value)); }}
                      onKeyDown={e => e.key === "Enter" && handleBuscar()}
                      maxLength={18}
                      style={{ width: "100%", paddingRight: tipo ? 80 : 12, fontSize: 14 }}
                    />
                    {tipo && (
                      <span style={{
                        position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                        fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6,
                        background: tipo === "cnpj" ? "#eff6ff" : "#f5f3ff",
                        color: tipo === "cnpj" ? "#1e40af" : "#5b21b6",
                      }}>
                        {tipo.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleBuscar}
                    disabled={loading || !tipo}
                    style={{
                      background: "var(--navy)", color: "white", fontWeight: 700,
                      fontSize: 13, padding: "10px 22px", borderRadius: 10, border: "none",
                      cursor: loading || !tipo ? "not-allowed" : "pointer",
                      opacity: loading || !tipo ? 0.6 : 1, whiteSpace: "nowrap",
                    }}>
                    {loading ? "⏳ Consultando..." : "🔍 Consultar"}
                  </button>
                </div>
                {erro && (
                  <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    ⚠️ {erro}
                  </p>
                )}

                {/* Loading */}
                {loading && (
                  <div style={{ marginTop: 14, background: "#f8fafc", borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #3b82f6", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
                      <p style={{ fontSize: 13, fontWeight: 700, color: "var(--dark)" }}>
                        Consultando fontes de dados...
                      </p>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {tipo === "cnpj" && (
                        <>
                          {["ReceitaWS", "CNPJ.ws", "BrasilAPI", "MinhaReceita"].map(f => (
                            <span key={f} style={{ fontSize: 11, background: "#eff6ff", color: "#1e40af", padding: "2px 8px", borderRadius: 5, fontWeight: 600 }}>
                              🏛️ {f}
                            </span>
                          ))}
                        </>
                      )}
                      <span style={{ fontSize: 11, background: "#f0fdf4", color: "#15803d", padding: "2px 8px", borderRadius: 5, fontWeight: 600 }}>
                        ⚖️ CNJ — 80+ tribunais em paralelo
                      </span>
                    </div>
                  </div>
                )}

                <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                  Fontes: Receita Federal (4 APIs) · CNJ Datajud (todos os tribunais do Brasil) · Conforme LGPD — dados públicos
                </p>
              </div>

              {/* Resultado */}
              {resultado && (
                <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>

                  {/* Tabs */}
                  <div style={{ display: "flex", borderBottom: "1px solid var(--border)", padding: "0 20px", overflowX: "auto" }}>
                    <button onClick={() => setTab("dados")}
                      style={{
                        fontSize: 13, fontWeight: 700, padding: "14px 16px", whiteSpace: "nowrap",
                        border: "none", background: "transparent", cursor: "pointer",
                        color: tab === "dados" ? "var(--navy)" : "var(--muted)",
                        borderBottom: tab === "dados" ? "2px solid var(--navy)" : "2px solid transparent",
                        marginBottom: -1,
                      }}>
                      📋 Dados Cadastrais
                    </button>
                    <button onClick={() => setTab("processos")}
                      style={{
                        fontSize: 13, fontWeight: 700, padding: "14px 16px", whiteSpace: "nowrap",
                        border: "none", background: "transparent", cursor: "pointer",
                        color: tab === "processos" ? "var(--navy)" : "var(--muted)",
                        borderBottom: tab === "processos" ? "2px solid var(--navy)" : "2px solid transparent",
                        marginBottom: -1,
                      }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        ⚖️ Processos
                        {resultado.totalProcessos > 0 && (
                          <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 5 }}>
                            {resultado.totalProcessos}
                          </span>
                        )}
                      </span>
                    </button>
                    {resultado.tipo === "cnpj" && (
                      <button onClick={() => setTab("sancoes")}
                        style={{
                          fontSize: 13, fontWeight: 700, padding: "14px 16px", whiteSpace: "nowrap",
                          border: "none", background: "transparent", cursor: "pointer",
                          color: tab === "sancoes" ? "#b91c1c" : "var(--muted)",
                          borderBottom: tab === "sancoes" ? "2px solid #b91c1c" : "2px solid transparent",
                          marginBottom: -1,
                        }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          🚨 Restrições e Sanções
                          {((resultado.sancoesCEIS?.length ?? 0) + (resultado.sancoesCNEP?.length ?? 0)) > 0 && (
                            <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 5 }}>
                              {(resultado.sancoesCEIS?.length ?? 0) + (resultado.sancoesCNEP?.length ?? 0)}
                            </span>
                          )}
                        </span>
                      </button>
                    )}
                  </div>

                  <div style={{ padding: 20 }}>

                    {/* TAB: Dados */}
                    {tab === "dados" && (
                      <>
                        {resultado.tipo === "cpf" && (
                          <div style={{ display: "grid", gap: 14 }}>
                            <div style={{ background: "linear-gradient(135deg,#0f172a,#1e3a5f)", borderRadius: 12, padding: 18, color: "white" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>👤</div>
                                <div style={{ flex: 1 }}>
                                  <p style={{ margin: 0, fontWeight: 800, fontSize: 14 }}>
                                    {resultado.escavadorNome ?? "Pessoa Física"}
                                  </p>
                                  <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
                                    CPF: {resultado.documento}
                                  </p>
                                </div>
                                {resultado.escavadorTotalProcessos !== undefined && (
                                  <div style={{ background: resultado.escavadorTotalProcessos > 0 ? "#dc2626" : "#16a34a", borderRadius: 8, padding: "4px 10px", textAlign: "center" }}>
                                    <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "white" }}>{resultado.escavadorTotalProcessos}</p>
                                    <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,.8)" }}>processos</p>
                                  </div>
                                )}
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                {resultado.escavadorNascimento && (
                                  <p style={{ margin: 0, fontSize: 12, color: "#cbd5e1" }}>
                                    📅 <strong style={{ color: "white" }}>{resultado.escavadorNascimento}</strong>
                                  </p>
                                )}
                              </div>
                            </div>

                            {((resultado.escavadorEmails?.length ?? 0) > 0 || (resultado.escavadorTelefones?.length ?? 0) > 0) && (
                              <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                                <div style={{ background: "var(--navy)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                                  <p style={{ fontSize: 12, fontWeight: 700, color: "white", margin: 0 }}>📞 Contatos</p>
                                  <span style={{ fontSize: 10, background: "#22c55e", color: "white", padding: "2px 7px", borderRadius: 8, fontWeight: 700 }}>Escavador</span>
                                </div>
                                <div style={{ padding: "12px 16px", display: "grid", gap: 6 }}>
                                  {resultado.escavadorEmails?.map((e, i) => (
                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <span style={{ fontSize: 13 }}>✉️</span>
                                      <p style={{ margin: 0, fontSize: 13, color: "var(--black)" }}>{e}</p>
                                    </div>
                                  ))}
                                  {resultado.escavadorTelefones?.map((t, i) => (
                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <span style={{ fontSize: 13 }}>📱</span>
                                      <p style={{ margin: 0, fontSize: 13, color: "var(--black)" }}>{t}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {(resultado.escavadorEnderecos?.length ?? 0) > 0 && (
                              <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                                <div style={{ background: "var(--navy)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                                  <p style={{ fontSize: 12, fontWeight: 700, color: "white", margin: 0 }}>📍 Endereços</p>
                                  <span style={{ fontSize: 10, background: "#22c55e", color: "white", padding: "2px 7px", borderRadius: 8, fontWeight: 700 }}>Escavador</span>
                                </div>
                                <div style={{ padding: "12px 16px", display: "grid", gap: 6 }}>
                                  {resultado.escavadorEnderecos?.map((e, i) => (
                                    <p key={i} style={{ margin: 0, fontSize: 13, color: "var(--black)", lineHeight: 1.5 }}>📌 {e}</p>
                                  ))}
                                </div>
                              </div>
                            )}

                            {resultado.escavadorProcessos && resultado.escavadorProcessos.length > 0 && (
                              <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: 14 }}>
                                <p style={{ fontWeight: 700, fontSize: 13, color: "#92400e", marginBottom: 8 }}>
                                  ⚖️ {resultado.escavadorProcessos.length} processo(s) encontrado(s) via Escavador
                                  {resultado.escavadorTotalProcessos && resultado.escavadorTotalProcessos > resultado.escavadorProcessos.length && (
                                    <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 6 }}>
                                      (exibindo {resultado.escavadorProcessos.length} de {resultado.escavadorTotalProcessos} total)
                                    </span>
                                  )}
                                </p>
                                {resultado.escavadorProcessos.slice(0, 5).map((p, i) => (
                                  <div key={i} style={{ fontSize: 12, color: "#78350f", marginBottom: 4, padding: "6px 8px", background: "rgba(255,255,255,.6)", borderRadius: 6 }}>
                                    <strong>{p.numeroProcesso}</strong> — {p.tribunal}
                                    {p.classe && <span style={{ color: "#92400e" }}> · {p.classe}</span>}
                                    {p.dataAjuizamento && <span style={{ color: "#a16207", marginLeft: 6 }}>{p.dataAjuizamento}</span>}
                                  </div>
                                ))}
                              </div>
                            )}

                            <div style={{ background: "#f8fafc", borderRadius: 10, padding: 14 }}>
                              <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
                                🔒 <strong>LGPD:</strong> Dados pessoais de CPF são restritos por lei.
                                Exibidos apenas dados públicos (processos judiciais, contatos públicos) via Escavador e CNJ Datajud.
                              </p>
                            </div>
                          </div>
                        )}

                        {resultado.cnpj && (
                          <div style={{ display: "grid", gap: 14 }}>
                            <div style={{ background: "#f8fafc", borderRadius: 12, padding: 16 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <p style={{ fontSize: 16, fontWeight: 800, color: "var(--black)", marginBottom: 3 }}>
                                    {resultado.cnpj.razao_social}
                                  </p>
                                  {resultado.cnpj.nome_fantasia && (
                                    <p style={{ fontSize: 13, color: "var(--muted)" }}>
                                      "{resultado.cnpj.nome_fantasia}"
                                    </p>
                                  )}
                                </div>
                                <span style={{
                                  fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 8, flexShrink: 0, marginLeft: 12,
                                  background: situacaoAtiva ? "#dcfce7" : "#fef2f2",
                                  color: situacaoAtiva ? "#15803d" : "#dc2626",
                                }}>
                                  {resultado.cnpj.situacao_cadastral}
                                </span>
                              </div>
                              <p style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>
                                CNPJ: {resultado.documento}
                              </p>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                              <InfoRow label="Natureza Jurídica"  value={resultado.cnpj.natureza_juridica} />
                              <InfoRow label="Porte"              value={resultado.cnpj.porte} />
                              <InfoRow label="Capital Social"     value={resultado.cnpj.capital_social ? `R$ ${Number(resultado.cnpj.capital_social).toLocaleString("pt-BR")}` : null} />
                              <InfoRow label="Data de Abertura"   value={resultado.cnpj.data_inicio_atividade} />
                              <InfoRow label="CNAE Principal"     value={resultado.cnpj.cnae_fiscal_descricao} />
                              <InfoRow label="Telefone"           value={resultado.cnpj.telefone} />
                              <InfoRow label="Email"              value={resultado.cnpj.email} />
                            </div>

                            {resultado.cnpj.logradouro && (
                              <InfoRow
                                label="Endereço"
                                value={[resultado.cnpj.logradouro, resultado.cnpj.numero, resultado.cnpj.bairro,
                                        `${resultado.cnpj.municipio}/${resultado.cnpj.uf}`, resultado.cnpj.cep
                                       ].filter(Boolean).join(", ")}
                              />
                            )}

                            {resultado.cnpj.qsa?.length > 0 && (
                              <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                                <div style={{ background: "var(--navy)", padding: "10px 16px" }}>
                                  <p style={{ fontSize: 12, fontWeight: 700, color: "white" }}>👥 Quadro Societário</p>
                                </div>
                                {resultado.cnpj.qsa.map((s: any, i: number) => (
                                  <div key={i} style={{
                                    padding: "12px 16px",
                                    borderBottom: i < resultado.cnpj.qsa.length - 1 ? "1px solid var(--border)" : "none",
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                  }}>
                                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--black)" }}>{s.nome_socio ?? s.nome}</p>
                                    <p style={{ fontSize: 12, color: "var(--muted)" }}>{s.qualificacao_socio ?? s.qualificacao}</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {(!resultado.cnpj?.qsa?.length) && resultado.escavadorSocios && resultado.escavadorSocios.length > 0 && (
                              <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                                <div style={{ background: "var(--navy)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                                  <p style={{ fontSize: 12, fontWeight: 700, color: "white", margin: 0 }}>👥 Quadro Societário</p>
                                  <span style={{ fontSize: 10, background: "#22c55e", color: "white", padding: "2px 7px", borderRadius: 8, fontWeight: 700 }}>Escavador</span>
                                </div>
                                {resultado.escavadorSocios.map((s, i) => (
                                  <div key={i} style={{
                                    padding: "12px 16px",
                                    borderBottom: i < resultado.escavadorSocios!.length - 1 ? "1px solid var(--border)" : "none",
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                  }}>
                                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--black)", margin: 0 }}>{s.nome}</p>
                                    <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>{s.qualificacao}</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {resultado.escavadorProcessos && resultado.escavadorProcessos.length > 0 && (
                              <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: 14 }}>
                                <p style={{ fontWeight: 700, fontSize: 13, color: "#92400e", marginBottom: 8 }}>
                                  ⚖️ {resultado.escavadorProcessos.length} processo(s) adicionais via Escavador
                                </p>
                                {resultado.escavadorProcessos.slice(0, 5).map((p, i) => (
                                  <div key={i} style={{ fontSize: 12, color: "#78350f", marginBottom: 4, padding: "6px 8px", background: "rgba(255,255,255,.6)", borderRadius: 6 }}>
                                    <strong>{p.numeroProcesso}</strong> — {p.tribunal}
                                    {p.classe && <span> · {p.classe}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* TAB: Processos */}
                    {tab === "processos" && (
                      <>
                        {resultado.totalProcessos === 0 ? (
                          <div style={{ textAlign: "center", padding: "40px 20px" }}>
                            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
                            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 6 }}>
                              Nenhum processo encontrado
                            </p>
                            <p style={{ fontSize: 13, color: "var(--muted)" }}>
                              Consulta realizada no CNJ Datajud — todos os tribunais do Brasil
                            </p>
                          </div>
                        ) : (
                          <>
                            <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                              <p style={{ fontSize: 13, color: "#9a3412", fontWeight: 700, marginBottom: 4 }}>
                                ⚠️ {resultado.totalProcessos} processo(s) encontrado(s) em todo o Brasil
                              </p>
                              {resultado.tribunaisOk && resultado.tribunaisOk.length > 0 && (
                                <p style={{ fontSize: 12, color: "#9a3412" }}>
                                  Tribunais com ocorrências: {resultado.tribunaisOk.join(", ")}
                                </p>
                              )}
                              <p style={{ fontSize: 11, color: "#c2410c", marginTop: 4 }}>
                                Exibindo os {resultado.processos.length} mais recentes
                              </p>
                            </div>

                            {(Object.entries(processosPorSegmento) as [string, any[]][]).map(([segmento, procs]) => {
                              const colors = SEGMENTO_COLOR[segmento] ?? { bg: "#f8fafc", color: "#475569" };
                              return (
                                <div key={segmento} style={{ marginBottom: 20 }}>
                                  <div style={{
                                    background: colors.bg,
                                    border: `1px solid ${colors.color}22`,
                                    borderRadius: 8,
                                    padding: "6px 12px",
                                    marginBottom: 10,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: colors.color }}>
                                      ⚖️ Justiça {segmento}
                                    </span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: colors.color, opacity: 0.7 }}>
                                      {procs.length} processo(s)
                                    </span>
                                  </div>

                                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    {procs.map((p, i) => (
                                      <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                                          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", fontFamily: "monospace", wordBreak: "break-all" }}>
                                            {p.numeroProcesso}
                                          </p>
                                          <span style={{
                                            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
                                            flexShrink: 0, marginLeft: 8,
                                            background: colors.bg, color: colors.color,
                                          }}>
                                            {p.tribunal}
                                          </span>
                                        </div>
                                        {p.classe  && <p style={{ fontSize: 13, fontWeight: 600, color: "var(--black)", marginBottom: 2 }}>{p.classe}</p>}
                                        {p.assunto && <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Assunto: {p.assunto}</p>}
                                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                                          {p.grau           && <p style={{ fontSize: 11, color: "var(--muted)" }}>🏛️ {p.grau}</p>}
                                          {p.orgaoJulgador  && <p style={{ fontSize: 11, color: "var(--muted)" }}>📍 {p.orgaoJulgador}</p>}
                                          {p.dataAjuizamento && <p style={{ fontSize: 11, color: "var(--muted)" }}>📅 {p.dataAjuizamento}</p>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}
                      </>
                    )}

                    {/* TAB: Restrições e Sanções */}
                    {tab === "sancoes" && resultado.tipo === "cnpj" && (
                      <div style={{ display: "grid", gap: 20 }}>

                        {/* Simples Nacional */}
                        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                          <div style={{ background: "#1d4ed8", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 16 }}>🟢</span>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "white" }}>Simples Nacional / MEI</p>
                          </div>
                          {resultado.simplesNacional ? (
                            <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                              <div style={{
                                background: resultado.simplesNacional.simples?.optante ? "#f0fdf4" : "#fafafa",
                                border: `1px solid ${resultado.simplesNacional.simples?.optante ? "#86efac" : "#e2e8f0"}`,
                                borderRadius: 10, padding: 14, textAlign: "center",
                              }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>
                                  Simples Nacional
                                </p>
                                <span style={{
                                  fontSize: 13, fontWeight: 800, padding: "4px 12px", borderRadius: 8,
                                  background: resultado.simplesNacional.simples?.optante ? "#dcfce7" : "#fef2f2",
                                  color: resultado.simplesNacional.simples?.optante ? "#15803d" : "#dc2626",
                                }}>
                                  {resultado.simplesNacional.simples?.optante ? "✅ Optante" : "❌ Não Optante"}
                                </span>
                                {resultado.simplesNacional.simples?.dataOpcao && (
                                  <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                                    Opção desde: {new Date(resultado.simplesNacional.simples.dataOpcao).toLocaleDateString("pt-BR")}
                                  </p>
                                )}
                                {resultado.simplesNacional.simples?.dataExclusao && (
                                  <p style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>
                                    Excluído em: {new Date(resultado.simplesNacional.simples.dataExclusao).toLocaleDateString("pt-BR")}
                                  </p>
                                )}
                              </div>
                              <div style={{
                                background: resultado.simplesNacional.simei?.optante ? "#f0fdf4" : "#fafafa",
                                border: `1px solid ${resultado.simplesNacional.simei?.optante ? "#86efac" : "#e2e8f0"}`,
                                borderRadius: 10, padding: 14, textAlign: "center",
                              }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>
                                  MEI (SIMEI)
                                </p>
                                <span style={{
                                  fontSize: 13, fontWeight: 800, padding: "4px 12px", borderRadius: 8,
                                  background: resultado.simplesNacional.simei?.optante ? "#dcfce7" : "#fef2f2",
                                  color: resultado.simplesNacional.simei?.optante ? "#15803d" : "#dc2626",
                                }}>
                                  {resultado.simplesNacional.simei?.optante ? "✅ Optante" : "❌ Não MEI"}
                                </span>
                                {resultado.simplesNacional.simei?.dataOpcao && (
                                  <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                                    Opção desde: {new Date(resultado.simplesNacional.simei.dataOpcao).toLocaleDateString("pt-BR")}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                              ⏳ Informação do Simples Nacional não disponível para este CNPJ.
                            </div>
                          )}
                        </div>

                        {/* CEIS */}
                        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                          <div style={{
                            background: resultado.sancoesCEIS && resultado.sancoesCEIS.length > 0 ? "#b91c1c" : "#64748b",
                            padding: "10px 16px", display: "flex", alignItems: "center", gap: 8,
                          }}>
                            <span style={{ fontSize: 16 }}>🚫</span>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "white" }}>
                              CEIS — Cadastro de Empresas Inidôneas e Suspensas
                              {resultado.sancoesCEIS && resultado.sancoesCEIS.length > 0 && (
                                <span style={{ marginLeft: 8, background: "rgba(255,255,255,.25)", borderRadius: 5, padding: "1px 8px", fontSize: 11 }}>
                                  {resultado.sancoesCEIS.length} registro(s)
                                </span>
                              )}
                            </p>
                          </div>
                          {resultado.sancoesCEIS && resultado.sancoesCEIS.length > 0 ? (
                            <div>
                              {resultado.sancoesCEIS.map((s, i) => (
                                <div key={s.id ?? i} style={{
                                  padding: "14px 16px",
                                  borderBottom: i < resultado.sancoesCEIS!.length - 1 ? "1px solid var(--border)" : "none",
                                }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                      <span style={{ fontSize: 11, fontWeight: 800, background: "#fef2f2", color: "#b91c1c", padding: "2px 8px", borderRadius: 5 }}>CEIS</span>
                                      {s.tipoSancao && (
                                        <span style={{ fontSize: 11, background: "#fff7ed", color: "#c2410c", padding: "2px 8px", borderRadius: 5, fontWeight: 700 }}>
                                          {s.tipoSancao}
                                        </span>
                                      )}
                                    </div>
                                    {s.dataFinalSancao && new Date(s.dataFinalSancao) > new Date() && (
                                      <span style={{ fontSize: 11, fontWeight: 800, background: "#fef2f2", color: "#dc2626", padding: "2px 8px", borderRadius: 5 }}>
                                        ⚠️ SANÇÃO ATIVA
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, color: "var(--black)" }}>
                                    {s.orgaoSancionador && <div><strong>Órgão:</strong> {s.orgaoSancionador} {s.ufOrgaoSancionador && `(${s.ufOrgaoSancionador})`}</div>}
                                    {s.dataInicioSancao && <div><strong>Início:</strong> {new Date(s.dataInicioSancao).toLocaleDateString("pt-BR")}</div>}
                                    {s.dataFinalSancao  && <div><strong>Término:</strong> {new Date(s.dataFinalSancao).toLocaleDateString("pt-BR")}</div>}
                                    {s.dataPublicacao   && <div><strong>DOU:</strong> {new Date(s.dataPublicacao).toLocaleDateString("pt-BR")}</div>}
                                    {s.valorMulta != null && s.valorMulta > 0 && <div><strong>Multa:</strong> R$ {s.valorMulta.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>}
                                    {s.codigoSancao     && <div><strong>Código:</strong> {s.codigoSancao}</div>}
                                  </div>
                                  {s.fundamentacaoLegal && (
                                    <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
                                      <strong>Fundamentação:</strong> {s.fundamentacaoLegal}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ padding: 20, textAlign: "center" }}>
                              <p style={{ fontSize: 13, color: "#15803d", fontWeight: 600 }}>✅ Nenhum registro no CEIS</p>
                              <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Empresa não está cadastrada como inidônea ou suspensa</p>
                            </div>
                          )}
                        </div>

                        {/* CNEP */}
                        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                          <div style={{
                            background: resultado.sancoesCNEP && resultado.sancoesCNEP.length > 0 ? "#7c3aed" : "#64748b",
                            padding: "10px 16px", display: "flex", alignItems: "center", gap: 8,
                          }}>
                            <span style={{ fontSize: 16 }}>⚠️</span>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "white" }}>
                              CNEP — Cadastro Nacional de Empresas Punidas
                              {resultado.sancoesCNEP && resultado.sancoesCNEP.length > 0 && (
                                <span style={{ marginLeft: 8, background: "rgba(255,255,255,.25)", borderRadius: 5, padding: "1px 8px", fontSize: 11 }}>
                                  {resultado.sancoesCNEP.length} registro(s)
                                </span>
                              )}
                            </p>
                          </div>
                          {resultado.sancoesCNEP && resultado.sancoesCNEP.length > 0 ? (
                            <div>
                              {resultado.sancoesCNEP.map((s, i) => (
                                <div key={s.id ?? i} style={{
                                  padding: "14px 16px",
                                  borderBottom: i < resultado.sancoesCNEP!.length - 1 ? "1px solid var(--border)" : "none",
                                }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                      <span style={{ fontSize: 11, fontWeight: 800, background: "#f5f3ff", color: "#7c3aed", padding: "2px 8px", borderRadius: 5 }}>CNEP</span>
                                      {s.tipoSancao && (
                                        <span style={{ fontSize: 11, background: "#fdf4ff", color: "#7e22ce", padding: "2px 8px", borderRadius: 5, fontWeight: 700 }}>
                                          {s.tipoSancao}
                                        </span>
                                      )}
                                    </div>
                                    {s.dataFinalSancao && new Date(s.dataFinalSancao) > new Date() && (
                                      <span style={{ fontSize: 11, fontWeight: 800, background: "#fef2f2", color: "#dc2626", padding: "2px 8px", borderRadius: 5 }}>
                                        ⚠️ SANÇÃO ATIVA
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, color: "var(--black)" }}>
                                    {s.orgaoSancionador && <div><strong>Órgão:</strong> {s.orgaoSancionador} {s.ufOrgaoSancionador && `(${s.ufOrgaoSancionador})`}</div>}
                                    {s.dataInicioSancao && <div><strong>Início:</strong> {new Date(s.dataInicioSancao).toLocaleDateString("pt-BR")}</div>}
                                    {s.dataFinalSancao  && <div><strong>Término:</strong> {new Date(s.dataFinalSancao).toLocaleDateString("pt-BR")}</div>}
                                    {s.dataPublicacao   && <div><strong>DOU:</strong> {new Date(s.dataPublicacao).toLocaleDateString("pt-BR")}</div>}
                                    {s.valorMulta != null && s.valorMulta > 0 && <div><strong>Multa:</strong> R$ {s.valorMulta.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>}
                                    {s.codigoSancao     && <div><strong>Código:</strong> {s.codigoSancao}</div>}
                                  </div>
                                  {s.descricao && (
                                    <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
                                      <strong>Descrição:</strong> {s.descricao}
                                    </p>
                                  )}
                                  {s.fundamentacaoLegal && (
                                    <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
                                      <strong>Fundamentação:</strong> {s.fundamentacaoLegal}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ padding: 20, textAlign: "center" }}>
                              <p style={{ fontSize: 13, color: "#15803d", fontWeight: 600 }}>✅ Nenhum registro no CNEP</p>
                              <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Empresa não está cadastrada como punida pela Lei Anticorrupção</p>
                            </div>
                          )}
                        </div>

                        {/* Aviso legal */}
                        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: 14 }}>
                          <p style={{ fontSize: 12, color: "#92400e", lineHeight: 1.6 }}>
                            ⚠️ <strong>Fonte:</strong> CEIS e CNEP são fornecidos pela CGU via Portal da Transparência.
                            Simples Nacional via BrasilAPI. Consulte sempre as fontes oficiais para decisões críticas.
                          </p>
                        </div>

                      </div>
                    )}

                    {/* Rodapé fontes */}
                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                      <p style={{ fontSize: 11, color: "var(--muted)" }}>
                        📡 {resultado.fontes.length > 0
                          ? `Fontes: ${resultado.fontes.join(" · ")}`
                          : "Nenhuma fonte retornou dados"
                        } · Consultado em {new Date().toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Placeholder quando sem resultado */}
              {!resultado && !loading && (
                <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 40, textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: "var(--dark)", marginBottom: 6 }}>
                    Digite um CPF ou CNPJ para começar
                  </p>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
                    O resultado aparecerá aqui com dados da Receita Federal e processos judiciais de todos os tribunais do Brasil
                  </p>
                  <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                    {["27 TJs Estaduais", "6 TRFs", "24 TRTs", "5 Superiores", "27 TREs"].map(b => (
                      <span key={b} style={{ fontSize: 11, fontWeight: 600, background: "#f0fdf4", color: "#15803d", padding: "4px 10px", borderRadius: 20, border: "1px solid #bbf7d0" }}>
                        ✅ {b}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Coluna lateral — Histórico ── */}
            <div>
              <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)" }}>📋 Histórico</p>
                  <span style={{ fontSize: 11, fontWeight: 700, background: "var(--off2)", color: "var(--muted)", padding: "2px 8px", borderRadius: 6 }}>
                    {total ?? 0} total
                  </span>
                </div>

                {!historico?.length ? (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                    Nenhuma consulta ainda
                  </div>
                ) : (
                  <div>
                    {historico.map(item => (
                      <div
                        key={item.id}
                        onClick={() => handleHistoricoClick(item)}
                        style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background .1s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--off)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "white")}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 4,
                            background: item.tipo === "cnpj" ? "#eff6ff" : "#f5f3ff",
                            color: item.tipo === "cnpj" ? "#1e40af" : "#5b21b6",
                          }}>
                            {item.tipo?.toUpperCase()}
                          </span>
                          {(item.totalProcessos ?? 0) > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, background: "#fef2f2", color: "#dc2626", padding: "1px 6px", borderRadius: 4 }}>
                              {item.totalProcessos} proc.
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", marginBottom: 2, fontFamily: "monospace" }}>
                          {item.documento}
                        </p>
                        {item.razaoSocial && (
                          <p style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                            {item.razaoSocial}
                          </p>
                        )}
                        <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
                          {new Date(item.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info fontes */}
              <div style={{ background: "var(--navy)", borderRadius: 14, padding: 16, marginTop: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 12 }}>📡 Fontes utilizadas</p>
                {[
                  { icon: "🏛️", name: "Receita Federal",  desc: "ReceitaWS · CNPJ.ws · BrasilAPI · MinhaReceita (cascata automática)" },
                  { icon: "⚖️", name: "CNJ Datajud",      desc: "80+ tribunais em paralelo: TJs, TRFs, TRTs, TREs, Superiores" },
                  { icon: "🚫", name: "CGU — CEIS",        desc: "Empresas inidôneas e suspensas (Portal da Transparência)" },
                  { icon: "⚠️", name: "CGU — CNEP",        desc: "Empresas punidas pela Lei Anticorrupção (Portal da Transparência)" },
                  { icon: "🟢", name: "Simples Nacional",  desc: "Status de optante e MEI — BrasilAPI" },
                ].map(f => (
                  <div key={f.name} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{f.icon}</span>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "white" }}>{f.name}</p>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,.6)", lineHeight: 1.4 }}>{f.desc}</p>
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid rgba(255,255,255,.15)", paddingTop: 10, marginTop: 6 }}>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,.5)", lineHeight: 1.5 }}>
                    Dados públicos · LGPD respeitada · Processos sigilosos são omitidos pelo CNJ
                  </p>
                </div>
              </div>
            </div>

          </div>
        )} {/* end mainTab consulta */}

      </div>
    </Layout>
  );
}
