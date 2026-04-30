// AdInputAnalyzer.tsx — Analisador de copy de anúncios com IA
// Dependências: trpc, toast — sem dependência de estado do componente pai
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value * 10}%`, background: color, borderRadius: 3, transition: "width .6s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, color, minWidth: 24 }}>{value}</span>
    </div>
  );
}


export function AdInputAnalyzer({ projectId, compName, competitorId, ads = [] }: {
  projectId: number; compName: string; competitorId: number; ads: any[]
}) {
  const [input,   setInput]   = useState(compName || "");
  const [nicho,   setNicho]   = useState("");
  const [result,  setResult]  = useState<any>(null);
  const [tab,     setTab]     = useState<"resumo"|"estrategia"|"melhorado"|"variacoes">("resumo");
  const [copied,  setCopied]  = useState("");
  const [useExisting, setUseExisting] = useState(ads.length > 0);

  // Detecta se parece nome de empresa (curto, sem pontuação de copy)
  const isCompanyName = input.trim().length < 60
    && !/[.!?]/.test(input)
    && !/\b(descubra|aproveite|garanta|clique|saiba|conheça|venha)\b/i.test(input)
    && input.trim().length > 0;

  // Contagem de anúncios disponíveis
  const realAds = ads.filter((a: any) => {
    try { const s = JSON.parse(a.rawData||"{}").source||""; return ["meta_ads_archive","ads_library_public"].includes(s); } catch { return false; }
  });
  const estAds = ads.filter((a: any) => {
    try { const s = JSON.parse(a.rawData||"{}").source||""; return !["meta_ads_archive","ads_library_public"].includes(s); } catch { return true; }
  });

  const analyzeMut = (trpc as any).competitors?.analyzeAdInput?.useMutation?.({
    onSuccess: (d: any) => { setResult(d?.data || null); setTab("resumo"); },
    onError:   (e: any) => { toast.error("✕ " + (e.message || "Erro ao analisar")); },
  }) ?? { mutate: () => {}, isPending: false };

  function handleCopy(text: string, key: string) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  }

  const score = result?.score_final || 0;
  const scoreColor = score >= 7 ? "#16a34a" : score >= 5 ? "#f59e0b" : "#dc2626";

  const tabs = [
    { key: "resumo",     label: "📊 Análise"    },
    { key: "estrategia", label: "🎯 Estratégia"  },
    { key: "melhorado",  label: "🚀 Melhorado"   },
    { key: "variacoes",  label: "✏️ Variações"   },
  ] as const;

  function handleAnalyze() {
    // Se useExisting mas sem anúncios, usa compName como fallback
    const effectiveInput = (useExisting && ads.length === 0)
      ? (compName || input.trim())
      : (input.trim() || compName);
    if (!effectiveInput) return;
    analyzeMut.mutate({
      input:        effectiveInput,
      nicho:        nicho || undefined,
      projectId,
      competitorId: (useExisting && ads.length > 0) ? competitorId : undefined,
    });
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0f172a,#1e3a5f)", borderRadius: "14px 14px 0 0", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(74,222,128,.15)", border: "1px solid rgba(74,222,128,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🧠</div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "white" }}>MECPro Analyzer</p>
          <p style={{ margin: 0, fontSize: 10, color: "#94a3b8" }}>
            {ads.length > 0
              ? <><strong style={{color:"#4ade80"}}>{ads.length} anúncios coletados</strong> prontos para análise — ou cole um texto/nome para análise manual</>
              : <>Cole o <strong style={{color:"#4ade80"}}>nome da empresa</strong> ou o <strong style={{color:"#60a5fa"}}>texto do anúncio</strong> — a IA detecta e analisa</>
            }
          </p>
        </div>
        {compName && input !== compName && (
          <button onClick={() => { setInput(compName); setResult(null); }}
            style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: "6px 12px", borderRadius: 8,
              background: "rgba(74,222,128,.15)", border: "1px solid rgba(74,222,128,.4)",
              color: "#4ade80", cursor: "pointer", whiteSpace: "nowrap" }}>
            🏢 Usar "{compName}"
          </button>
        )}
      </div>

      {/* Input */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderTop: "none", padding: 16 }}>

        {/* Toggle — usar anúncios coletados ou input manual */}
        {ads.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => setUseExisting(true)}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                background: useExisting ? "#0f172a" : "#f1f5f9", color: useExisting ? "white" : "var(--muted)" }}>
              📊 Analisar {ads.length} anúncio{ads.length > 1 ? "s" : ""} coletados
              {realAds.length > 0 && <span style={{ marginLeft: 6, fontSize: 10, background: "#4ade80", color: "#0f172a", padding: "1px 6px", borderRadius: 10 }}>{realAds.length} reais</span>}
            </button>
            <button onClick={() => setUseExisting(false)}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                background: !useExisting ? "#0f172a" : "#f1f5f9", color: !useExisting ? "white" : "var(--muted)" }}>
              ✏️ Análise por texto/nome
            </button>
          </div>
        )}

        {/* Input manual — só mostra quando não usa anúncios coletados */}
        {(!useExisting || ads.length === 0) && (
          <>
            <textarea
              rows={3}
              placeholder={`Digite o nome da empresa ou cole um texto de anúncio...\n\nEx: "${compName || "Triad Imóveis"}" ou "Perca 10kg em 30 dias..."`}
              value={input}
              onChange={e => { setInput(e.target.value); setResult(null); }}
              style={{ width: "100%", border: `1.5px solid ${isCompanyName ? "#4ade80" : "#60a5fa"}`, borderRadius: 10, padding: 12,
                fontSize: 13, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit",
                outline: "none", boxSizing: "border-box", transition: "border-color .2s" }}
            />
            {input.trim().length > 2 && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                  background: isCompanyName ? "rgba(74,222,128,.15)" : "rgba(96,165,250,.15)",
                  color: isCompanyName ? "#16a34a" : "#1d4ed8", border: `1px solid ${isCompanyName ? "#4ade80" : "#60a5fa"}` }}>
                  {isCompanyName ? "🏢 Modo: empresa — IA vai inferir a estratégia" : "📢 Modo: anúncio — IA vai analisar o copy"}
                </span>
              </div>
            )}
          </>
        )}

        {/* Preview dos anúncios que serão analisados */}
        {useExisting && ads.length > 0 && !result && (
          <div style={{ background: "#f8fafc", borderRadius: 10, padding: 12, marginBottom: 8 }}>
            <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
              Anúncios que serão analisados ({ads.length})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
              {ads.slice(0, 8).map((ad: any, i: number) => {
                const src = (() => { try { return JSON.parse(ad.rawData||"{}").source||""; } catch { return ""; } })();
                const isReal = ["meta_ads_archive","ads_library_public"].includes(src);
                return (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 8px", background: "white", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 10, flexShrink: 0,
                      background: isReal ? "#dcfce7" : "#fef9c3", color: isReal ? "#166534" : "#92400e" }}>
                      {isReal ? "◎ Real" : "⚠️ Est"}
                    </span>
                    <p style={{ margin: 0, fontSize: 11, color: "var(--black)", lineHeight: 1.4 }}>
                      <strong>{ad.headline || "—"}</strong>
                      {ad.bodyText && <span style={{ color: "var(--muted)" }}> · {ad.bodyText.slice(0, 60)}...</span>}
                    </p>
                  </div>
                );
              })}
              {ads.length > 8 && <p style={{ margin: 0, fontSize: 10, color: "var(--muted)", textAlign: "center" }}>+{ads.length - 8} mais</p>}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {!useExisting && (
            <input className="input" placeholder="Nicho (opcional — ex: imobiliária, academia)" value={nicho}
              onChange={e => setNicho(e.target.value)} style={{ flex: 1, fontSize: 12 }} />
          )}
          <button
            className="btn btn-md btn-primary"
            disabled={(useExisting && ads.length === 0 && !input.trim()) || (!useExisting && !input.trim()) || analyzeMut.isPending}
            onClick={handleAnalyze}
            style={{ flex: useExisting ? 1 : undefined, flexShrink: 0, fontSize: 13, fontWeight: 700, padding: "8px 20px" }}>
            {analyzeMut.isPending
              ? "⏳ Analisando..."
              : useExisting && ads.length > 0
                ? `🔍 Analisar ${ads.length} anúncio${ads.length > 1 ? "s" : ""}`
                : useExisting && ads.length === 0
                  ? `🏢 Analisar ${compName || "empresa"}`
                  : isCompanyName ? "🏢 Analisar empresa" : "🔍 Analisar anúncio"}
          </button>
        </div>
      </div>

      {/* Resultado */}
      {result && (
        <div style={{ border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>

          {/* Score banner */}
          <div style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 2px", fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Resumo executivo</p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--black)", lineHeight: 1.5 }}>{result.resumo}</p>
            </div>
            <div style={{ textAlign: "center", marginLeft: 16, flexShrink: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: scoreColor }}>{score}/10</div>
              <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>Score</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "white" }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex: 1, padding: "10px 4px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                  borderBottom: tab === t.key ? "2px solid #0f172a" : "2px solid transparent",
                  color: tab === t.key ? "#0f172a" : "var(--muted)", background: "white" }}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ background: "white", padding: 16, borderRadius: "0 0 14px 14px" }}>

            {/* ── Tab Análise ── */}
            {tab === "resumo" && (
              <div>
                {/* Interpretação */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {[
                    { label: "Nicho",      val: result.interpretacao?.nicho },
                    { label: "Produto",    val: result.interpretacao?.produto },
                    { label: "Público",    val: result.interpretacao?.publico },
                    { label: "Funil",      val: result.interpretacao?.funil },
                    { label: "Objetivo",   val: result.interpretacao?.objetivo },
                    { label: "Consciência",val: result.interpretacao?.nivelConsciencia },
                  ].map(item => item.val && (
                    <div key={item.label} style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>{item.label}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--black)", fontWeight: 600 }}>{item.val}</p>
                    </div>
                  ))}
                </div>

                {/* Scores */}
                <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>Avaliação</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  {[
                    { label: "Clareza",       val: result.avaliacao?.clareza,       color: "#3b82f6" },
                    { label: "Persuasão",     val: result.avaliacao?.persuasao,     color: "#8b5cf6" },
                    { label: "Oferta",        val: result.avaliacao?.oferta,        color: "#f59e0b" },
                    { label: "Diferenciação", val: result.avaliacao?.diferenciacao, color: "#06b6d4" },
                    { label: "Conversão",     val: result.avaliacao?.conversao,     color: "#10b981" },
                  ].map(s => s.val !== undefined && (
                    <div key={s.label}>
                      <p style={{ margin: "0 0 4px", fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{s.label}</p>
                      <ScoreBar value={s.val} color={s.color} />
                    </div>
                  ))}
                </div>
                {result.avaliacao?.justificativa && (
                  <p style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", margin: "8px 0 0" }}>{result.avaliacao.justificativa}</p>
                )}

                {/* Falhas e Oportunidades */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                  <div style={{ background: "#fef2f2", borderRadius: 10, padding: 12 }}>
                    <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, color: "#dc2626" }}>✕ Falhas</p>
                    {(result.falhas || []).map((f: string, i: number) => (
                      <p key={i} style={{ margin: "0 0 4px", fontSize: 11, color: "#991b1b" }}>• {f}</p>
                    ))}
                  </div>
                  <div style={{ background: "#f0fdf4", borderRadius: 10, padding: 12 }}>
                    <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, color: "#16a34a" }}>◎ Oportunidades</p>
                    {(result.oportunidades || []).map((o: string, i: number) => (
                      <p key={i} style={{ margin: "0 0 4px", fontSize: 11, color: "#15803d" }}>• {o}</p>
                    ))}
                  </div>
                </div>

                {/* Conclusão */}
                {result.conclusao && (
                  <div style={{ marginTop: 14, background: "linear-gradient(135deg,#0f172a,#1e3a5f)", borderRadius: 10, padding: 14 }}>
                    <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 800, color: "#4ade80" }}>🏆 Como ganhar desse concorrente</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>{result.conclusao}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab Estratégia ── */}
            {tab === "estrategia" && (
              <div>
                {result.estrategia && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                    {[
                      { label: "🎯 Promessa principal", val: result.estrategia.promessa },
                      { label: "💰 Tipo de oferta",    val: result.estrategia.oferta },
                      { label: "📍 Posicionamento",    val: result.estrategia.posicionamento },
                      { label: "🔀 Ângulo de venda",   val: result.estrategia.angulo },
                      { label: "❤️ Emoção dominante",  val: result.estrategia.emocao },
                      { label: "🧠 Lógica do anúncio", val: result.estrategia.logica },
                    ].map(item => item.val && (
                      <div key={item.label} style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
                        <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>{item.label}</p>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--black)" }}>{item.val}</p>
                      </div>
                    ))}
                  </div>
                )}
                {/* Gatilhos */}
                {(result.gatilhos || []).length > 0 && (
                  <>
                    <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>Gatilhos mentais</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {result.gatilhos.map((g: any, i: number) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", borderRadius: 8, background: g.status === "forte" ? "#f0fdf4" : g.status === "fraco" ? "#fefce8" : "#fef2f2" }}>
                          <span style={{ fontSize: 14, flexShrink: 0 }}>{g.status === "forte" ? "◎" : g.status === "fraco" ? "◬" : "✕"}</span>
                          <div>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--black)" }}>{g.nome}</p>
                            {g.observacao && <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--muted)" }}>{g.observacao}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Tab Melhorado ── */}
            {tab === "melhorado" && result.campanha_melhorada && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { key: "angulo",      label: "🔀 Novo ângulo",      icon: "🎯" },
                  { key: "promessa",    label: "💥 Nova promessa",     icon: "💥" },
                  { key: "headline",    label: "📢 Headline",          icon: "📢" },
                  { key: "texto",       label: "📝 Texto principal",   icon: "📝" },
                  { key: "cta",         label: "👆 CTA ideal",         icon: "👆" },
                  { key: "criativo",    label: "🎨 Sugestão criativo", icon: "🎨" },
                  { key: "prova_social",label: "⭐ Prova social",      icon: "◈" },
                  { key: "urgencia",    label: "⏰ Urgência/Escassez", icon: "⏰" },
                ].map(item => {
                  const val = result.campanha_melhorada[item.key];
                  if (!val) return null;
                  return (
                    <div key={item.key} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>{item.label}</p>
                        <button onClick={() => handleCopy(val, item.key)}
                          style={{ fontSize: 10, color: copied === item.key ? "#16a34a" : "#7c3aed", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
                          {copied === item.key ? "◎ Copiado" : "📋 Copiar"}
                        </button>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--black)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{val}</p>
                    </div>
                  );
                })}

                {/* Versão agressiva */}
                {result.versao_agressiva && (
                  <div style={{ background: "linear-gradient(135deg,#1e0533,#2d1554)", borderRadius: 12, padding: 16, marginTop: 4 }}>
                    <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 800, color: "#e879f9" }}>🔥 Versão agressiva — alta conversão</p>
                    {[
                      { label: "Headline", val: result.versao_agressiva.headline },
                      { label: "Copy",     val: result.versao_agressiva.texto },
                      { label: "CTA",      val: result.versao_agressiva.cta },
                    ].map(v => v.val && (
                      <div key={v.label} style={{ marginBottom: 8 }}>
                        <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, color: "#c084fc" }}>{v.label}</p>
                        <p style={{ margin: 0, fontSize: 13, color: "white", lineHeight: 1.5 }}>{v.val}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab Variações ── */}
            {tab === "variacoes" && (
              <div>
                {[
                  { label: "📢 Headlines", items: result.variacoes?.headlines },
                  { label: "📝 Textos",    items: result.variacoes?.textos },
                  { label: "👆 CTAs",      items: result.variacoes?.ctas },
                ].map(group => group.items?.length > 0 && (
                  <div key={group.label} style={{ marginBottom: 16 }}>
                    <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>{group.label}</p>
                    {group.items.map((item: string, i: number) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, marginBottom: 6 }}>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--black)", flex: 1, lineHeight: 1.5 }}>{i + 1}. {item}</p>
                        <button onClick={() => handleCopy(item, `${group.label}-${i}`)}
                          style={{ fontSize: 10, color: copied === `${group.label}-${i}` ? "#16a34a" : "#7c3aed", background: "none", border: "none", cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>
                          {copied === `${group.label}-${i}` ? "◎" : "📋"}
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
