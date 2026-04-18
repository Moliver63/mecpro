import { useState } from "react";
import WhatsAppField from "@/components/WhatsAppField";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ── Tipos ──────────────────────────────────────────────────────────────────
interface ApiIntegration {
  id: number;
  userId: number;
  provider: string;
  accessToken?: string | null;
  adAccountId?: string | null;
  appId?: string | null;
  appSecret?: string | null;
  isActive: number;
  tokenExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DiagResult {
  ok:           boolean;
  name:         string;
  adAccountId:  string;
  tokenExpiry:  string;
  tokenExpired: boolean;
  permissions: {
    ads_read:    boolean;
    ads_library: boolean;
    pages_read:  boolean;
    all:         string[];
  };
  adsLibraryTest: {
    ok:     boolean;
    pageId: string;
    found:  number;
    error:  string | null;
  };
}

interface TestResult {
  name: string;
  adAccountId: string;
  ok: boolean;
}

// ── Componente de campo de formulário ──────────────────────────────────────
function Field({
  label, hint, hintLink, hintLinkText, placeholder, value, onChange, type = "text", optional = false,
}: {
  label: string; hint?: string; hintLink?: string; hintLinkText?: string;
  placeholder: string; value: string; onChange: (v: string) => void;
  type?: string; optional?: boolean;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>
        {label} {optional && <span style={{ fontWeight: 400, color: "var(--muted)" }}>(opcional)</span>}
        {!optional && <span style={{ color: "#dc2626" }}> *</span>}
      </label>
      <input
        className="input"
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
      />
      {hint && (
        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          👉 {hintLink
            ? <><a href={hintLink} target="_blank" rel="noreferrer" style={{ color: "#1877f2" }}>{hintLinkText}</a> — {hint}</>
            : hint}
        </p>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────
export default function MetaIntegration() {
  const [, setLocation] = useLocation();

  const { data: integrations, refetch, isLoading } = trpc.integrations.list.useQuery();

  const upsert = trpc.integrations.upsertMeta.useMutation({
    onSuccess: () => { toast.success("◎ Integração Meta salva com sucesso!"); refetch(); },
    onError:   (e) => toast.error(`✕ Erro ao salvar: ${e.message}`),
  });

  const remove = trpc.integrations.delete.useMutation({
    onSuccess: () => { toast.success("Integração removida."); refetch(); },
    onError:   (e) => toast.error(`✕ Erro ao remover: ${e.message}`),
  });

  const [diagResult, setDiagResult] = useState<DiagResult | null>(null);

  const testMeta = trpc.integrations.testMeta.useMutation({
    onSuccess: (d: any) => {
      setDiagResult(d);
      const adsOk = d.adsLibraryTest?.ok && d.adsLibraryTest?.found >= 0;
      const permsOk = d.permissions?.ads_read;
      if (adsOk && permsOk) {
        toast.success(`◎ Conexão OK — ${d.name} · Ads Library funcionando!`);
      } else if (!permsOk) {
        toast.error("⚠️ Token sem permissão ads_read — veja o diagnóstico abaixo");
      } else if (d.adsLibraryTest?.error) {
        toast.error(`⚠️ Ads Library: ${d.adsLibraryTest.error}`);
      } else {
        toast.success(`◎ Token OK — ${d.name}`);
      }
    },
    onError: (e) => toast.error(`✕ Token inválido: ${e.message}`),
  });

  const getMetaAuthUrl   = (trpc as any).integrations?.getMetaAuthUrl?.useMutation?.();
  const exchangeMetaCode = (trpc as any).integrations?.exchangeMetaCode?.useMutation?.({
    onSuccess: (data: any) => {
      toast.success(`◎ Conectado como ${data.userName}! ${data.adAccounts?.length || 0} conta(s) de anúncio.`);
      setOauthResult(data);
      setOauthLoading(false);
      refetch?.();
    },
    onError: (e: any) => { toast.error("✕ " + e.message); setOauthLoading(false); },
  });
  const exchangeToken = trpc.integrations.exchangeToken.useMutation({
    onSuccess: (d: any) => {
      toast.success(`◎ Token longo gerado! Válido por ${d.expiresInDays} dias (até ${new Date(d.expiresAt).toLocaleDateString("pt-BR")})`);
      refetch();
    },
    onError: (e) => toast.error(`✕ ${e.message}`),
  });

  const existing = (integrations as ApiIntegration[] | undefined)?.find(i => i.provider === "meta");

  const [accessToken, setAccessToken] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [appId,       setAppId]       = useState("");
  const [appSecret,   setAppSecret]   = useState("");
  const [saving,       setSaving]      = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthResult,  setOauthResult]  = useState<any>(null);
  const [waPhone,     setWaPhone]     = useState((existing as any)?.whatsappPhone || "");
  const [testing,     setTesting]     = useState(false);

  // Handler OAuth Facebook
  const handleFacebookOAuth = async () => {
    setOauthLoading(true);
    try {
      const REDIRECT_URI = window.location.origin + "/auth/meta/callback";
      const result = await (getMetaAuthUrl as any)?.mutateAsync({ redirectUri: REDIRECT_URI });
      if (!result?.url) throw new Error("Não foi possível gerar a URL de autorização.");

      const popup = window.open(result.url, "fb_oauth", "width=620,height=700,left=200,top=80");
      if (!popup) { toast.error("Popup bloqueado — permita popups para este site."); setOauthLoading(false); return; }

      const onMsg = async (e: MessageEvent) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type !== "META_OAUTH_CODE") return;
        window.removeEventListener("message", onMsg);
        popup.close();
        if (!e.data.code) { toast.error("Autorização cancelada."); setOauthLoading(false); return; }
        await (exchangeMetaCode as any)?.mutateAsync({ code: e.data.code, redirectUri: REDIRECT_URI });
      };
      window.addEventListener("message", onMsg);
      setTimeout(() => { window.removeEventListener("message", onMsg); if (!popup.closed) popup.close(); setOauthLoading(false); }, 300000);

    } catch (e: any) { toast.error(e.message); setOauthLoading(false); }
  };

  async function handleSave() {
    if (!accessToken.trim()) { toast.error("Access Token é obrigatório"); return; }
    if (!adAccountId.trim()) { toast.error("ID da Conta de Anúncios é obrigatório"); return; }
    setSaving(true);
    try {
      await upsert.mutateAsync({
        accessToken: accessToken.trim(),
        adAccountId: adAccountId.trim(),
        appId:       appId.trim()     || undefined,
        appSecret:   appSecret.trim() || undefined,
      });
      setAccessToken(""); setAdAccountId(""); setAppId(""); setAppSecret("");
    } catch (err: any) {
      // erro já tratado pelo onError do mutation, mas loga para debug
      console.error("[MetaIntegration] save error:", err?.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try { await testMeta.mutateAsync(); }
    catch (err: any) { console.error("[MetaIntegration] test error:", err?.message); }
    finally { setTesting(false); }
  }

  async function handleRemove() {
    if (!confirm("Tem certeza que deseja remover a integração Meta Ads?")) return;
    try { await remove.mutateAsync({ provider: "meta" }); }
    catch (err: any) { console.error("[MetaIntegration] remove error:", err?.message); }
  }

  // Token expira em breve? (menos de 7 dias)
  const tokenExpiringSoon = existing?.tokenExpiresAt
    ? new Date(existing.tokenExpiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
    : false;

  return (
    <Layout>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>

        {/* Breadcrumb */}
        <button onClick={() => setLocation("/settings")}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--muted)", marginBottom: 20, display: "block" }}>
          ← Configurações
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
            📘
          </div>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: "var(--black)", marginBottom: 2 }}>
              Meta Ads
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              Publique campanhas geradas pela IA direto no Gerenciador de Anúncios
            </p>
          </div>
        </div>

        {/* Status atual */}
        {isLoading ? (
          <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 14, padding: 16, marginBottom: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            Verificando integração...
          </div>
        ) : existing ? (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 14, padding: 18, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#15803d", marginBottom: 6 }}>◎ Meta Ads conectado</p>
                <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>
                  Conta: <strong>{existing.adAccountId || "—"}</strong>
                </p>
                {existing.tokenExpiresAt && (
                  <p style={{ fontSize: 12, color: tokenExpiringSoon ? "#dc2626" : "var(--muted)" }}>
                    {tokenExpiringSoon ? "⚠️ Token expira em breve — atualize" : `Token válido até ${new Date(existing.tokenExpiresAt).toLocaleDateString("pt-BR")}`}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleTest} disabled={testing}
                  style={{ fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "white", cursor: testing ? "not-allowed" : "pointer", opacity: testing ? 0.7 : 1 }}>
                  {testing ? "⏳ Testando..." : "🔗 Testar conexão"}
                </button>
                <button onClick={() => exchangeToken.mutate()} disabled={exchangeToken.isPending}
                  style={{ fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 8, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#15803d", cursor: exchangeToken.isPending ? "not-allowed" : "pointer", opacity: exchangeToken.isPending ? 0.7 : 1 }}>
                  {exchangeToken.isPending ? "⏳ Gerando..." : "🔄 Token longo (60 dias)"}
                </button>
                <button onClick={handleRemove}
                  style={{ fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", cursor: "pointer" }}>
                  Remover
                </button>
              </div>

              {/* WhatsApp vinculado */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #dcfce7" }}>
                <WhatsAppField
                  label="WhatsApp para Anúncios"
                  value={waPhone}
                  onChange={setWaPhone}
                  onSaved={(phone) => setWaPhone(phone)}
                  compact
                />
              </div>

              {/* Painel de diagnóstico — aparece após testar */}
              {diagResult && (
                <div style={{ marginTop: 14, background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                  <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, color: "var(--black)" }}>🔍 Diagnóstico da integração</p>

                  {/* Identidade */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#dcfce7", color: "#166534" }}>
                      ◎ Conta: {diagResult.name}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: diagResult.tokenExpired ? "#fee2e2" : "#dcfce7", color: diagResult.tokenExpired ? "#dc2626" : "#166534" }}>
                      {diagResult.tokenExpired ? "✕" : "◎"} Token válido até {diagResult.tokenExpiry}
                    </span>
                  </div>

                  {/* Permissões */}
                  <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Permissões</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {[
                      { label: "ads_read",    ok: diagResult.permissions.ads_read,    required: true },
                      { label: "ads_library", ok: diagResult.permissions.ads_library, required: false },
                      { label: "pages_read",  ok: diagResult.permissions.pages_read,  required: false },
                    ].map(p => (
                      <span key={p.label} style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: p.ok ? "#dcfce7" : p.required ? "#fee2e2" : "#fef9c3", color: p.ok ? "#166534" : p.required ? "#dc2626" : "#92400e" }}>
                        {p.ok ? "◎" : "✕"} {p.label}{p.required && !p.ok ? " (obrigatório!)" : ""}
                      </span>
                    ))}
                  </div>

                  {/* Teste Ads Library */}
                  <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Teste Ads Library API</p>
                  <div style={{ background: diagResult.adsLibraryTest.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${diagResult.adsLibraryTest.ok ? "#86efac" : "#fca5a5"}`, borderRadius: 10, padding: "10px 14px" }}>
                    {diagResult.adsLibraryTest.ok ? (
                      <p style={{ margin: 0, fontSize: 12, color: "#166534" }}>
                        ◎ Ads Library API funcionando — {diagResult.adsLibraryTest.found} anúncio(s) encontrado(s) para Page ID {diagResult.adsLibraryTest.pageId}
                        {diagResult.adsLibraryTest.found === 0 && " (página sem anúncios ativos ou visibilidade restrita)"}
                      </p>
                    ) : (
                      <div>
                        <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#dc2626" }}>✕ Ads Library API não funcionando</p>
                        <p style={{ margin: 0, fontSize: 11, color: "#991b1b" }}>{diagResult.adsLibraryTest.error}</p>
                        {diagResult.adsLibraryTest.error?.includes("10") && (
                          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#92400e", background: "#fef9c3", padding: "6px 10px", borderRadius: 6 }}>
                            ⚠️ Código 10: Seu app Meta não tem acesso à Ads Library API.
                            Solicite em <strong>developers.facebook.com → seu App → Ads Library API</strong>.
                          </p>
                        )}
                        {diagResult.adsLibraryTest.error?.includes("190") && (
                          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#92400e", background: "#fef9c3", padding: "6px 10px", borderRadius: 6 }}>
                            ⚠️ Código 190: Token expirado. Gere um novo token em <strong>developers.facebook.com/tools/explorer</strong>.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Aviso se falta permissão crítica */}
                  {!diagResult.permissions.ads_read && (
                    <div style={{ marginTop: 10, background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px" }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#92400e" }}>
                        ⚠️ Permissão <code>ads_read</code> ausente — sem ela a Ads Library API não funciona.
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: "#a16207" }}>
                        Gere um novo token em <strong>developers.facebook.com/tools/explorer</strong> e marque o escopo <code>ads_read</code>.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14, padding: 14, marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: "#991b1b" }}>
              ⚠️ Meta Ads não conectado — você não poderá publicar campanhas sem configurar a integração.
            </p>
          </div>
        )}

        {/* Formulário */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 16 }}>
            {existing ? "Atualizar credenciais" : "Conectar conta Meta Ads"}
          </p>

          {/* ── Botão OAuth Facebook ── */}
          <div style={{ marginBottom: 24 }}>
            <button
              onClick={handleFacebookOAuth}
              disabled={oauthLoading}
              style={{
                width: "100%", padding: "14px 20px", borderRadius: 12, border: "none",
                background: oauthLoading ? "#94a3b8" : "linear-gradient(135deg,#1877f2,#0d5bd1)",
                color: "white", fontWeight: 800, fontSize: 15, cursor: oauthLoading ? "wait" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                boxShadow: oauthLoading ? "none" : "0 4px 20px rgba(24,119,242,0.4)",
                transition: "all .2s",
              }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              {oauthLoading ? "Aguardando autorização..." : existing ? "Reconectar com Facebook" : "Conectar com Facebook"}
            </button>
            <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 8 }}>
              Autoriza automaticamente: token, contas de anúncio e páginas vinculadas
            </p>
          </div>

          {/* Resultado do OAuth */}
          {oauthResult && (
            <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#15803d", marginBottom: 10 }}>
                ◎ Conectado como <strong>{oauthResult.userName}</strong>
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>Contas de anúncio</div>
                  {oauthResult.adAccounts?.map((acc: any) => (
                    <div key={acc.id} style={{ fontSize: 12, color: "#0f172a", marginBottom: 2 }}>
                      📘 {acc.name} <span style={{ color: "#64748b" }}>({acc.id})</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>Páginas</div>
                  {oauthResult.pages?.slice(0,3).map((pg: any) => (
                    <div key={pg.id} style={{ fontSize: 12, color: "#0f172a", marginBottom: 2 }}>
                      📄 {pg.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>ou configure manualmente</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          {/* Alerta de permissões obrigatórias */}
          <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>⚠️ Permissões obrigatórias no token</p>
            <p style={{ fontSize: 12, color: "#78350f", marginBottom: 8 }}>
              O token precisa ter <strong>TODOS</strong> os escopos abaixo. Sem eles a análise de concorrentes e publicação de campanhas falham.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {["ads_read", "ads_management", "read_insights", "pages_read_engagement", "pages_show_list", "business_management"].map(scope => (
                <span key={scope} style={{ background: "#fde68a", color: "#78350f", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, fontFamily: "monospace" }}>
                  {scope}
                </span>
              ))}
            </div>
            <div style={{ background: "#fef9c3", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#713f12", marginBottom: 4 }}>🏛️ Acesso à Ads Library API (obrigatório para análise de concorrentes)</p>
              <p style={{ fontSize: 11, color: "#92400e" }}>
                Além das permissões, o seu App Meta precisa ter acesso aprovado à <strong>Ads Library API</strong>.{" "}
                Acesse <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" style={{ color: "#1877f2", fontWeight: 700 }}>developers.facebook.com</a>
                {" "}→ seu App → <strong>Products → Ads Library API → Request Access</strong>.
              </p>
            </div>
            <p style={{ fontSize: 11, color: "#92400e" }}>
              👉 Gere o token em{" "}
              <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer" style={{ color: "#1877f2", fontWeight: 700 }}>
                developers.facebook.com/tools/explorer
              </a>
              {" "}selecionando todos os escopos acima.
            </p>
          </div>

          <Field
            label="Access Token"
            placeholder="EAAxxxxxxxx..."
            value={accessToken}
            onChange={setAccessToken}
            hintLink="https://developers.facebook.com/tools/explorer"
            hintLinkText="developers.facebook.com/tools/explorer"
            hint="gerar token com permissões: ads_read + ads_management + read_insights"
          />

          <Field
            label="ID da Conta de Anúncios"
            placeholder="553508682019484 ou act_553508682019484"
            value={adAccountId}
            onChange={setAdAccountId}
            hintLink="https://business.facebook.com/adsmanager"
            hintLinkText="business.facebook.com/adsmanager"
            hint="canto superior esquerdo do Gerenciador"
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field
              label="App ID"
              placeholder="4180584392201411"
              value={appId}
              onChange={setAppId}
              optional
            />
            <Field
              label="App Secret"
              placeholder="b07a764d..."
              value={appSecret}
              onChange={setAppSecret}
              type="password"
              optional
            />
          </div>
          <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 24, marginTop: -8 }}>
            App ID e Secret permitem renovar o token automaticamente quando expirar.
          </p>

          <button
            onClick={handleSave}
            disabled={saving || (!accessToken.trim() && !adAccountId.trim())}
            style={{
              width: "100%", background: "#1877f2", color: "white", fontWeight: 700,
              fontSize: 14, padding: "13px 20px", borderRadius: 10, border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving || (!accessToken.trim() && !adAccountId.trim()) ? 0.6 : 1,
              transition: "opacity .2s",
            }}>
            {saving ? "⏳ Salvando..." : existing ? "🔄 Atualizar integração" : "📘 Conectar Meta Ads"}
          </button>
        </div>

        {/* Info */}
        <div style={{ background: "var(--navy)", borderRadius: 14, padding: 20, marginTop: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 10 }}>📊 O que a integração habilita</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              "Publicar campanhas geradas pela IA diretamente no Gerenciador com 1 clique",
              "Campanha criada como PAUSADA — você revisa e ativa quando quiser",
              "Métricas reais de CPC, CPL e ROAS da sua conta para estimativas mais precisas",
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: "#4ade80", fontSize: 14, marginTop: 1, flexShrink: 0 }}>✓</span>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,.8)", lineHeight: 1.6 }}>{item}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  );
}
