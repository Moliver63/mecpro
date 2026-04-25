/**
 * TikTokIntegration.tsx
 * Conexão via OAuth 2.0 (popup) — igual ao fluxo do Meta Ads
 * Fallback manual para usuários com token de longa duração
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";

const REDIRECT_URI = `${window.location.origin}/auth/tiktok/callback`;

export default function TikTokIntegration() {
  const [, setLocation] = useLocation();
  const [oauthLoading, setOauthLoading] = useState(false);
  const [showManual,   setShowManual]   = useState(false);
  const [accessToken,  setAccessToken]  = useState("");
  const [advertiserId, setAdvertiserId] = useState("");
  const [appId,        setAppId]        = useState("");
  const [appSecret,    setAppSecret]    = useState("");
  const [manualLoading,setManualLoading]= useState(false);

  const { data: integrations, refetch } =
    trpc.integrations.list.useQuery(undefined, { retry: false });

  const existing = (integrations as any[])?.find(
    i => i.provider === "tiktok" && i.isActive
  );

  const getAuthUrl = (trpc as any).integrations?.getTikTokAuthUrl?.useMutation?.();

  const exchangeCode = (trpc as any).integrations?.exchangeTikTokCode?.useMutation?.({
    onSuccess: () => {
      toast.success("✅ TikTok Ads conectado com sucesso!");
      refetch();
      setOauthLoading(false);
    },
    onError: (e: any) => {
      toast.error("Erro ao conectar: " + e.message);
      setOauthLoading(false);
    },
  });

  const upsert = (trpc as any).integrations?.upsertTikTok?.useMutation?.({
    onSuccess: () => { toast.success("◎ TikTok Ads salvo!"); refetch(); setManualLoading(false); setShowManual(false); },
    onError:   (e: any) => { toast.error("Erro: " + e.message); setManualLoading(false); },
  });

  const remove = trpc.integrations.delete.useMutation({
    onSuccess: () => { toast.success("Integração removida."); refetch(); },
  });

  const test = (trpc as any).integrations?.testTikTok?.useMutation?.({
    onSuccess: (d: any) => toast.success(`◎ Token válido — conta: ${d.name || d.advertiserId}`),
    onError:   (e: any) => toast.error("Token inválido: " + e.message),
  });

  // ── OAuth popup flow ────────────────────────────────────────────────────
  async function handleOAuthConnect() {
    setOauthLoading(true);
    try {
      const result = await (getAuthUrl as any)?.mutateAsync({ redirectUri: REDIRECT_URI });
      const url    = result?.url;
      if (!url) throw new Error("Não foi possível obter a URL de autorização. Verifique as configurações do App TikTok.");

      const popup = window.open(url, "tiktok_oauth", "width=620,height=700,left=200,top=80");
      if (!popup) {
        toast.error("Popup bloqueado — permita popups para este site e tente novamente.");
        setOauthLoading(false);
        return;
      }

      const onMsg = async (e: MessageEvent) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type !== "TIKTOK_OAUTH_CODE") return;
        window.removeEventListener("message", onMsg);
        popup.close();

        if (e.data?.error) {
          toast.error("Autorização negada: " + (e.data.error || "acesso recusado"));
          setOauthLoading(false);
          return;
        }

        if (e.data?.code) {
          await (exchangeCode as any)?.mutateAsync({
            code:        e.data.code,
            redirectUri: REDIRECT_URI,
          });
        }
      };

      window.addEventListener("message", onMsg);

      // Timeout de 5 min
      setTimeout(() => {
        window.removeEventListener("message", onMsg);
        if (!popup.closed) popup.close();
        setOauthLoading(false);
      }, 300000);

    } catch (e: any) {
      toast.error(e.message || "Erro ao iniciar OAuth TikTok");
      setOauthLoading(false);
    }
  }

  function handleManualSave() {
    if (!accessToken)  { toast.error("Access Token obrigatório"); return; }
    if (!advertiserId) { toast.error("Advertiser ID obrigatório"); return; }
    setManualLoading(true);
    (upsert as any)?.mutate({ appId, appSecret, accessToken, advertiserId });
  }

  // Estilo base
  const card: React.CSSProperties = {
    background: "white", border: "1.5px solid #e2e8f0",
    borderRadius: 16, padding: 24, marginBottom: 16,
  };
  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0",
    borderRadius: 10, fontSize: 13, outline: "none", marginBottom: 12,
    background: "#f8fafc", boxSizing: "border-box",
  };

  return (
    <Layout>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button onClick={() => setLocation("/settings")}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#64748b" }}>
            ←
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>◼ TikTok Ads</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
              Conecte via OAuth para publicar e gerenciar campanhas TikTok.
            </p>
          </div>
          {existing && (
            <span style={{ background: "#dcfce7", color: "#166534", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
              ✓ Conectado
            </span>
          )}
        </div>

        {/* Status da conta conectada */}
        {existing && (
          <div style={{ ...card, background: "#f0fdf4", borderColor: "#bbf7d0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>◼ TikTok Ads conectado</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {existing.accountId ? `Advertiser ID: ${existing.accountId}` : "Conexão OAuth ativa"}
                </div>
                {existing.updatedAt && (
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    Atualizado: {new Date(existing.updatedAt).toLocaleDateString("pt-BR")}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => (test as any)?.mutate?.({ provider: "tiktok" })}
                  style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Testar
                </button>
                <button onClick={() => remove.mutate({ provider: "tiktok" })}
                  style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fef2f2", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Desconectar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Botão OAuth principal */}
        <div style={card}>
          <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>◼</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800 }}>
              {existing ? "Reconectar TikTok Ads" : "Conectar TikTok Ads"}
            </h3>
            <p style={{ margin: "0 0 24px", fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
              Autorize o MECPro a acessar sua conta TikTok Business.<br/>
              Uma janela segura do TikTok será aberta para você confirmar.
            </p>

            <button
              onClick={handleOAuthConnect}
              disabled={oauthLoading}
              style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                padding: "13px 32px", borderRadius: 12, border: "none",
                background: oauthLoading ? "#94a3b8" : "#010101",
                color: "white", fontSize: 15, fontWeight: 800,
                cursor: oauthLoading ? "not-allowed" : "pointer",
                width: "100%", justifyContent: "center",
                transition: "opacity .15s",
              }}>
              {oauthLoading
                ? <><span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid #fff", borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin .8s linear infinite" }} /> Aguardando autorização...</>
                : <>◼ {existing ? "Reconectar com TikTok" : "Conectar com TikTok"}</>
              }
            </button>
          </div>

          {/* O que o MECPro acessa */}
          <div style={{ marginTop: 16, background: "#f8fafc", borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".05em" }}>
              Permissões solicitadas
            </div>
            {[
              { icon: "📊", label: "Leitura de métricas de campanha" },
              { icon: "🎯", label: "Criação e publicação de anúncios" },
              { icon: "👤", label: "Informações básicas da conta" },
              { icon: "📋", label: "Listagem de ad groups e criativos" },
            ].map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#374151", marginBottom: 5 }}>
                <span>{p.icon}</span> {p.label}
              </div>
            ))}
          </div>
        </div>

        {/* Seção manual colapsável */}
        <div style={card}>
          <button
            onClick={() => setShowManual(v => !v)}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
              🔧 Configuração manual (token de longa duração)
            </div>
            <span style={{ fontSize: 11, color: "#94a3b8", transform: showManual ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</span>
          </button>

          {showManual && (
            <div style={{ marginTop: 16, borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
              <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
                Use esta opção se você já tem um Access Token de longa duração gerado no TikTok Developer Portal.
              </p>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Access Token *</label>
              <input style={inp} placeholder="act.xxx..." value={accessToken} onChange={e => setAccessToken(e.target.value)} type="password" />
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Advertiser ID *</label>
              <input style={inp} placeholder="7xxxxxxxxxxxxxxxxx" value={advertiserId} onChange={e => setAdvertiserId(e.target.value)} />
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>App ID (opcional)</label>
              <input style={inp} value={appId} onChange={e => setAppId(e.target.value)} />
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>App Secret (opcional)</label>
              <input style={inp} value={appSecret} onChange={e => setAppSecret(e.target.value)} type="password" />
              <button onClick={handleManualSave} disabled={manualLoading}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#010101", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {manualLoading ? "Salvando..." : "💾 Salvar token"}
              </button>
            </div>
          )}
        </div>

        {/* Como funciona */}
        <div style={{ ...card, background: "#fafafa" }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 13 }}>📖 Como funciona a conexão OAuth</p>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#374151", lineHeight: 1.9 }}>
            <li>Clique em <strong>"Conectar com TikTok"</strong></li>
            <li>Uma janela do TikTok abre para você fazer login e autorizar</li>
            <li>O MECPro recebe o token automaticamente e fecha a janela</li>
            <li>Pronto — suas campanhas TikTok aparecem no painel</li>
          </ol>
          <p style={{ margin: "12px 0 0", fontSize: 11, color: "#94a3b8" }}>
            O token é renovado automaticamente. Nenhuma senha é armazenada no MECPro.
          </p>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </Layout>
  );
}
