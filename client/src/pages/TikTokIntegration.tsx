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

  const getAuthUrl = (trpc as any).integrations?.getTikTokAdsAuthUrl?.useMutation?.();

  const exchangeCode = (trpc as any).integrations?.exchangeTikTokAdsCode?.useMutation?.({
    onSuccess: (d: any) => {
      const n = d?.advertiserIds?.length || 1;
      toast.success(`TikTok Ads conectado! ${n > 1 ? n + " contas liberadas." : "Conta de anúncios salva."}`);
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

  const [diagnostico, setDiagnostico] = useState<any>(null);
  const diagnose = (trpc as any).integrations?.diagnoseTikTok?.useMutation?.({
    onSuccess: (d: any) => setDiagnostico(d),
    onError: (e: any) => toast.error("Não foi possível diagnosticar: " + e.message),
  });

  // ── Pixel por projeto, estado da Events API e guia de instalação ─────────────
  const { data: projetos } = trpc.projects.list.useQuery(undefined, { enabled: !!existing });
  const [projetoPixel, setProjetoPixel] = useState<number | null>(null);
  const [estadoPixel, setEstadoPixel] = useState<any>(null);
  const [guia, setGuia] = useState<string>("");
  const [plataforma, setPlataforma] = useState("custom");
  const [gateway, setGateway] = useState("outro");
  const pixelStatus = (trpc as any).integrations?.tiktokPixelStatus?.useMutation?.({
    onSuccess: (d: any) => { setEstadoPixel(d); setGuia(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const setPixel = (trpc as any).integrations?.setTikTokPixel?.useMutation?.({
    onSuccess: (d: any) => { toast.success(d.pixelId ? "Pixel salvo no projeto." : "Pixel removido do projeto."); if (projetoPixel) pixelStatus?.mutate({ projectId: projetoPixel }); },
    onError: (e: any) => toast.error(e.message),
  });
  const guiaMut = (trpc as any).integrations?.tiktokInstallGuide?.useMutation?.({
    onSuccess: (d: any) => setGuia(d.texto),
    onError: (e: any) => toast.error(e.message),
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
      const oauthState: string = result?.state;
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
            authCode: e.data.code,
            state:    e.data.state || oauthState,
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
                <button onClick={() => (diagnose as any)?.mutate?.()} disabled={(diagnose as any)?.isPending}
                  style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  {(diagnose as any)?.isPending ? "Diagnosticando..." : "Diagnosticar permissões"}
                </button>
                <button onClick={() => remove.mutate({ provider: "tiktok" })}
                  style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fef2f2", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Desconectar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Diagnóstico de permissões (somente leitura) */}
        {existing && diagnostico && (
          <div style={{ ...card, borderColor: diagnostico.problemas?.length ? "#fcd34d" : "#bbf7d0" }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Diagnóstico de permissões</div>
            <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
              {(diagnostico.capacidades || []).map((c: any) => (
                <div key={c.endpoint} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "#334155" }}>
                  <span style={{ color: c.ok ? "#16a34a" : "#dc2626", fontWeight: 800, minWidth: 16 }}>{c.ok ? "✓" : "✕"}</span>
                  <span><strong>{c.nome}</strong>{c.problema ? ` — ${c.problema.mensagem}` : ""}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: "#334155", marginBottom: 10 }}>
              Pronto para tráfego: <strong>{diagnostico.pronto?.trafego ? "sim" : "não"}</strong> · Pronto para vendas: <strong>{diagnostico.pronto?.vendas ? "sim" : "não"}</strong>
            </div>
            {(diagnostico.problemas || []).map((p: any, i: number) => (
              <div key={i} style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>{p.mensagem}</div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#78350f", lineHeight: 1.55 }}>
                  {(p.instrucoes || []).map((t: string, j: number) => <li key={j}>{t}</li>)}
                </ol>
              </div>
            ))}
            {diagnostico.problemas?.some((p: any) => p.deAutorizacao) && (
              <button onClick={handleOAuthConnect} disabled={oauthLoading}
                style={{ marginTop: 4, padding: "10px 18px", borderRadius: 10, border: "none", background: "#010101", color: "white", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                Reconectar e aprovar as permissões
              </button>
            )}
          </div>
        )}

        {/* TikTok Pixel e Events API por projeto */}
        {existing && (
          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>TikTok Pixel e Events API</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
              Campanhas de vendas precisam de um Pixel com o evento de compra. Escolha o Pixel do projeto, veja o que ele recebeu e gere o guia de instalação para o site do cliente. O token da Events API fica no servidor do site; o MECPro nunca o guarda.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <select value={projetoPixel ?? ""} onChange={(e) => { setProjetoPixel(e.target.value ? Number(e.target.value) : null); setEstadoPixel(null); setGuia(""); }}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, minWidth: 220 }}>
                <option value="">Escolha o projeto…</option>
                {(projetos || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button disabled={!projetoPixel || pixelStatus?.isPending} onClick={() => projetoPixel && pixelStatus?.mutate({ projectId: projetoPixel })}
                style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#010101", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {pixelStatus?.isPending ? "Verificando…" : "Ver estado do Pixel"}
              </button>
            </div>
            {estadoPixel && (
              <div style={{ fontSize: 12.5, color: "#334155" }}>
                <div style={{ fontWeight: 800, color: estadoPixel.nivel === "ok" ? "#16a34a" : estadoPixel.nivel === "atencao" ? "#b45309" : "#dc2626", marginBottom: 6 }}>
                  {estadoPixel.nivel === "ok" ? "Tudo certo" : estadoPixel.nivel === "atencao" ? "Atenção" : "Bloqueado"}
                </div>
                <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
                  {(estadoPixel.pixels || []).map((p: any) => (
                    <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span><strong>{p.nome}</strong> ({p.id}) · {p.temCompra ? "tem evento de compra" : "sem evento de compra"}{p.disparos30d !== null ? ` · ${p.disparos30d} compras em 30 dias` : ""}</span>
                      {estadoPixel.pixelSalvo === p.id
                        ? <span style={{ color: "#16a34a", fontWeight: 700 }}>salvo no projeto</span>
                        : <button onClick={() => projetoPixel && setPixel?.mutate({ projectId: projetoPixel, pixelId: p.id })} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #cbd5e1", background: "white", fontSize: 12, cursor: "pointer" }}>Usar neste projeto</button>}
                    </div>
                  ))}
                </div>
                {(estadoPixel.eventosRecebidos || []).length > 0 && (
                  <div style={{ marginBottom: 10 }}>Eventos recebidos em 30 dias: {estadoPixel.eventosRecebidos.map((x: any) => `${x.evento} ${x.total}`).join(" · ")}</div>
                )}
                {(estadoPixel.problemas || []).map((p: any, i: number) => (
                  <div key={i} style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, color: "#92400e", marginBottom: 6 }}>{p.mensagem}</div>
                    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#78350f", lineHeight: 1.55 }}>{(p.instrucoes || []).map((t: string, j: number) => <li key={j}>{t}</li>)}</ol>
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: "#64748b", marginBottom: 10 }}>{(estadoPixel.limites || []).join(" ")}</div>
                {estadoPixel.pixelSalvo && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12.5 }}>
                      {["custom", "wordpress", "shopify", "nuvemshop", "hotmart", "outra"].map((v) => <option key={v} value={v}>{v === "custom" ? "Site próprio" : v}</option>)}
                    </select>
                    <select value={gateway} onChange={(e) => setGateway(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12.5 }}>
                      {["asaas", "stripe", "mercadopago", "hotmart", "outro"].map((v) => <option key={v} value={v}>{v === "outro" ? "Outro pagamento" : v}</option>)}
                    </select>
                    <button onClick={() => projetoPixel && guiaMut?.mutate({ projectId: projetoPixel, plataforma, gateway })} disabled={guiaMut?.isPending}
                      style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #010101", background: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      Gerar guia de instalação
                    </button>
                  </div>
                )}
              </div>
            )}
            {guia && (
              <div style={{ marginTop: 12 }}>
                <button onClick={() => { navigator.clipboard?.writeText(guia); toast.success("Guia copiado."); }} style={{ marginBottom: 6, padding: "5px 12px", borderRadius: 6, border: "1px solid #cbd5e1", background: "white", fontSize: 12, cursor: "pointer" }}>Copiar guia</button>
                <pre style={{ maxHeight: 360, overflow: "auto", background: "#0f172a", color: "#e2e8f0", padding: 12, borderRadius: 10, fontSize: 11.5, whiteSpace: "pre-wrap" }}>{guia}</pre>
              </div>
            )}
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
              { icon: "📈", label: "Pixel e eventos de conversão (Measurement), para campanhas de vendas" },
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
