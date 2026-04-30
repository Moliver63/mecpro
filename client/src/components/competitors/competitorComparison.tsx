// competitorComparison.tsx — Painel de comparação competitiva
import { useState } from "react";

export function CompetitiveBanner({ comp, myCompany, profileLoaded, onCompare, onEditCompany }: {
  comp:           any;
  myCompany:      MyCompanyData;
  profileLoaded:  boolean;
  onCompare:      () => void;
  onEditCompany:  (updated: MyCompanyData) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState<MyCompanyData>(myCompany);

  // Sincroniza draft quando myCompany mudar (ex: carregou do perfil)
  useEffect(() => { setDraft(myCompany); }, [myCompany.name]);

  const hasData = !!myCompany.name.trim();

  function saveAndCompare() {
    onEditCompany(draft);
    setEditing(false);
    setTimeout(onCompare, 50); // aguarda state propagar
  }

  return (
    <div style={{ marginBottom: 12 }}>
      {/* ── Estado: dados carregados do perfil → botão direto ── */}
      {!editing && hasData && (
        <div style={{
          background: "linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)",
          borderRadius: 14, padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(74,222,128,.15)", border: "1px solid rgba(74,222,128,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>⚔️</div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "white" }}>
                Comparar <span style={{ color: "#4ade80" }}>{myCompany.name}</span> vs <span style={{ color: "#f87171" }}>{comp.name}</span>
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#475569" }}>
                SWOT Competitiva · Blue Ocean · Competitive Matrix
                {profileLoaded && <span style={{ marginLeft: 6, color: "#22c55e" }}>● dados do seu perfil</span>}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => setEditing(true)}
              style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", color: "#94a3b8", padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
            >✏️</button>
            <button
              className="btn btn-md btn-primary"
              onClick={onCompare}
              style={{ fontSize: 12, padding: "8px 16px" }}
            >Ver análise →</button>
          </div>
        </div>
      )}

      {/* ── Estado: sem dados → mini formulário inline ── */}
      {!editing && !hasData && (
        <div style={{
          background: "linear-gradient(135deg,#0f172a,#1e3a5f)",
          borderRadius: 14, padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>⚔️</span>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "white" }}>Análise comparativa disponível</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#475569" }}>Informe o nome da sua empresa para gerar SWOT + Blue Ocean</p>
            </div>
          </div>
          <button
            className="btn btn-md btn-primary"
            style={{ fontSize: 12, flexShrink: 0 }}
            onClick={() => setEditing(true)}
          >Comparar com minha empresa →</button>
        </div>
      )}

      {/* ── Estado: edição inline compacta ── */}
      {editing && (
        <div style={{
          background: "white", border: "2px solid #4ade80", borderRadius: 14,
          padding: 16, animation: "fadeIn .15s",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "var(--black)" }}>🏢 Sua empresa</p>
            <button onClick={() => setEditing(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              { key: "name",     label: "Nome *",    placeholder: "Minha Empresa" },
              { key: "facebook", label: "Facebook",  placeholder: "fb.com/pagina" },
              { key: "website",  label: "Site",      placeholder: "www.empresa.com" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>{f.label}</label>
                <input
                  className="input"
                  placeholder={f.placeholder}
                  value={draft[f.key as keyof MyCompanyData] || ""}
                  onChange={e => setDraft(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: "100%", fontSize: 12, padding: "7px 10px" }}
                  autoFocus={f.key === "name"}
                />
              </div>
            ))}
            {/* Instagram com verificador */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>Instagram</label>
              <input
                className="input"
                placeholder="@handle"
                value={draft.instagram || ""}
                onChange={e => setDraft(p => ({ ...p, instagram: e.target.value }))}
                style={{ width: "100%", fontSize: 12, padding: "7px 10px",
                  borderColor: draft.instagram ? "#a78bfa" : undefined }}
              />
              <InstagramVerifier
                handle={draft.instagram || ""}
                onConfirm={h => setDraft(p => ({ ...p, instagram: h }))}
                onClear={() => setDraft(p => ({ ...p, instagram: "" }))}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>Cancelar</button>
            <button
              className="btn btn-sm btn-primary"
              disabled={!draft.name.trim()}
              onClick={saveAndCompare}
            >🚀 Gerar análise comparativa</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: PAINEL COMPARATIVO (Competitive Intelligence Matrix)
// Método: SWOT Competitiva + Blue Ocean Strategy + Jobs-to-be-Done
// ─────────────────────────────────────────────────────────────────────────────
export interface MyCompanyData {
  name: string;
  instagram?: string;
  facebook?: string;
  website?: string;
}

export function CompetitivePanel({ comp, myCompany, tiktokData, onClose }: {
  comp:        any;
  myCompany:   MyCompanyData;
  tiktokData?: any;
  onClose:     () => void;
}) {
  const ads: any[]  = comp.scrapedAds || [];
  const insights     = comp.aiInsights || "";

  // ── FONTES DISPONÍVEIS ─────────────────────────────────────────────────────
  const sources     = ads.map((a: any) => a.source || "unknown");
  const hasMeta     = ads.length > 0;
  const hasMetaReal = sources.some((s: string) => s === "meta_ads_archive" || s.startsWith("ads_library"));
  const hasMetaEst  = !hasMetaReal && ads.length > 0;
  const hasTikTok      = !!(tiktokData?.adsFound > 0);
  const googleKeywords = ads.filter((a: any) => a.source === "google_keyword_planner" || a.platform === "google");
  const hasGoogle      = googleKeywords.length > 0;

  // ── META ──────────────────────────────────────────────────────────────────
  const adsAtivos    = ads.filter((a: any) => a.isActive === 1 || a.isActive === true).length;
  const totalAds     = ads.length;
  const formats      = ads.reduce((acc: any, a: any) => { const k = a.adType||"image"; acc[k]=(acc[k]||0)+1; return acc; }, {} as Record<string,number>);
  const topFormat    = Object.entries(formats).sort((a: any,b: any)=>b[1]-a[1])[0]?.[0] || "imagem";
  const ctas         = ads.reduce((acc: any, a: any) => { if(a.cta) acc[a.cta]=(acc[a.cta]||0)+1; return acc; }, {} as Record<string,number>);
  const topCta       = Object.entries(ctas).sort((a: any,b: any)=>b[1]-a[1])[0]?.[0] || "Saiba mais";

  // ── TIKTOK ────────────────────────────────────────────────────────────────
  const tiktokAds    = tiktokData?.ads || [];
  const tiktokCount  = tiktokData?.adsFound || 0;
  const tiktokViews  = tiktokAds.reduce((s: number, a: any) => s+(a.viewCount||0), 0);
  const tiktokFormats= [...new Set(tiktokAds.map((a: any) => a.adType||"video"))];

  // ── SCORES REAIS CRUZADOS ─────────────────────────────────────────────────
  function scoreKW(text: string, kws: string[], base = 4, max = 10) {
    const t = text.toLowerCase(); let s = base;
    kws.forEach(k => { if(t.includes(k.toLowerCase())) s+=1; });
    return Math.min(max, s);
  }

  const compScores = {
    meta_presenca:    hasMeta ? Math.min(10, 2+Math.floor(totalAds/2)) : 0,
    meta_atividade:   hasMeta ? Math.min(10, 2+Math.floor(adsAtivos/2)) : 0,
    meta_diversidade: hasMeta ? Math.min(10, Object.keys(formats).length*2+(hasMetaReal?2:0)) : 0,
    tiktok_presenca:  hasTikTok ? Math.min(10, 3+Math.floor(tiktokCount/3)) : 0,
    tiktok_alcance:   hasTikTok ? (tiktokViews>1000000?9:tiktokViews>100000?7:tiktokViews>10000?5:3) : 0,
    maturidade:       scoreKW(insights, ["profissional","qualidade","posicionamento","premium","autoridade","branding"]),
    clareza:          scoreKW(insights, ["oferta","desconto","promoção","urgência","resultado","garantia"]),
  };
  const myScores = {
    meta_presenca:    myCompany.facebook ? 5 : 3,
    meta_atividade:   myCompany.facebook ? 5 : 3,
    meta_diversidade: 4,
    tiktok_presenca:  0,
    tiktok_alcance:   0,
    maturidade:       6,
    clareza:          6,
  };

  const dimensions = [
    { key:"meta_presenca",    label:"Presença Meta",        icon:"🔵", platform:"Meta",   color:"#1877f2" },
    { key:"meta_atividade",   label:"Anúncios Ativos",      icon:"📢", platform:"Meta",   color:"#1877f2" },
    { key:"meta_diversidade", label:"Diversidade Formatos", icon:"🎨", platform:"Meta",   color:"#1877f2" },
    { key:"tiktok_presenca",  label:"Presença TikTok",      icon:"🎵", platform:"TikTok", color:"#010101" },
    { key:"tiktok_alcance",   label:"Alcance TikTok",       icon:"🔥", platform:"TikTok", color:"#010101" },
    { key:"maturidade",       label:"Maturidade Mkt",       icon:"🧠", platform:"IA",     color:"#7c3aed" },
    { key:"clareza",          label:"Clareza da Oferta",    icon:"🎯", platform:"IA",     color:"#7c3aed" },
  ];

  const myAvg   = Object.values(myScores).reduce((a,b)=>a+b,0)/dimensions.length;
  const compAvg = Object.values(compScores).reduce((a,b)=>a+b,0)/dimensions.length;
  const myWins  = myAvg >= compAvg;
  const diff    = Math.abs(myAvg-compAvg).toFixed(1);

  const compVantagens = dimensions.filter(d => compScores[d.key as keyof typeof compScores] > myScores[d.key as keyof typeof myScores]);
  const myVantagens   = dimensions.filter(d => myScores[d.key as keyof typeof myScores]   > compScores[d.key as keyof typeof compScores]);
  const empates       = dimensions.filter(d => myScores[d.key as keyof typeof myScores]   === compScores[d.key as keyof typeof compScores]);

  const fontesBadge = [
    { label:"Meta Ads",   ok:hasMeta,   est:hasMetaEst, icon:"🔵", color:"#1877f2", bg:"#e8f0fe" },
    { label:"TikTok",     ok:hasTikTok, est:false,      icon:"🎵", color:"#010101", bg:"#f0f0f0" },
    { label:"Google Ads", ok:hasGoogle, est:false,      icon:"🔍", color:"#ea4335", bg:"#fde8e8" },
    { label:"IA Insights",ok:!!insights,est:false,      icon:"🧠", color:"#7c3aed", bg:"#f5f3ff" },
  ];

  const blueOcean = [
    hasTikTok
      ? { icon:"🎵", title: "", desc:`${comp.name} tem ${tiktokCount} ad(s) no TikTok com ${tiktokViews.toLocaleString("pt-BR")} views. ${myScores.tiktok_presenca===0?"Sua empresa ainda não marcou presença — oportunidade antes que o mercado sature.":"Diferencie o formato."}` }
      : { icon:"🎵", title: "", desc:`Não confirmado. Use "Buscar TikTok" no Raio-X para verificar presença do ${comp.name}.` },
    hasGoogle
      ? { icon:"🔍", title:`Google Ads — ${googleKeywords.length} keywords`, desc:`Palavras-chave do nicho: ${googleKeywords.slice(0,3).map((k:any)=>k.headline).join(", ")}` }
      : { icon:"🔍", title: "", desc:`Integre Google Ads em Configurações para incluir essa dimensão.` },
    { icon:"🎨", title:`Além do ${topFormat}`, desc:`${comp.name} foca em ${topFormat}. Explore formatos menos saturados.` },
    { icon:"🎯", title:`CTA além de "${topCta}"`, desc:`CTAs mais específicos ao momento do cliente convertem melhor que "${topCta}".` },
  ];

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:16, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"white", borderRadius:20, width:"100%", maxWidth:900, maxHeight:"94vh", overflowY:"auto", boxShadow:"0 32px 80px rgba(0,0,0,.35)" }}>

        {/* HEADER */}
        <div style={{ background:"linear-gradient(135deg,#0f172a,#1e3a5f)", borderRadius:"20px 20px 0 0", padding:"20px 26px", position:"sticky", top:0, zIndex:10 }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
            <div>
              <p style={{ margin:0, fontSize:10, color:"#475569", fontWeight:700, textTransform:"uppercase", letterSpacing:1 }}>Competitive Intelligence Matrix</p>
              <h2 style={{ margin:"4px 0 0", fontSize:19, fontWeight:900, color:"white" }}>
                <span style={{ color:"#4ade80" }}>{myCompany.name}</span>
                <span style={{ color:"#334155", fontWeight:400, margin:"0 8px" }}>vs</span>
                <span style={{ color:"#f87171" }}>{comp.name}</span>
              </h2>
              <div style={{ display:"flex", gap:5, marginTop:8, flexWrap:"wrap" }}>
                {fontesBadge.map(f => (
                  <span key={f.label} style={{ fontSize:10, fontWeight:700, padding:"2px 9px", borderRadius:20, background:f.ok?f.bg:"#f1f5f9", color:f.ok?f.color:"#94a3b8", border:`1px solid ${f.ok?f.color+"33":"#e2e8f0"}`, opacity:f.ok?1:0.55 }}>
                    {f.icon} {f.label} {f.ok?(f.est?"≈est":"✓"):"—"}
                  </span>
                ))}
                {!hasTikTok && <span style={{ fontSize:10, color:"#f59e0b", fontStyle:"italic" }}>⚡ Clique "Buscar TikTok" no Raio-X para dados reais</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background:"rgba(255,255,255,.1)", border:"none", color:"white", width:34, height:34, borderRadius:"50%", cursor:"pointer", fontSize:18, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
          </div>
        </div>

        <div style={{ padding:22, display:"flex", flexDirection:"column", gap:18 }}>

          {/* PLACAR */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:12, alignItems:"center" }}>
            <div style={{ background:myWins?"linear-gradient(135deg,#f0fdf4,#dcfce7)":"#f8fafc", border:`2px solid ${myWins?"#4ade80":"#e2e8f0"}`, borderRadius:14, padding:16, textAlign:"center" }}>
              <div style={{ width:42,height:42,borderRadius:"50%",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,margin:"0 auto 8px" }}>🏢</div>
              <p style={{ margin:0,fontSize:14,fontWeight:900,color:"var(--black)" }}>{myCompany.name}</p>
              {myCompany.instagram && <p style={{ margin:"2px 0 6px",fontSize:11,color:"var(--muted)" }}>{myCompany.instagram}</p>}
              <p style={{ margin:"8px 0 2px",fontSize:30,fontWeight:900,color:myWins?"#16a34a":"#0f172a" }}>{myAvg.toFixed(1)}</p>
              <p style={{ margin:0,fontSize:10,color:"var(--muted)" }}>média / 10</p>
              {myWins && <div style={{ marginTop:8,display:"inline-block",fontSize:11,fontWeight:700,color:"#16a34a",background:"#dcfce7",padding:"3px 10px",borderRadius:20 }}>◎ Vantagem</div>}
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ width:46,height:46,borderRadius:"50%",background:"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",fontSize:12,fontWeight:900,color:"#64748b" }}>VS</div>
              <p style={{ margin:"6px 0 0",fontSize:10,color:"var(--muted)",fontWeight:700 }}>Δ {diff} pts</p>
            </div>
            <div style={{ background:!myWins?"linear-gradient(135deg,#fef2f2,#fee2e2)":"#f8fafc", border:`2px solid ${!myWins?"#f87171":"#e2e8f0"}`, borderRadius:14, padding:16, textAlign:"center" }}>
              <div style={{ width:42,height:42,borderRadius:"50%",background:"#dc2626",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,margin:"0 auto 8px" }}>🎯</div>
              <p style={{ margin:0,fontSize:14,fontWeight:900,color:"var(--black)" }}>{comp.name}</p>
              <p style={{ margin:"2px 0 6px",fontSize:11,color:"var(--muted)" }}>{totalAds} ads Meta{hasTikTok?` · ${tiktokCount} TikTok`:""}</p>
              <p style={{ margin:"8px 0 2px",fontSize:30,fontWeight:900,color:!myWins?"#dc2626":"#0f172a" }}>{compAvg.toFixed(1)}</p>
              <p style={{ margin:0,fontSize:10,color:"var(--muted)" }}>média / 10</p>
              {!myWins && <div style={{ marginTop:8,display:"inline-block",fontSize:11,fontWeight:700,color:"#dc2626",background:"#fee2e2",padding:"3px 10px",borderRadius:20 }}>⚠️ Atenção</div>}
            </div>
          </div>

          {/* COMPARATIVO POR PLATAFORMA */}
          <div style={{ background:"#f8fafc", borderRadius:14, padding:16 }}>
            <p style={{ margin:"0 0 14px",fontSize:13,fontWeight:800,color:"var(--black)" }}>📊 Comparativo por plataforma</p>
            {(["Meta","TikTok","IA"] as const).map(plat => {
              const dims = dimensions.filter(d => d.platform === plat);
              const platColor = dims[0]?.color||"#64748b";
              const platIcon  = plat==="Meta"?"🔵":plat==="TikTok"?"🎵":"🧠";
              const platHasData = plat==="Meta"?hasMeta:plat==="TikTok"?hasTikTok:!!insights;
              return (
                <div key={plat} style={{ marginBottom:14 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                    <span style={{ fontSize:12 }}>{platIcon}</span>
                    <span style={{ fontSize:11,fontWeight:800,color:platColor,textTransform:"uppercase",letterSpacing:.8 }}>{plat}</span>
                    {!platHasData && (
                      <span style={{ fontSize:10,color:"#94a3b8",background:"#f1f5f9",padding:"1px 7px",borderRadius:10,marginLeft:4 }}>
                        {plat==="TikTok"?"busque no Raio-X":plat==="Meta"?"sem dados":"—"}
                      </span>
                    )}
                  </div>
                  {dims.map(d => {
                    const mine  = myScores[d.key as keyof typeof myScores];
                    const their = compScores[d.key as keyof typeof compScores];
                    const iWin  = mine >= their;
                    return (
                      <div key={d.key} style={{ marginBottom:10 }}>
                        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3 }}>
                          <span style={{ fontSize:12,fontWeight:600,color:"var(--black)" }}>{d.icon} {d.label}</span>
                          <div style={{ display:"flex",gap:5,alignItems:"center",fontSize:11 }}>
                            <span style={{ fontWeight:700,color:iWin?"#16a34a":"#6366f1" }}>{mine}/10</span>
                            <span style={{ color:"#cbd5e1" }}>|</span>
                            <span style={{ fontWeight:700,color:!iWin?"#dc2626":"#94a3b8" }}>{their}/10</span>
                          </div>
                        </div>
                        <div style={{ position:"relative",height:8,background:"#e2e8f0",borderRadius:4,overflow:"hidden" }}>
                          <div style={{ position:"absolute",left:0,top:0,height:"100%",width:`${their*10}%`,background:"rgba(239,68,68,.2)",transition:"width .7s" }}/>
                          <div style={{ position:"absolute",left:0,top:0,height:"100%",width:`${mine*10}%`,background:iWin?"rgba(34,197,94,.7)":"rgba(99,102,241,.5)",transition:"width .7s" }}/>
                        </div>
                        <div style={{ display:"flex",justifyContent:"space-between",marginTop:2 }}>
                          <span style={{ fontSize:9,color:iWin?"#16a34a":"#6366f1",fontWeight:600 }}>🏢 {myCompany.name}</span>
                          <span style={{ fontSize:9,color:"#ef4444",fontWeight:600 }}>{comp.name} 🎯</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* SWOT */}
          <div>
            <p style={{ margin:"0 0 10px",fontSize:13,fontWeight:800,color:"var(--black)" }}>⚔️ SWOT Competitiva</p>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              <div style={{ background:"#f0fdf4",border:"1px solid #86efac",borderRadius:12,padding:14 }}>
                <p style={{ margin:"0 0 8px",fontSize:11,fontWeight:800,color:"#16a34a" }}>💪 FORÇAS — {myCompany.name}</p>
                {myVantagens.length>0?myVantagens.map(d=>(
                  <div key={d.key} style={{ display:"flex",gap:5,marginBottom:5,alignItems:"center" }}>
                    <span style={{ fontSize:12 }}>{d.icon}</span>
                    <span style={{ fontSize:11,color:"#166534" }}>{d.label} <strong>+{myScores[d.key as keyof typeof myScores]-compScores[d.key as keyof typeof compScores]}pts</strong></span>
                  </div>
                )):<p style={{ fontSize:11,color:"#15803d",margin:0 }}>Equilibrado. Invista em diferenciais qualitativos.</p>}
              </div>
              <div style={{ background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:12,padding:14 }}>
                <p style={{ margin:"0 0 8px",fontSize:11,fontWeight:800,color:"#dc2626" }}>⚡ FORÇAS — {comp.name}</p>
                {compVantagens.length>0?compVantagens.map(d=>(
                  <div key={d.key} style={{ display:"flex",gap:5,marginBottom:5,alignItems:"center" }}>
                    <span style={{ fontSize:12 }}>{d.icon}</span>
                    <span style={{ fontSize:11,color:"#991b1b" }}>{d.label} <strong>+{compScores[d.key as keyof typeof compScores]-myScores[d.key as keyof typeof myScores]}pts</strong></span>
                  </div>
                )):<p style={{ fontSize:11,color:"#dc2626",margin:0 }}>Nenhuma vantagem detectada.</p>}
              </div>
              <div style={{ background:"#eff6ff",border:"1px solid #93c5fd",borderRadius:12,padding:14 }}>
                <p style={{ margin:"0 0 8px",fontSize:11,fontWeight:800,color:"#1d4ed8" }}>🔭 OPORTUNIDADES</p>
                {compVantagens.map(d=>(<p key={d.key} style={{ fontSize:11,color:"#1e40af",margin:"0 0 4px" }}>→ Melhorar <strong>{d.label}</strong> ({d.platform})</p>))}
                {!hasTikTok && <p style={{ fontSize:11,color:"#1e40af",margin:"0 0 4px" }}>→ Verificar TikTok — canal não analisado</p>}
                {hasGoogle
                  ? <p style={{ fontSize:11,color:"#16a34a",margin:"0 0 4px",fontWeight:700 }}>◎ {googleKeywords.length} keywords Google coletadas</p>
                  : <p style={{ fontSize:11,color:"#1e40af",margin:"0 0 4px" }}>→ Configure Google Ads em Integrações para coletar keywords</p>
                }
                {empates.length>0 && <p style={{ fontSize:11,color:"#1e40af",margin:0 }}>→ Empate em: {empates.map(d=>d.label).join(", ")}</p>}
              </div>
              <div style={{ background:"#fef9c3",border:"1px solid #fde047",borderRadius:12,padding:14 }}>
                <p style={{ margin:"0 0 8px",fontSize:11,fontWeight:800,color:"#854d0e" }}>⚠️ AMEAÇAS</p>
                {hasTikTok && tiktokCount>0 && <p style={{ fontSize:11,color:"#92400e",margin:"0 0 4px" }}>→ {comp.name} ativo no TikTok ({tiktokCount} ads · {tiktokViews.toLocaleString("pt-BR")} views)</p>}
                {compVantagens.length>0 && <p style={{ fontSize:11,color:"#92400e",margin:"0 0 4px" }}>→ Vantagem em {compVantagens.length} dimensão(ões)</p>}
                <p style={{ fontSize:11,color:"#92400e",margin:0 }}>→ Formato principal: {topFormat} com CTA "{topCta}"</p>
              </div>
            </div>
          </div>

          {/* TIKTOK DETALHADO */}
          {hasTikTok && (
            <div style={{ background:"#0f172a",borderRadius:14,padding:16 }}>
              <p style={{ margin:"0 0 12px",fontSize:13,fontWeight:800,color:"white" }}>🎵 TikTok — dados reais de {comp.name}</p>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:10,marginBottom:10 }}>
                {[
                  { label:"Anúncios",     value:tiktokCount },
                  { label:"Total Views",  value:tiktokViews>1000000?`${(tiktokViews/1000000).toFixed(1)}M`:tiktokViews>1000?`${(tiktokViews/1000).toFixed(0)}k`:tiktokViews },
                  { label:"Formatos",     value:tiktokFormats.join(", ")||"video" },
                ].map(m=>(
                  <div key={m.label} style={{ background:"rgba(255,255,255,.07)",borderRadius:10,padding:"10px 12px",textAlign:"center" }}>
                    <p style={{ margin:0,fontSize:18,fontWeight:900,color:"white" }}>{m.value}</p>
                    <p style={{ margin:0,fontSize:10,color:"#64748b" }}>{m.label}</p>
                  </div>
                ))}
              </div>
              {tiktokData?.insight && <p style={{ margin:0,fontSize:11,color:"#94a3b8",lineHeight:1.6 }}>{tiktokData.insight}</p>}
            </div>
          )}

          {/* GOOGLE ADS */}
          <div style={{ background:"#fafafa",border:"1.5px dashed #e2e8f0",borderRadius:12,padding:14,display:"flex",alignItems:"center",gap:12 }}>
            <div style={{ width:38,height:38,borderRadius:10,background:"#fde8e8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>🔍</div>
            <div>
              <p style={{ margin:0,fontSize:13,fontWeight:700,color:"var(--black)" }}>Google Ads — não coletado ainda</p>
              <p style={{ margin:"2px 0 0",fontSize:11,color:"var(--muted)" }}>
                Configure <strong>Configurações → Google Ads</strong> para incluir essa dimensão na análise.
              </p>
            </div>
          </div>

          {/* BLUE OCEAN */}
          <div style={{ background:"linear-gradient(135deg,#0f172a,#1e3a5f)",borderRadius:14,padding:16 }}>
            <p style={{ margin:"0 0 12px",fontSize:13,fontWeight:800,color:"white" }}>🌊 Blue Ocean — onde {myCompany.name} pode se diferenciar</p>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              {blueOcean.map((item,i)=>(
                <div key={i} style={{ background:"rgba(255,255,255,.06)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(255,255,255,.07)" }}>
                  <div style={{ display:"flex",gap:8,alignItems:"flex-start" }}>
                    <span style={{ fontSize:18,flexShrink:0 }}>{item.icon}</span>
                    <div>
                      <p style={{ margin:0,fontSize:11,fontWeight:800,color:"white",marginBottom:3 }}>{item.title}</p>
                      <p style={{ margin:0,fontSize:11,color:"#94a3b8",lineHeight:1.5 }}>{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* VEREDICTO */}
          <div style={{ background:myWins?"linear-gradient(135deg,#f0fdf4,#dcfce7)":"linear-gradient(135deg,#fef2f2,#fee2e2)", border:`2px solid ${myWins?"#4ade80":"#f87171"}`, borderRadius:14, padding:16, textAlign:"center" }}>
            <p style={{ margin:"0 0 6px",fontSize:22 }}>{myWins?"◆":"💪"}</p>
            <p style={{ margin:"0 0 6px",fontSize:15,fontWeight:900,color:"var(--black)" }}>
              {myWins?`${myCompany.name} tem vantagem de ${diff} pontos`:`${comp.name} lidera por ${diff} pontos — hora de agir`}
            </p>
            <p style={{ margin:"0 0 8px",fontSize:12,color:"var(--muted)" }}>
              {myWins?"Continue monitorando. Amplie a vantagem com consistência nas plataformas.":`Priorize: ${compVantagens.slice(0,2).map(d=>d.label).join(", ")}.`}
            </p>
            <p style={{ margin:0,fontSize:10,color:"#94a3b8" }}>
              Cruzado: Meta {hasMeta?"✓":"—"} · TikTok {hasTikTok?"✓":"—"} · Google Ads — · IA {insights?"✓":"—"}
            </p>
          </div>

          <div style={{ display:"flex",justifyContent:"flex-end" }}>
            <button className="btn btn-md btn-ghost" onClick={onClose}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
