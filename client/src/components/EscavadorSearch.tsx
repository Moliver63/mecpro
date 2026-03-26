/**
 * EscavadorSearch — Busca unificada CPF / CNPJ / Nome via Escavador API
 * Integrado ao módulo de Consultas do MECProAI
 * Token nunca exposto — backend usa ESCAVADOR_API_TOKEN / ESCAVADOR_MEC_PLAYGOUND
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Participacao {
  tipo: string; polo: string; tribunal: string;
  grau?: string; numero?: string; assunto?: string; data?: string; ativo?: boolean;
}
interface NomeResultado {
  id?: number; nome: string; tipo_pessoa: "FISICA" | "JURIDICA";
  documento?: string; quantidade_processos: number; url_escavador?: string;
}
interface EscavadorResult {
  mode:    "cpf" | "cnpj" | "nome";
  success: boolean; fonte: string;
  nome?: string; documento?: string; tipo_pessoa?: "FISICA" | "JURIDICA";
  quantidade_processos?: number;
  participacoes?: Participacao[];
  emails?: string[]; telefones?: string[]; enderecos?: string[];
  nascimento?: string; socios?: { nome: string; qualificacao: string }[];
  resultados?: NomeResultado[];
  error?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function onlyDigits(v: string) { return v.replace(/\D/g, ""); }

function autoFormat(raw: string): string {
  const d = onlyDigits(raw);
  // Enquanto digita, auto-mascara
  if (d.length <= 11 && /^\d/.test(raw)) {
    return d.replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  if (d.length > 11 && d.length <= 14 && /^\d/.test(raw)) {
    return d.replace(/^(\d{2})(\d)/, "$1.$2")
            .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
            .replace(/\.(\d{3})(\d)/, ".$1/$2")
            .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return raw;
}

function inferMode(v: string): "cpf" | "cnpj" | "nome" | null {
  const d = onlyDigits(v);
  if (d.length === 11) return "cpf";
  if (d.length === 14) return "cnpj";
  if (v.trim().length >= 3) return "nome";
  return null;
}

const POLO_COLOR: Record<string, { bg: string; color: string }> = {
  ATIVO:   { bg: "#dcfce7", color: "#15803d" },
  PASSIVO: { bg: "#fee2e2", color: "#dc2626" },
};
const TRIBUNAL_COLOR: Record<string, string> = {
  STJ: "#7c3aed", STF: "#7c3aed",
  TRF: "#1d4ed8", TRT: "#c2410c",
  TJ:  "#15803d", TST: "#b45309",
};
function getTribunalColor(t: string) {
  for (const [k, v] of Object.entries(TRIBUNAL_COLOR)) {
    if (t?.startsWith(k)) return v;
  }
  return "#475569";
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function StatBadge({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div style={{ textAlign: "center", padding: "10px 16px", borderRadius: 12,
      background: `${color}15`, border: `1.5px solid ${color}30` }}>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color }}>{value}</p>
      <p style={{ margin: 0, fontSize: 10, color, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
    </div>
  );
}

function ParticipacaoCard({ p, i }: { p: Participacao; i: number }) {
  const poloStyle = POLO_COLOR[p.polo?.toUpperCase()] ?? { bg: "#f1f5f9", color: "#475569" };
  return (
    <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
          background: "#dcfce7", color: "#15803d" }}>{p.tipo}</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
          background: poloStyle.bg, color: poloStyle.color }}>{p.polo}</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
          background: "#eff6ff", color: getTribunalColor(p.tribunal) }}>{p.tribunal}</span>
        {p.grau && (
          <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20,
            background: "#f8fafc", color: "#64748b", border: "1px solid var(--border)" }}>{p.grau}</span>
        )}
        {p.ativo === false && (
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20,
            background: "#f1f5f9", color: "#94a3b8" }}>Encerrado</span>
        )}
      </div>
      {p.numero && (
        <p style={{ margin: 0, fontSize: 12, fontFamily: "monospace", color: "var(--black)", fontWeight: 600 }}>
          {p.numero}
        </p>
      )}
      {p.assunto && (
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--muted)" }}>{p.assunto}</p>
      )}
      {p.data && (
        <p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--muted)" }}>
          📅 {new Date(p.data).toLocaleDateString("pt-BR")}
        </p>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function EscavadorSearch() {
  const [query,      setQuery]      = useState("");
  const [result,     setResult]     = useState<EscavadorResult | null>(null);
  const [activeTab,  setActiveTab]  = useState<"resumo" | "participacoes" | "contatos">("resumo");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const mode   = useMemo(() => inferMode(query), [query]);
  const searchMut = (trpc as any).consultas?.escavadorSearch?.useMutation?.({
    onSuccess: (data: any) => {
      setResult(data);
      setActiveTab("resumo");
      if (!data.success && data.error) {
        toast.error(data.error);
      }
    },
    onError: (e: any) => {
      toast.error("Erro: " + (e?.message || "falha na consulta"));
    },
  }) ?? { mutate: () => {}, isPending: false };

  // Busca detalhe de uma pessoa encontrada por nome
  const detailMut = (trpc as any).consultas?.escavadorSearch?.useMutation?.({
    onSuccess: (data: any) => {
      setResult(data);
      setActiveTab("resumo");
    },
    onError: (e: any) => toast.error("Erro ao detalhar: " + e?.message),
  }) ?? { mutate: () => {}, isPending: false };

  function handleSearch() {
    if (!mode || !query.trim()) return;
    setResult(null);
    setSelectedId(null);
    (searchMut as any).mutate({ query: query.trim() });
  }

  function handleSelectNome(item: NomeResultado) {
    if (!item.documento) return;
    setSelectedId(item.id ?? null);
    (detailMut as any).mutate({ query: onlyDigits(item.documento) || item.nome });
  }

  const loading = (searchMut as any).isPending || (detailMut as any).isPending;

  return (
    <div>
      {/* ── Cabeçalho ── */}
      <div style={{ background: "linear-gradient(135deg, #0f172a, #1e3a5f)", borderRadius: 16,
        padding: "20px 24px", marginBottom: 20, color: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,.12)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🔍</div>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>Busca Escavador</p>
            <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
              CPF • CNPJ • Nome — processos e participações
            </p>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, padding: "3px 10px",
            borderRadius: 20, background: "rgba(34,197,94,.2)", color: "#4ade80" }}>
            Escavador API v2
          </span>
        </div>

        {/* Barra de busca */}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              value={query}
              onChange={e => setQuery(autoFormat(e.target.value))}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="CPF, CNPJ ou nome da pessoa / empresa"
              style={{
                width: "100%", padding: "12px 16px", paddingRight: mode ? 70 : 16,
                borderRadius: 10, border: "1.5px solid rgba(255,255,255,.15)",
                background: "rgba(255,255,255,.07)", color: "white",
                fontSize: 14, outline: "none", boxSizing: "border-box",
              }}
            />
            {mode && (
              <span style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6,
                background: mode === "cpf" ? "#7c3aed" : mode === "cnpj" ? "#1d4ed8" : "#059669",
                color: "white",
              }}>
                {mode.toUpperCase()}
              </span>
            )}
          </div>
          <button
            disabled={loading || !mode}
            onClick={handleSearch}
            style={{
              padding: "12px 24px", borderRadius: 10, border: "none",
              background: loading || !mode ? "rgba(255,255,255,.15)" : "#22c55e",
              color: loading || !mode ? "rgba(255,255,255,.4)" : "#0f172a",
              fontWeight: 800, fontSize: 13, cursor: loading || !mode ? "not-allowed" : "pointer",
              whiteSpace: "nowrap", flexShrink: 0,
            }}>
            {loading ? "⏳ Buscando..." : "🔍 Buscar"}
          </button>
        </div>

        {/* Dicas */}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {[
            { label: "CPF: 000.000.000-00", mode: "cpf" },
            { label: "CNPJ: 00.000.000/0000-00", mode: "cnpj" },
            { label: "Nome: João Silva", mode: "nome" },
          ].map(hint => (
            <span key={hint.mode} style={{ fontSize: 10, color: "#64748b", background: "rgba(255,255,255,.05)",
              padding: "2px 8px", borderRadius: 6 }}>
              {hint.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14,
          padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)" }}>Consultando Escavador...</p>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>Buscando processos e participações</p>
        </div>
      )}

      {/* ── Erro ── */}
      {!loading && result && !result.success && result.error && (
        <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 12, padding: "16px 20px" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#dc2626", margin: "0 0 4px" }}>⚠️ Erro na consulta</p>
          <p style={{ fontSize: 13, color: "#7f1d1d", margin: 0 }}>{result.error}</p>
        </div>
      )}

      {/* ── RESULTADO: Lista por nome ── */}
      {!loading && result?.mode === "nome" && result.success && (
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 12 }}>
            {result.resultados?.length
              ? `${result.resultados.length} resultado(s) encontrado(s) — clique para ver detalhes`
              : "Nenhum resultado encontrado para este nome"}
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {(result.resultados ?? []).map((item, i) => (
              <div key={i}
                onClick={() => handleSelectNome(item)}
                style={{
                  background: selectedId === item.id ? "#eff6ff" : "white",
                  border: `1.5px solid ${selectedId === item.id ? "#3b82f6" : "var(--border)"}`,
                  borderRadius: 12, padding: "14px 18px", cursor: item.documento ? "pointer" : "default",
                  display: "flex", alignItems: "center", gap: 14, transition: "all .15s",
                }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: item.tipo_pessoa === "FISICA" ? "#f5f3ff" : "#eff6ff",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                  {item.tipo_pessoa === "FISICA" ? "👤" : "🏢"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "var(--black)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.nome}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>
                      {item.tipo_pessoa === "FISICA" ? "Pessoa Física" : "Pessoa Jurídica"}
                    </span>
                    {item.documento && (
                      <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>
                        {item.documento}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 800,
                    color: item.quantidade_processos > 0 ? "#dc2626" : "#16a34a" }}>
                    {item.quantidade_processos}
                  </p>
                  <p style={{ margin: 0, fontSize: 9, color: "var(--muted)", textTransform: "uppercase" }}>processos</p>
                </div>
                {item.documento && (
                  <span style={{ fontSize: 18, color: "#94a3b8", flexShrink: 0 }}>›</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── RESULTADO: CPF / CNPJ ── */}
      {!loading && result?.success && (result.mode === "cpf" || result.mode === "cnpj") && (
        <div>
          {/* Card identidade */}
          <div style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)", borderRadius: 16,
            padding: "18px 20px", marginBottom: 16, color: "white" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                background: "rgba(255,255,255,.1)", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 24 }}>
                {result.tipo_pessoa === "FISICA" ? "👤" : "🏢"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 18,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {result.nome ?? "Nome não disponível"}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>
                  {result.mode === "cpf" ? "CPF" : "CNPJ"}: {result.documento}
                  {result.nascimento && ` · Nasc: ${result.nascimento}`}
                </p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, flexShrink: 0,
                background: result.tipo_pessoa === "FISICA" ? "rgba(124,58,237,.3)" : "rgba(29,78,216,.3)",
                color: result.tipo_pessoa === "FISICA" ? "#c4b5fd" : "#93c5fd" }}>
                {result.tipo_pessoa === "FISICA" ? "Pessoa Física" : "Pessoa Jurídica"}
              </span>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16 }}>
              <StatBadge
                value={result.quantidade_processos ?? 0}
                label="Processos"
                color={result.quantidade_processos && result.quantidade_processos > 0 ? "#ef4444" : "#22c55e"}
              />
              <StatBadge
                value={(result.participacoes ?? []).filter(p => p.polo === "ATIVO").length}
                label="Polo ativo"
                color="#f59e0b"
              />
              <StatBadge
                value={(result.participacoes ?? []).filter(p => p.polo === "PASSIVO").length}
                label="Polo passivo"
                color="#6366f1"
              />
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
            {([
              { key: "resumo", label: "📊 Resumo" },
              { key: "participacoes", label: `⚖️ Participações (${result.participacoes?.length ?? 0})` },
              ...(result.emails?.length || result.telefones?.length || result.socios?.length
                ? [{ key: "contatos", label: "📞 Contatos" }] : []),
            ] as { key: typeof activeTab; label: string }[]).map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                style={{
                  padding: "8px 16px", border: "none", borderRadius: "8px 8px 0 0",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: activeTab === t.key ? "var(--navy)" : "transparent",
                  color: activeTab === t.key ? "white" : "var(--muted)",
                  borderBottom: activeTab === t.key ? "2px solid var(--navy)" : "2px solid transparent",
                  transition: "all .15s",
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* TAB: Resumo */}
          {activeTab === "resumo" && (
            <div style={{ display: "grid", gap: 12 }}>
              {/* Distribuição por tribunal */}
              {(result.participacoes?.length ?? 0) > 0 && (() => {
                const byTrib: Record<string, number> = {};
                result.participacoes!.forEach(p => {
                  byTrib[p.tribunal] = (byTrib[p.tribunal] ?? 0) + 1;
                });
                const sorted = Object.entries(byTrib).sort((a, b) => b[1] - a[1]).slice(0, 8);
                return (
                  <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", marginBottom: 10 }}>
                      🏛️ Distribuição por tribunal
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {sorted.map(([trib, count]) => (
                        <div key={trib} style={{ display: "flex", alignItems: "center", gap: 6,
                          padding: "6px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid var(--border)" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: getTribunalColor(trib) }}>{trib}</span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "white", background: getTribunalColor(trib),
                            borderRadius: 10, padding: "1px 7px" }}>{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Sócios (CNPJ) */}
              {result.socios && result.socios.length > 0 && (
                <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ background: "var(--navy)", padding: "10px 16px" }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "white", margin: 0 }}>👥 Quadro Societário</p>
                  </div>
                  {result.socios.map((s, i) => (
                    <div key={i} style={{ padding: "11px 16px", display: "flex", justifyContent: "space-between",
                      borderBottom: i < result.socios!.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--black)" }}>{s.nome}</p>
                      <p style={{ margin: 0, fontSize: 11, color: "var(--muted)" }}>{s.qualificacao}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Nenhum dado */}
              {(result.participacoes?.length ?? 0) === 0 && !result.socios?.length && (
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: 24, textAlign: "center" }}>
                  <p style={{ fontSize: 32, marginBottom: 8 }}>✅</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#15803d" }}>Nenhum processo encontrado</p>
                  <p style={{ fontSize: 12, color: "#16a34a" }}>Sem participações em processos judiciais</p>
                </div>
              )}
            </div>
          )}

          {/* TAB: Participações */}
          {activeTab === "participacoes" && (
            <div>
              {(result.participacoes?.length ?? 0) === 0 ? (
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: 24, textAlign: "center" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#15803d" }}>✅ Sem participações em processos</p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {/* Filtro polo */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>Filtrar:</span>
                    {["TODOS", "ATIVO", "PASSIVO"].map(polo => (
                      <button key={polo}
                        style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                          border: "1px solid var(--border)", background: "white",
                          color: polo === "ATIVO" ? "#15803d" : polo === "PASSIVO" ? "#dc2626" : "var(--muted)",
                          cursor: "pointer" }}
                        onClick={() => {/* filter handled by render below */}}>
                        {polo} ({polo === "TODOS"
                          ? result.participacoes!.length
                          : result.participacoes!.filter(p => p.polo === polo).length})
                      </button>
                    ))}
                  </div>
                  {result.participacoes!.slice(0, 30).map((p, i) => (
                    <ParticipacaoCard key={i} p={p} i={i} />
                  ))}
                  {result.participacoes!.length > 30 && (
                    <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: 8 }}>
                      Exibindo 30 de {result.participacoes!.length} participações
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: Contatos */}
          {activeTab === "contatos" && (
            <div style={{ display: "grid", gap: 12 }}>
              {result.emails?.length && (
                <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ background: "var(--navy)", padding: "10px 16px" }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "white", margin: 0 }}>✉️ Emails</p>
                  </div>
                  {result.emails.map((e, i) => (
                    <div key={i} style={{ padding: "10px 16px", fontSize: 13, color: "var(--black)",
                      borderBottom: i < result.emails!.length - 1 ? "1px solid var(--border)" : "none" }}>
                      {e}
                    </div>
                  ))}
                </div>
              )}
              {result.telefones?.length && (
                <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ background: "var(--navy)", padding: "10px 16px" }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "white", margin: 0 }}>📱 Telefones</p>
                  </div>
                  {result.telefones.map((t, i) => (
                    <div key={i} style={{ padding: "10px 16px", fontSize: 13, color: "var(--black)",
                      borderBottom: i < result.telefones!.length - 1 ? "1px solid var(--border)" : "none" }}>
                      {t}
                    </div>
                  ))}
                </div>
              )}
              {result.enderecos?.length && (
                <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ background: "var(--navy)", padding: "10px 16px" }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "white", margin: 0 }}>📍 Endereços</p>
                  </div>
                  {result.enderecos.map((e, i) => (
                    <div key={i} style={{ padding: "10px 16px", fontSize: 13, color: "var(--black)",
                      borderBottom: i < result.enderecos!.length - 1 ? "1px solid var(--border)" : "none" }}>
                      {e}
                    </div>
                  ))}
                </div>
              )}
              {!result.emails?.length && !result.telefones?.length && !result.enderecos?.length && !result.socios?.length && (
                <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: 20 }}>
                  Sem dados de contato disponíveis para este registro.
                </p>
              )}
            </div>
          )}

          {/* Rodapé fonte */}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>
              🔒 Dados fornecidos por <strong>Escavador API v2</strong> — apenas informações públicas
            </span>
          </div>
        </div>
      )}

      {/* Estado vazio */}
      {!loading && !result && (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12,
          padding: "28px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>🔎</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 4 }}>
            Busca por CPF, CNPJ ou Nome
          </p>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            Digite acima para buscar processos e participações via Escavador
          </p>
        </div>
      )}
    </div>
  );
}
