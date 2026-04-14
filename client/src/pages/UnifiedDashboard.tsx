import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ── helpers ───────────────────────────────────────────────────────────────────
const R = (v?: number) => v == null ? "—" : `R$ ${v.toFixed(2)}`;
const N = (v?: number | string) => {
  const n = Number(v || 0);
  return n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M`
       : n >= 1_000     ? `${(n/1_000).toFixed(1)}K`
       : String(n);
};
const PCT = (v?: string | number) => v == null ? "—" : `${(Number(v)*100).toFixed(2)}%`;

// ── types ─────────────────────────────────────────────────────────────────────
interface PlatformMetrics {
  platform:     "meta" | "google" | "tiktok";
  connected:    boolean;
  campaigns:    number;
  spend:        number;
  impressions:  number;
  clicks:       number;
  cpc:          number;
  cpm:          number;
  ctr:          number;
  conversions?: number;
  roas?:        number;
  error?:       string;
  loading:      boolean;
}

const PLATFORM_META: Omit<PlatformMetrics,"loading"> = {
  platform:"meta", connected:false, campaigns:0,
  spend:0, impressions:0, clicks:0, cpc:0, cpm:0, ctr:0,
};
const PLATFORM_GOOGLE: Omit<PlatformMetrics,"loading"> = {
  platform:"google", connected:false, campaigns:0,
  spend:0, impressions:0, clicks:0, cpc:0, cpm:0, ctr:0,
};
const PLATFORM_TIKTOK: Omit<PlatformMetrics,"loading"> = {
  platform:"tiktok", connected:false, campaigns:0,
  spend:0, impressions:0, clicks:0, cpc:0, cpm:0, ctr:0,
};

const COLORS: Record<string,{main:string,light:string,icon:string}> = {
  meta:   { main:"#1877f2", light:"#eff6ff", icon:"📘" },
  google: { main:"#1a73e8", light:"#eff6ff", icon:"🔵" },
  tiktok: { main:"#010101", light:"#f8fafc", icon:"🎵" },
};

// ── MetricCard ────────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, icon, color }:
  { label:string; value:string; sub?:string; icon:string; color:string }) {
  return (
    <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:12,
      padding:"14px 16px", flex:1, minWidth:110 }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
        <span style={{ fontSize:18 }}>{icon}</span>
        <span style={{ fontSize:11, color:"#64748b", fontWeight:600 }}>{label}</span>
      </div>
      <p style={{ margin:0, fontWeight:800, fontSize:20, color }}>{value}</p>
      {sub && <p style={{ margin:0, fontSize:10, color:"#94a3b8" }}>{sub}</p>}
    </div>
  );
}

// ── PlatformBlock ─────────────────────────────────────────────────────────────
function PlatformBlock({ data, onRefresh }: { data: PlatformMetrics; onRefresh: () => void }) {
  const c = COLORS[data.platform];
  return (
    <div style={{ background:"#fff", border:`2px solid ${data.connected ? c.main+"33" : "#e2e8f0"}`,
      borderRadius:18, padding:24, marginBottom:20 }}>
      {/* header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:28 }}>{c.icon}</span>
          <div>
            <h3 style={{ margin:0, fontSize:16, fontWeight:800, textTransform:"capitalize" }}>
              {data.platform === "meta" ? "Meta Ads (Facebook/Instagram)" :
               data.platform === "google" ? "Google Ads" : "TikTok Ads"}
            </h3>
            <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20,
              background: data.connected ? "#dcfce7" : "#fef9c3",
              color:      data.connected ? "#166534" : "#713f12" }}>
              {data.connected ? "✓ Conectado" : "⚠ Não conectado"}
            </span>
          </div>
        </div>
        {data.connected && (
          <button onClick={onRefresh} disabled={data.loading}
            style={{ background:"none", border:"1.5px solid #e2e8f0", borderRadius:8,
              padding:"6px 14px", cursor:"pointer", fontSize:12, fontWeight:600, color:"#374151" }}>
            {data.loading ? "⏳" : "🔄 Atualizar"}
          </button>
        )}
      </div>

      {/* not connected */}
      {!data.connected && (
        <div style={{ textAlign:"center", padding:"20px 0", color:"#94a3b8" }}>
          <p style={{ margin:0, fontSize:14 }}>Conecte sua conta em <strong>Configurações</strong> para ver métricas.</p>
        </div>
      )}

      {/* loading */}
      {data.connected && data.loading && (
        <div style={{ textAlign:"center", padding:"20px 0", color:"#64748b" }}>
          <p style={{ margin:0 }}>⏳ Carregando métricas…</p>
        </div>
      )}

      {/* error */}
      {data.connected && !data.loading && data.error && (
        <div style={{ background:"#fef2f2", border:"1.5px solid #fecaca", borderRadius:10,
          padding:12, color:"#b91c1c", fontSize:13 }}>
          ⚠️ {data.error}
        </div>
      )}

      {/* metrics */}
      {data.connected && !data.loading && !data.error && (
        <div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const, marginBottom:12 }}>
            <MetricCard label="Campanhas"   value={String(data.campaigns)} icon="📊" color={c.main} />
            <MetricCard label="Gasto Total" value={R(data.spend)}          icon="💰" color="#dc2626" />
            <MetricCard label="Impressões"  value={N(data.impressions)}    icon="👁️" color="#7c3aed" />
            <MetricCard label="Cliques"     value={N(data.clicks)}         icon="👆" color="#0891b2" />
          </div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const }}>
            <MetricCard label="CPC médio" value={R(data.cpc)}         icon="💳" color="#059669" />
            <MetricCard label="CPM"       value={R(data.cpm)}         icon="📣" color="#0e7490" />
            <MetricCard label="CTR"       value={PCT(data.ctr)}       icon="📈" color="#7c3aed" />
            {data.roas != null && (
              <MetricCard label="ROAS" value={`${data.roas.toFixed(2)}x`} icon="🎯" color="#16a34a" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function UnifiedDashboard() {
  const [, setLocation] = useLocation();
  const [meta,   setMeta]   = useState<PlatformMetrics>({...PLATFORM_META,   loading:false});
  const [google, setGoogle] = useState<PlatformMetrics>({...PLATFORM_GOOGLE, loading:false});
  const [tiktok, setTikTok] = useState<PlatformMetrics>({...PLATFORM_TIKTOK, loading:false});
  const [loaded,  setLoaded]  = useState(false);
  const [period,  setPeriod]  = useState<"7d"|"30d"|"90d">("30d");

  // ── tRPC mutations ────────────────────────────────────────────────────────
  const metaMetrics   = trpc.unified.metaMetrics.useMutation();
  const googleMetrics = trpc.unified.googleMetrics.useMutation();
  const tiktokMetrics = trpc.unified.tiktokMetrics.useMutation();

  const load = async () => {
    setLoaded(true);

    // Meta
    setMeta(f  => ({...f, loading:true}));
    metaMetrics.mutateAsync({ period }).then(d => {
      const dd = d as any;
      setMeta({ platform:"meta", connected:true, loading:false,
        campaigns: dd.campaigns, spend: dd.spend, impressions: dd.impressions,
        clicks: dd.clicks, cpc: dd.cpc, cpm: dd.cpm, ctr: dd.ctr, roas: dd.roas });
    }).catch(e => setMeta(f => ({...f, loading:false, connected:true, error: e.message})));

    // Google
    setGoogle(f => ({...f, loading:true}));
    googleMetrics.mutateAsync({ period }).then(d => {
      const dd = d as any;
      setGoogle({ platform:"google", connected:true, loading:false,
        campaigns: dd.campaigns, spend: dd.spend, impressions: dd.impressions,
        clicks: dd.clicks, cpc: dd.cpc, cpm: dd.cpm, ctr: dd.ctr });
    }).catch(e => setGoogle(f => ({...f, loading:false, connected:e.message?.includes("não configurada") ? false : true, error: e.message?.includes("não configurada") ? undefined : e.message})));

    // TikTok
    setTikTok(f => ({...f, loading:true}));
    tiktokMetrics.mutateAsync({ period }).then(d => {
      const dd = d as any;
      setTikTok({ platform:"tiktok", connected:true, loading:false,
        campaigns: dd.campaigns, spend: dd.spend, impressions: dd.impressions,
        clicks: dd.clicks, cpc: dd.cpc, cpm: dd.cpm, ctr: dd.ctr });
    }).catch(e => setTikTok(f => ({...f, loading:false, connected:e.message?.includes("não configurada") ? false : true, error: e.message?.includes("não configurada") ? undefined : e.message})));
  };

  useEffect(() => { load(); }, [period]);

  // ── totals ────────────────────────────────────────────────────────────────
  const allPlatforms = [meta, google, tiktok];
  const totalSpend   = allPlatforms.reduce((s,p) => s + (p.connected && !p.error ? p.spend : 0), 0);
  const totalImpr    = allPlatforms.reduce((s,p) => s + (p.connected && !p.error ? p.impressions : 0), 0);
  const totalClicks  = allPlatforms.reduce((s,p) => s + (p.connected && !p.error ? p.clicks : 0), 0);
  const totalCamps   = allPlatforms.reduce((s,p) => s + (p.connected && !p.error ? p.campaigns : 0), 0);
  const avgCPC       = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCTR       = totalImpr   > 0 ? totalClicks / totalImpr  : 0;

  return (
    <div style={{ maxWidth:900, margin:"0 auto", padding:32 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => setLocation("/dashboard")}
            style={{ background:"none", border:"none", cursor:"pointer", fontSize:22 }}>←</button>
          <div>
            <h2 style={{ margin:0, fontSize:24, fontWeight:800 }}>📊 Dashboard Unificado</h2>
            <p style={{ margin:0, fontSize:13, color:"#64748b" }}>
              Meta Ads · Google Ads · TikTok Ads — visão consolidada
            </p>
          </div>
        </div>
        {/* Period selector */}
        <div style={{ display:"flex", gap:6, background:"#f1f5f9", borderRadius:10, padding:4 }}>
          {(["7d","30d","90d"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ padding:"6px 14px", borderRadius:8, border:"none", cursor:"pointer",
                fontWeight:700, fontSize:12,
                background: period===p ? "#1a73e8" : "transparent",
                color:      period===p ? "#fff"    : "#64748b" }}>
              {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "90 dias"}
            </button>
          ))}
        </div>
      </div>

      {/* Consolidated summary */}
      <div style={{ background:"linear-gradient(135deg,#1a73e8 0%,#7c3aed 100%)",
        borderRadius:18, padding:24, marginBottom:28, color:"#fff" }}>
        <h3 style={{ margin:"0 0 16px", fontSize:15, fontWeight:700, opacity:.85 }}>
          🌐 Consolidado — Todas as plataformas
        </h3>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" as const }}>
          {[
            { label:"Total Gasto",   value:R(totalSpend),       icon:"💰" },
            { label:"Impressões",    value:N(totalImpr),        icon:"👁️" },
            { label:"Cliques",       value:N(totalClicks),      icon:"👆" },
            { label:"Campanhas",     value:String(totalCamps),  icon:"📊" },
            { label:"CPC médio",     value:R(avgCPC),           icon:"💳" },
            { label:"CTR médio",     value:PCT(avgCTR),         icon:"📈" },
          ].map(m => (
            <div key={m.label} style={{ flex:1, minWidth:120, background:"rgba(255,255,255,.15)",
              borderRadius:12, padding:"12px 16px" }}>
              <p style={{ margin:0, fontSize:11, opacity:.8 }}>{m.icon} {m.label}</p>
              <p style={{ margin:0, fontWeight:800, fontSize:20 }}>{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Platform blocks */}
      <PlatformBlock data={meta}   onRefresh={load} />
      <PlatformBlock data={google} onRefresh={load} />
      <PlatformBlock data={tiktok} onRefresh={load} />

      {/* Quick links */}
      <div style={{ display:"flex", gap:12, flexWrap:"wrap" as const, marginTop:8 }}>
        <button onClick={() => setLocation("/meta-campaigns")}
          style={{ flex:1, background:"#eff6ff", border:"1.5px solid #bfdbfe",
            borderRadius:12, padding:14, cursor:"pointer", fontWeight:700, fontSize:13, color:"#1e40af" }}>
          📘 Gerenciar Meta Ads →
        </button>
        <button onClick={() => setLocation("/google-campaigns")}
          style={{ flex:1, background:"#eff6ff", border:"1.5px solid #bfdbfe",
            borderRadius:12, padding:14, cursor:"pointer", fontWeight:700, fontSize:13, color:"#1e40af" }}>
          🔵 Gerenciar Google Ads →
        </button>
        <button onClick={() => setLocation("/tiktok-campaigns")}
          style={{ flex:1, background:"#f8fafc", border:"1.5px solid #e2e8f0",
            borderRadius:12, padding:14, cursor:"pointer", fontWeight:700, fontSize:13, color:"#010101" }}>
          🎵 Gerenciar TikTok Ads →
        </button>
      </div>
    </div>
  );
}
