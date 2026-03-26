import { useState } from "react";
import { useParams, useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

export default function MarketIntelligence() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id || 0);
  const [, setLocation] = useLocation();

  const { data: analysis, refetch, isLoading } = trpc.market.get.useQuery(
    { projectId }, { enabled: !!projectId }
  );
  const generate = trpc.market.generate.useMutation({ onSuccess: () => refetch() });
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try { await generate.mutateAsync({ projectId }); }
    finally { setGenerating(false); }
  }

  const sections = [
    { key: "competitiveGaps",         icon: "🕳",  label: "Gaps competitivos",          color: "#fff7ed", border: "#fed7aa", text: "#9a3412" },
    { key: "unexploredOpportunities", icon: "🚀",  label: "Oportunidades inexploradas", color: "var(--green-l)", border: "var(--green-xl)", text: "var(--green-dk)" },
    { key: "suggestedPositioning",    icon: "🎯",  label: "Posicionamento sugerido",    color: "#eff6ff", border: "#bfdbfe", text: "#1e40af" },
    { key: "threats",                 icon: "⚠️",  label: "Ameaças identificadas",      color: "#fef2f2", border: "#fecaca", text: "#991b1b" },
  ];

  const hasData = analysis && (
    !!(analysis as any).competitiveGaps ||
    !!(analysis as any).unexploredOpportunities ||
    !!(analysis as any).suggestedPositioning ||
    !!(analysis as any).threats ||
    !!(analysis as any).competitiveMap
  );

  return (
    <Layout>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🗺</div>
          <div>
            <button className="btn btn-sm btn-ghost" onClick={() => setLocation(`/projects/${projectId}/competitors`)} style={{ paddingLeft: 0, marginBottom: 6 }}>← Módulo 2</button>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 2 }}>Market Intelligence</h1>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Módulo 3 — Análise de mercado e oportunidades via IA</p>
          </div>
        </div>
      </div>

      {!projectId ? (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 48, textAlign: "center" }}>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Acesse a partir de um projeto.</p>
        </div>
      ) : (
        <>
          {/* Painel de ação */}
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 4 }}>
                  {hasData ? "Análise de mercado disponível" : "Gerar análise de mercado"}
                </p>
                <p style={{ fontSize: 13, color: "var(--muted)" }}>
                  {hasData
                    ? `Gerada em ${new Date((analysis as any).generatedAt).toLocaleDateString("pt-BR")} · Modelo: ${(analysis as any).aiModel || "Gemini"}`
                    : "A IA analisa seus concorrentes e o perfil do cliente para identificar gaps, oportunidades e ameaças no mercado."}
                </p>
              </div>
              <button className="btn btn-md btn-green"
                onClick={handleGenerate}
                disabled={generating}>
                {generating ? "⏳ Gerando análise..." : hasData ? "🔄 Regenerar" : "✨ Gerar análise"}
              </button>
            </div>

            {generating && (
              <div style={{ marginTop: 16, background: "var(--green-l)", borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)", animation: "pulse 1.2s infinite" }} />
                  <p style={{ fontSize: 13, color: "var(--green-dk)", fontWeight: 600 }}>
                    IA processando dados dos concorrentes e perfil do cliente...
                  </p>
                </div>
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                  Isso pode levar 15–30 segundos.
                </p>
              </div>
            )}
          </div>

          {/* Resultado */}
          {isLoading ? (
            <div style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>Carregando...</div>
          ) : hasData ? (
            <div>
              {/* Grid 2 colunas — 4 cards principais */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                {sections.filter(s => !!(analysis as any)[s.key]).map(s => (
                  <div key={s.key} style={{ background: s.color, border: `1px solid ${s.border}`, borderRadius: 14, padding: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 20 }}>{s.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: s.text }}>{s.label}</span>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                      {(analysis as any)[s.key]}
                    </p>
                  </div>
                ))}
              </div>

              {/* Mapa competitivo — largura total */}
              {(analysis as any).competitiveMap && (
                <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 14, padding: 20, marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 20 }}>🗺</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#5b21b6" }}>Mapa competitivo</span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                    {(analysis as any).competitiveMap}
                  </p>
                </div>
              )}

              {/* CTA para próximo módulo */}
              <div style={{ background: "linear-gradient(135deg, var(--navy) 0%, #1a3a6e 100%)", borderRadius: 16, padding: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "white", marginBottom: 4 }}>✅ Análise concluída! Próximo passo:</p>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,.7)" }}>
                    Use esses insights para gerar uma campanha otimizada no Módulo 4.
                  </p>
                </div>
                <button
                  className="btn btn-green"
                  style={{ whiteSpace: "nowrap", fontWeight: 700, fontSize: 14, padding: "12px 24px" }}
                  onClick={() => setLocation(`/projects/${projectId}/campaign`)}
                >
                  Ir para Módulo 4 →
                </button>
              </div>
            </div>
          ) : (
            <div style={{ background: "white", border: "1px dashed var(--border)", borderRadius: 16, padding: 64, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🗺</div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>Nenhuma análise ainda</h3>
              <p style={{ fontSize: 14, color: "var(--muted)", maxWidth: 420, margin: "0 auto 24px", lineHeight: 1.6 }}>
                Clique em "Gerar análise" para a IA cruzar os dados dos concorrentes com o perfil do seu cliente e identificar oportunidades de mercado.
              </p>
              <button className="btn btn-md btn-green" onClick={handleGenerate} disabled={generating}>
                {generating ? "⏳ Gerando análise..." : "✨ Gerar análise"}
              </button>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
