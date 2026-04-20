import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function TikTokIntegration() {
  const [, setLocation] = useLocation();
  const [appId,        setAppId]        = useState("");
  const [appSecret,    setAppSecret]    = useState("");
  const [accessToken,  setAccessToken]  = useState("");
  const [advertiserId, setAdvertiserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  const { data: integrations, refetch } =
    trpc.integrations.list.useQuery(undefined, { retry: false });

  const existing = (integrations as any[])?.find(
    i => i.provider === "tiktok" && i.isActive
  );

  const upsert = trpc.integrations.upsertTikTok.useMutation({
    onSuccess: () => { toast.success("◎ TikTok Ads conectado!"); refetch(); setLoading(false); },
    onError:   (e) => { toast.error("Erro: " + e.message); setLoading(false); },
  });

  const remove = trpc.integrations.delete.useMutation({
    onSuccess: () => { toast.success("Integração removida."); refetch(); },
  });

  const test = trpc.integrations.testTikTok.useMutation({
    onSuccess: (d: any) => toast.success(`◎ Token válido — conta: ${d.name}`),
    onError:   (e)      => toast.error("Token inválido: " + e.message),
  });

  const handleTikTokOAuth = () => {
    setOauthLoading(true);
    const clientKey = (import.meta as any).env?.VITE_TIKTOK_CLIENT_KEY || "";
    const redirectUri = encodeURIComponent(`${window.location.origin}/auth/tiktok/callback`);
    const state = Math.random().toString(36).substring(2);
    sessionStorage.setItem("tiktok_oauth_state", state);
    if (!clientKey) {
      toast.error("VITE_TIKTOK_CLIENT_KEY não configurado.");
      setOauthLoading(false);
      return;
    }
    const url =
      `https://business-api.tiktok.com/portal/auth?app_id=${clientKey}` +
      `&state=${state}&redirect_uri=${redirectUri}&scope=advertiser.management`;
    window.location.href = url;
  };

  const handleSave = () => {
    if (!accessToken)  { toast.error("Access Token obrigatório"); return; }
    if (!advertiserId) { toast.error("Advertiser ID obrigatório"); return; }
    setLoading(true);
    upsert.mutate({ appId, appSecret, accessToken, advertiserId });
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0",
    borderRadius: 10, fontSize: 14, outline: "none", marginBottom: 12,
    background: "#f8fafc",
  };
  const btn = (bg: string, col = "#fff"): React.CSSProperties => ({
    padding: "10px 22px", borderRadius: 10, border: "none", cursor: "pointer",
    background: bg, color: col, fontWeight: 700, fontSize: 14,
  });

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => setLocation("/settings")}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22 }}>←</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🎵 TikTok Ads</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            Conecte sua conta TikTok Business para publicar campanhas.
          </p>
        </div>
        {existing && (
          <span style={{ marginLeft: "auto", background: "#dcfce7", color: "#166534",
            padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
            ✓ Conectado
          </span>
        )}
      </div>

      {existing && (
        <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0",
          borderRadius: 14, padding: 16, marginBottom: 20,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Conta conectada</p>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              Advertiser ID: {existing.accountId}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn("#010101")}
              onClick={() => test.mutate({ provider: "tiktok" })}>Testar</button>
            <button style={btn("#fee2e2", "#b91c1c")}
              onClick={() => remove.mutate({ provider: "tiktok" })}>Remover</button>
          </div>
        </div>
      )}

      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0",
        borderRadius: 16, padding: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>
          {existing ? "Atualizar credenciais" : "Adicionar credenciais"}
        </h3>
        {/* ═══ OAuth automático (recomendado) ═══ */}
        <div style={{
          background: "linear-gradient(135deg,#25F4EE,#FE2C55,#000)",
          borderRadius: 14,
          padding: 20,
          marginBottom: 24,
          boxShadow: "0 4px 20px rgba(254,44,85,0.25)",
        }}>
          <div style={{ color: "white", fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
            ⚡ Conectar com um clique
          </div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
            Autoriza automaticamente o TikTok Business e vincula seu Advertiser ID.
          </div>
          <button
            onClick={handleTikTokOAuth}
            disabled={oauthLoading}
            style={{
              width: "100%", padding: "12px 18px", borderRadius: 10,
              border: "none", background: "white", color: "#000",
              fontWeight: 800, fontSize: 14, cursor: oauthLoading ? "wait" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#000">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.1z"/>
            </svg>
            {oauthLoading ? "Aguardando autorização..." : existing ? "Reconectar com TikTok" : "Conectar com TikTok"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0", fontSize: 11, color: "#94a3b8" }}>
          <div style={{ flex: 1, height: 1, background: "#e2e8f0" }}></div>
          <span>ou configure manualmente</span>
          <div style={{ flex: 1, height: 1, background: "#e2e8f0" }}></div>
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Access Token *</label>
        <input style={inp} placeholder="act.xxx..." value={accessToken}
          onChange={e => setAccessToken(e.target.value)} type="password" />
        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Advertiser ID *</label>
        <input style={inp} placeholder="7xxxxxxxxxxxxxxxxx" value={advertiserId}
          onChange={e => setAdvertiserId(e.target.value)} />
        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>App ID (opcional)</label>
        <input style={inp} value={appId} onChange={e => setAppId(e.target.value)} />
        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>App Secret (opcional)</label>
        <input style={inp} value={appSecret} onChange={e => setAppSecret(e.target.value)} type="password" />
        <button onClick={handleSave} disabled={loading} style={btn("#010101")}>
          {loading ? "Salvando…" : "💾 Salvar integração"}
        </button>
      </div>

      <div style={{ marginTop: 20, background: "#fafafa", border: "1.5px solid #e2e8f0",
        borderRadius: 14, padding: 16 }}>
        <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 13 }}>📖 Como obter as credenciais</p>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#374151", lineHeight: 1.8 }}>
          <li><strong>Access Token</strong>: TikTok for Business → My Apps → Authorization → gerar token.</li>
          <li><strong>Advertiser ID</strong>: TikTok Ads Manager → URL contém o ID de 19 dígitos.</li>
          <li><strong>App ID/Secret</strong>: TikTok Developer Portal → My Apps → App credentials.</li>
        </ol>
      </div>
    </div>
  );
}
