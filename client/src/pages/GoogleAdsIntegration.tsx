import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function GoogleAdsIntegration() {
  const [, setLocation] = useLocation();
  const [clientId, setClientId]         = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [developerToken, setDeveloperToken] = useState("");
  const [customerId, setCustomerId]     = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [loading, setLoading]           = useState(false);

  const { data: integrations, refetch } =
    trpc.integrations.list.useQuery(undefined, { retry: false });

  const existingGoogle = (integrations as any[])?.find(
    (i) => i.provider === "google" && i.isActive
  );

  const upsertGoogle = trpc.integrations.upsertGoogle.useMutation({
    onSuccess: () => {
      toast.success("◎ Google Ads conectado com sucesso!");
      refetch();
      setLoading(false);
    },
    onError: (e) => {
      toast.error("Erro ao salvar: " + e.message);
      setLoading(false);
    },
  });

  const deleteGoogle = trpc.integrations.delete.useMutation({
    onSuccess: () => {
      toast.success("Integração Google Ads removida.");
      refetch();
    },
  });

  const testGoogle = trpc.integrations.testGoogle.useMutation({
    onSuccess: (d: any) => toast.success(`◎ Token válido — conta: ${d.name}`),
    onError: (e) => toast.error("Token inválido: " + e.message),
  });

  // ── OAuth automático ───────────────────────────────────────────────────
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthResult, setOauthResult] = useState<any>(null);

  const getAuthUrl = (trpc as any).integrations?.getGoogleAdsAuthUrl?.useQuery?.(
    { redirectUri: typeof window !== "undefined" ? window.location.origin + "/auth/google/callback" : "" },
    { enabled: false }
  ) ?? { data: null, refetch: () => Promise.resolve({ data: null }) };

  const exchangeCode = (trpc as any).integrations?.exchangeGoogleAdsCode?.useMutation?.({
    onSuccess: (data: any) => {
      setOauthResult(data);
      setOauthLoading(false);
      toast.success(`◎ Google Ads conectado! ${data.customerIds?.length || 0} conta(s) disponível(is).`);
      refetch();
    },
    onError: (e: any) => {
      toast.error("✕ " + e.message);
      setOauthLoading(false);
    },
  }) ?? { mutate: () => {}, isPending: false };

  const handleGoogleOAuth = async () => {
    setOauthLoading(true);
    try {
      const REDIRECT_URI = window.location.origin + "/auth/google/callback";
      const result = await getAuthUrl.refetch();
      const url = (result.data as any)?.url;
      if (!url) throw new Error("Não foi possível gerar a URL de autorização.");

      const popup = window.open(url, "google_oauth", "width=600,height=700,left=200,top=100");
      if (!popup) throw new Error("Popup bloqueado. Permita popups e tente novamente.");

      const listener = (ev: MessageEvent) => {
        if (ev.origin !== window.location.origin) return;
        if (ev.data?.type !== "GOOGLE_ADS_OAUTH_CODE") return;
        window.removeEventListener("message", listener);

        if (ev.data.error) {
          toast.error("✕ Autorização negada: " + ev.data.error);
          setOauthLoading(false);
          return;
        }
        if (ev.data.code) {
          exchangeCode.mutate({ code: ev.data.code, redirectUri: REDIRECT_URI });
        }
      };
      window.addEventListener("message", listener);

      // Timeout de 3 minutos
      setTimeout(() => {
        window.removeEventListener("message", listener);
        if (!popup.closed) popup.close();
        setOauthLoading(false);
      }, 180000);
    } catch (e: any) {
      toast.error("✕ " + e.message);
      setOauthLoading(false);
    }
  };

  const handleSave = () => {
    if (!refreshToken) { toast.error("Refresh Token obrigatório"); return; }
    if (!customerId)    { toast.error("Customer ID obrigatório"); return; }
    if (!developerToken){ toast.error("Developer Token obrigatório"); return; }
    setLoading(true);
    upsertGoogle.mutate({ clientId, clientSecret, developerToken, customerId, refreshToken });
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
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => setLocation("/settings")}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22 }}>←</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🔵 Google Ads</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            Conecte sua conta para publicar campanhas diretamente.
          </p>
        </div>
        {existingGoogle && (
          <span style={{ marginLeft: "auto", background: "#dcfce7", color: "#166534",
            padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
            ✓ Conectado
          </span>
        )}
      </div>

      {/* Status card */}
      {existingGoogle && (
        <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0",
          borderRadius: 14, padding: 16, marginBottom: 20, display: "flex",
          justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Conta conectada</p>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              Customer ID: {existingGoogle.accountId}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn("#1a73e8")}
              onClick={() => testGoogle.mutate({ provider: "google" })}>
              Testar
            </button>
            <button style={btn("#fee2e2", "#b91c1c")}
              onClick={() => deleteGoogle.mutate({ provider: "google" })}>
              Remover
            </button>
          </div>
        </div>
      )}

      {/* Form */}
      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0",
        borderRadius: 16, padding: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>
          {existingGoogle ? "Atualizar credenciais" : "Adicionar credenciais"}
        </h3>

        {/* ═══ OAuth automático (recomendado) ═══ */}
        <div style={{
          background: "linear-gradient(135deg,#4285f4,#1a73e8)",
          borderRadius: 14,
          padding: 20,
          marginBottom: 24,
          boxShadow: "0 4px 20px rgba(26,115,232,0.25)",
        }}>
          <div style={{ color: "white", fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
            ⚡ Conectar com um clique
          </div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
            Autoriza automaticamente: refresh token, developer token e lista de Customer IDs acessíveis.
          </div>
          <button
            onClick={handleGoogleOAuth}
            disabled={oauthLoading}
            style={{
              width: "100%", padding: "12px 18px", borderRadius: 10,
              border: "none", background: "white", color: "#1a73e8",
              fontWeight: 800, fontSize: 14, cursor: oauthLoading ? "wait" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            }}>
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {oauthLoading ? "Aguardando autorização..." : existingGoogle ? "Reconectar com Google" : "Conectar com Google"}
          </button>
          {oauthResult?.customerIds?.length > 0 && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 11, color: "white" }}>
              ◎ {oauthResult.customerIds.length} conta(s) detectada(s) · Principal: <code>{oauthResult.primaryCustomerId}</code>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0", fontSize: 11, color: "#94a3b8" }}>
          <div style={{ flex: 1, height: 1, background: "#e2e8f0" }}></div>
          <span>ou configure manualmente</span>
          <div style={{ flex: 1, height: 1, background: "#e2e8f0" }}></div>
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Developer Token *</label>
        <input style={inp} placeholder="ABcDeFgHiJkL..." value={developerToken}
          onChange={e => setDeveloperToken(e.target.value)} />

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Customer ID (sem traços) *</label>
        <input style={inp} placeholder="1234567890" value={customerId}
          onChange={e => setCustomerId(e.target.value)} />

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Refresh Token *</label>
        <input style={inp} placeholder="1//04xyz..." value={refreshToken}
          onChange={e => setRefreshToken(e.target.value)} type="password" />

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>OAuth Client ID (opcional)</label>
        <input style={inp} placeholder="xxx.apps.googleusercontent.com" value={clientId}
          onChange={e => setClientId(e.target.value)} />

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>OAuth Client Secret (opcional)</label>
        <input style={inp} placeholder="GOCSPX-..." value={clientSecret}
          onChange={e => setClientSecret(e.target.value)} type="password" />

        <button onClick={handleSave} disabled={loading} style={btn("#1a73e8")}>
          {loading ? "Salvando…" : "💾 Salvar integração"}
        </button>
      </div>

      {/* Help */}
      <div style={{ marginTop: 20, background: "#eff6ff", border: "1.5px solid #bfdbfe",
        borderRadius: 14, padding: 16 }}>
        <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 13 }}>📖 Como obter as credenciais</p>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#374151", lineHeight: 1.8 }}>
          <li><strong>Developer Token</strong>: Google Ads → API Center → aplique para acesso.</li>
          <li><strong>Customer ID</strong>: número de 10 dígitos no topo do Google Ads.</li>
          <li><strong>Refresh Token</strong>: gere via OAuth2 Playground ou Google Ads API script.</li>
          <li><strong>Client ID/Secret</strong>: Google Cloud Console → APIs → Credentials.</li>
        </ol>
      </div>
    </div>
  );
}
