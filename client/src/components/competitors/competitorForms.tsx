// competitorForms.tsx — Formulários de adicionar/editar concorrente
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { usePlanLimit } from "@/hooks/usePlanLimit";
import { parseAdsLibraryUrl, buildAdsLibraryUrl, extractIgHandle } from "./competitorHelpers";


// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: FORMULÁRIO DE ADIÇÃO
// ─────────────────────────────────────────────────────────────────────────────
interface AddFormProps { projectId: number; onDone: () => void; }

export function AddCompetitorForm({ projectId, onDone }: AddFormProps) {
  const [saveError, setSaveError] = useState<string>("");
  const createComp = trpc.competitors.create.useMutation({
    onSuccess: () => {
      setSaveError("");
      toast.success("◎ Concorrente adicionado!");
      onDone();
    },
    onError: (e) => {
      const raw = e.message || "";
      const msg =
        raw.includes("FORBIDDEN")    ? "Limite do plano atingido — faça upgrade" :
        raw.includes("url")          ? "URL do site inválida — use https://..." :
        raw.includes("zodError")     ? "Verifique os campos obrigatórios" :
        raw.includes("Name")         ? "Nome obrigatório" :
        raw.includes("DB")           ? "Erro de banco de dados — tente novamente" :
        "Erro ao salvar — tente novamente";
      setSaveError(msg);
      toast.error("✕ " + msg);
    },
  });
  const [mode, setMode]         = useState<AddMode>("url");
  const [name, setName]         = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [nameQ, setNameQ]       = useState("");
  const [igInput, setIgInput]   = useState("");  // modo Instagram (localização)
  const [igSocial, setIgSocial] = useState("");  // campo Instagram das redes sociais
  const [discoveredPageId, setDiscoveredPageId] = useState<string>("");

  const discoverPageIdMutation = (trpc as any).competitors?.discoverPageId?.useMutation?.({
    onSuccess: (data: any) => {
      if (data?.found && data?.pageId) {
        setDiscoveredPageId(data.pageId);
        const methodLabel: Record<string, string> = {
          graph_direct_handle:    "Graph API",
          ig_oembed_fb_page:      "Instagram oEmbed",
          ads_library:            "Ads Library",
          my_pages_exact:         "Suas páginas",
          graph_pages_search:     "Busca de páginas",
          graph_slug_var:         "Graph API (variação)",
          site_scraping_numeric:  "Site do concorrente",
          site_fb_username:       "Site → Facebook",
          gemini:                 "IA",
        };
        const via = methodLabel[data.method] || data.method || "auto";
        const conf = data.confidence === "medium" ? " (confiança média — confirme o nome)" : "";
        toast.success(`◎ Page ID encontrado via ${via}: ${data.pageId}${data.pageName ? " — " + data.pageName : ""}${conf}`);
      } else {
        toast.error(
          "✕ Page ID não encontrado. O App Meta precisa de aprovação para buscar páginas de terceiros. " +
          "Alternativas: 1) Cole a URL da Ads Library do concorrente no campo acima  " +
          "2) Acesse facebook.com/NomeDaPagina → Sobre → copie o ID numérico.",
          { duration: 12000 }
        );
      }
    },
    onError: () => toast.error("✕ Erro ao buscar Page ID. Verifique se a integração Meta está ativa."),
  }) ?? { mutate: () => {}, isPending: false };
  const [country, setCountry]   = useState("BR");
  const [website,      setWebsite]      = useState("");
  const [tiktokInput,  setTiktokInput]  = useState("");
  const [googleInput,  setGoogleInput]  = useState("");

  // Verificação de limite de plano
  const { canCreateCompetitor, planName } = usePlanLimit();
  const { data: existingComps } = trpc.competitors.list.useQuery({ projectId });
  const compCount = (existingComps as any[])?.length ?? 0;
  const planCheck = canCreateCompetitor(compCount);

  const urlInfo  = urlInput ? parseAdsLibraryUrl(urlInput) : null;
  const urlValid = !!urlInfo?.pageId;
  const previewUrl =
    mode === "name"      && nameQ.trim()   ? buildAdsLibraryUrl(nameQ, country) :
    mode === "instagram" && igInput.trim() ? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(extractIgHandle(igInput))}&search_type=keyword_unordered` :
    null;

  const hasInput = mode === "url" ? !!urlInput : mode === "name" ? !!nameQ.trim() : !!igInput.trim();
  const canSave  = !!name.trim() && hasInput && planCheck.allowed;

  async function handleAdd() {
    if (!canSave) return;
    if (!planCheck.allowed) return;
    let adsUrl = "", pageId: string | null = null;
    if (mode === "url")       { adsUrl = urlInput; pageId = urlInfo?.pageId || null; }
    else if (mode === "name") { adsUrl = buildAdsLibraryUrl(nameQ, country); }
    else                      { adsUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(extractIgHandle(igInput))}&search_type=keyword_unordered`; }

    await createComp.mutateAsync({
      projectId, name: name.trim(),
      websiteUrl:      website.trim()             || undefined,
      facebookPageUrl: adsUrl                     || undefined,
      facebookPageId:  pageId || discoveredPageId || undefined,
      instagramUrl:    mode === "instagram" ? igInput : (igSocial.trim() || undefined),
      tiktokUrl:       tiktokInput.trim()         || undefined,
      googleAdsQuery:  googleInput.trim()         || undefined,
    });
  }

  return (
    <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 18, padding: 24, height: "fit-content" }}>
      {/* Alerta de limite de plano */}
      {!planCheck.allowed && (
        <div style={{ background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:10, padding:"12px 14px", marginBottom:16 }}>
          <p style={{ fontSize:13, fontWeight:700, color:"#92400e", marginBottom:4 }}>⚠️ Limite do plano {planName}</p>
          <p style={{ fontSize:12, color:"#b45309", marginBottom:8 }}>{planCheck.reason}</p>
          <a href="/pricing" style={{ fontSize:12, fontWeight:700, color:"#d97706" }}>Fazer upgrade →</a>
        </div>
      )}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 8 }}>① Nome do concorrente *</label>
        <input className="input" placeholder="Ex: Nike Brasil, Empresa XYZ…" value={name} onChange={e => setName(e.target.value)} style={{ width: "100%", fontSize: 14 }} autoFocus />
      </div>

      {/* Modo de localização */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 8 }}>② Como localizar os anúncios</label>
        <div style={{ display: "flex", gap: 0, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", marginBottom: 14 }}>
          {([
            { key: "url", icon: "🔗", label: "URL Ads Library" },
            { key: "name", icon: "🔎", label: "Nome / ID" },
            { key: "instagram", icon: "📸", label: "Instagram" },
          ] as { key: AddMode; icon: string; label: string }[]).map((m, i) => (
            <button key={m.key} onClick={() => setMode(m.key)} style={{
              flex: 1, padding: "10px 6px", border: "none", cursor: "pointer",
              borderLeft: i > 0 ? "1px solid var(--border)" : "none",
              background: mode === m.key ? "var(--navy)" : "white",
              color: mode === m.key ? "white" : "var(--muted)",
              fontSize: 11, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            }}>
              <span style={{ fontSize: 16 }}>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {mode === "url" && (
          <div>
            <div style={{
              border: urlInput ? (urlValid ? "2px solid var(--green)" : "2px solid #f59e0b") : "2px dashed #94a3b8",
              borderRadius: 12, background: urlInput ? (urlValid ? "#f0fdf4" : "#fefce8") : "#f8fafc", padding: 14, marginBottom: 10,
            }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: urlInput ? (urlValid ? "var(--green-dk)" : "#92400e") : "#64748b", marginBottom: 8, textTransform: "uppercase" }}>
                {urlInput ? (urlValid ? "◎ URL válida — Page ID detectado" : "⚠️ Cole a URL completa da Ads Library") : "📋 Cole a URL da Ads Library aqui"}
              </p>
              <textarea rows={4} placeholder={"https://www.facebook.com/ads/library/?...&view_all_page_id=248724168983172..."} value={urlInput} onChange={e => setUrlInput(e.target.value)}
                style={{ width: "100%", resize: "none", border: "none", outline: "none", background: "transparent", fontSize: 12, fontFamily: "monospace", lineHeight: 1.6, color: "var(--body)", boxSizing: "border-box" }} />
            </div>
            {urlValid && (
              <div style={{ display: "flex", gap: 12, padding: "8px 12px", background: "#f0fdf4", borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
                <span>Page ID: <strong>{urlInfo?.pageId}</strong></span>
                <span>País: <strong>{urlInfo?.country}</strong></span>
              </div>
            )}
            <div style={{ background: "var(--navy)", borderRadius: 10, padding: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "white", marginBottom: 8 }}>📋 Como obter a URL:</p>
              {[
                { n: "1", t: "Acesse", link: "facebook.com/ads/library →", href: "https://www.facebook.com/ads/library" },
                { n: "2", t: "Pesquise o nome da empresa" },
                { n: "3", t: 'Clique em "Ver todos os anúncios"' },
                { n: "4", t: "Copie a URL e cole acima ↑" },
              ].map(s => (
                <div key={s.n} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(255,255,255,.15)", color: "white", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.n}</div>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,.8)", margin: 0 }}>
                    {s.t} {s.href && <a href={s.href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--green)", fontWeight: 700 }}>{s.link}</a>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === "name" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input className="input" placeholder="Ex: Coca-Cola Brasil ou 248724168983172" value={nameQ} onChange={e => setNameQ(e.target.value)} style={{ width: "100%", paddingLeft: 36 }} />
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 15 }}>🔎</span>
              </div>
              <select value={country} onChange={e => setCountry(e.target.value)} style={{ padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "white", cursor: "pointer" }}>
                <option value="BR">🇧🇷 BR</option>
                <option value="US">🇺🇸 US</option>
                <option value="PT">🇵🇹 PT</option>
                <option value="ALL">🌍 Todos</option>
              </select>
            </div>
            {previewUrl && (
              <div style={{ background: "var(--off)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>URL gerada:</p>
                <p style={{ fontSize: 10, fontFamily: "monospace", color: "var(--body)", wordBreak: "break-all", marginBottom: 8 }}>{previewUrl}</p>
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, color: "var(--green-d)", textDecoration: "none" }}>Verificar na Ads Library →</a>
              </div>
            )}
          </div>
        )}

        {mode === "instagram" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input className="input" placeholder="@empresa ou https://instagram.com/empresa" value={igInput} onChange={e => { setIgInput(e.target.value); setDiscoveredPageId(""); }} style={{ width: "100%", paddingLeft: 36 }} />
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 15 }}>📸</span>
              </div>
              <select value={country} onChange={e => setCountry(e.target.value)} style={{ padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "white", cursor: "pointer" }}>
                <option value="BR">🇧🇷 BR</option>
                <option value="US">🇺🇸 US</option>
                <option value="PT">🇵🇹 PT</option>
              </select>
            </div>

            {/* Botão descobrir Page ID automaticamente */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <button
                onClick={() => {
                  if (!igInput.trim()) { toast.error("Digite o Instagram primeiro"); return; }
                  (discoverPageIdMutation as any).mutate({
                    instagramHandle: igInput,
                    companyName:     name,
                    websiteUrl:      website   || undefined,
                    facebookPageUrl: urlInput  || undefined,
                  });
                }}
                disabled={(discoverPageIdMutation as any).isPending || !igInput.trim()}
                style={{
                  background: (discoverPageIdMutation as any).isPending ? "#e2e8f0" : "#1877f2",
                  color: (discoverPageIdMutation as any).isPending ? "var(--muted)" : "white",
                  border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer",
                  fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                }}>
                {(discoverPageIdMutation as any).isPending ? "⏳ Buscando Page ID..." : "🔍 Descobrir Page ID automaticamente"}
              </button>
              {discoveredPageId && (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#15803d" }}>
                  ◎ Page ID: {discoveredPageId}
                </div>
              )}
            </div>

            <div style={{ background: "#fdf4ff", border: "1px solid #e9d5ff", borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", marginBottom: 2 }}>ℹ️ Instagram + Meta Ads Library</p>
              <p style={{ fontSize: 11, color: "#6d28d9", lineHeight: 1.6 }}>
                Digite o @instagram e clique em "🔍 Descobrir Page ID" para encontrar automaticamente.
                Com o Page ID a análise usa dados reais da Meta Ads Library!
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Site (opcional) */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 8 }}>③ Site do concorrente <span style={{ fontWeight: 400, color: "var(--muted)" }}>(opcional — enriquece análise)</span></label>
        <input className="input" placeholder="https://concorrente.com.br" value={website}
          onChange={e => {
            let v = e.target.value.trim();
            // Auto-adiciona https:// se usuário digitou sem
            if (v && !v.startsWith("http") && !v.startsWith("www.")) v = "https://" + v;
            else if (v && v.startsWith("www.")) v = "https://" + v;
            setWebsite(v || e.target.value);
          }}
          style={{ width: "100%" }} />
      </div>

      {/* Redes sociais adicionais */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 8 }}>
          ④ Outras redes <span style={{ fontWeight: 400, color: "var(--muted)" }}>(opcional — valida presença e melhora análise)</span>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {/* Instagram */}
          <div>
            <div style={{ position: "relative", marginBottom: 4 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>📸</span>
              <input className="input" placeholder="@instagram ou URL" value={igSocial}
                onChange={e => setIgSocial(e.target.value)}
                style={{ width: "100%", paddingLeft: 32, fontSize: 13,
                  borderColor: igSocial ? "#a78bfa" : undefined }} />
            </div>
            {igSocial && (
              <InstagramVerifier
                handle={igSocial}
                onConfirm={h => setIgSocial(h)}
                onClear={() => setIgSocial("")}
              />
            )}
          </div>
          {/* TikTok */}
          <div>
            <div style={{ position: "relative", marginBottom: 4 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>🎵</span>
              <input className="input" placeholder="@tiktok ou URL do perfil" value={tiktokInput}
                onChange={e => setTiktokInput(e.target.value)}
                style={{ width: "100%", paddingLeft: 32, fontSize: 13,
                  borderColor: tiktokInput ? "#6b7280" : undefined }} />
            </div>
            {tiktokInput && (
              <TikTokVerifier
                handle={tiktokInput}
                onConfirm={h => setTiktokInput(h)}
                onClear={() => setTiktokInput("")}
              />
            )}
          </div>
          {/* Google */}
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ position: "relative", marginBottom: 4 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>🔍</span>
              <input className="input" placeholder="Termo de busca Google Ads (nome da empresa)" value={googleInput}
                onChange={e => setGoogleInput(e.target.value)}
                style={{ width: "100%", paddingLeft: 32, fontSize: 13 }} />
            </div>
            {googleInput && (
              <GoogleVerifier
                query={googleInput}
                onConfirm={q => setGoogleInput(q)}
                onClear={() => setGoogleInput("")}
              />
            )}
          </div>
        </div>
      </div>

      <button className="btn btn-lg btn-green" onClick={handleAdd} disabled={!canSave || createComp.isPending} style={{ width: "100%", justifyContent: "center" }}>
        {createComp.isPending ? "⏳ Salvando..." : !name.trim() ? "Preencha o nome" : !hasInput ? "Preencha como localizar" : "◎ Adicionar concorrente"}
      </button>
      {saveError && <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8, textAlign: "center" }}>✕ {saveError}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: FORMULÁRIO DE EDIÇÃO INLINE
// ─────────────────────────────────────────────────────────────────────────────
export function EditCompetitorForm({ comp, onDone, onCancel }: { comp: any; onDone: () => void; onCancel: () => void }) {
  const updateComp = trpc.competitors.update.useMutation({
    onSuccess: () => {
      toast.success("◎ Concorrente atualizado!");
      onDone();
    },
    onError: (e) => {
      const msg = e.message?.includes("url") ? "URL inválida — use https://..." : "Erro ao salvar";
      toast.error("✕ " + msg);
    },
  });
  const discoverPageId = (trpc as any).competitors?.discoverPageId?.useMutation?.({
    onSuccess: (data: any) => {
      if (data?.found && data?.pageId) {
        setPageId(data.pageId);
        toast.success(`◎ Page ID encontrado: ${data.pageId} (${data.pageName || "via " + data.method})`);
      } else {
        toast.error(
          "✕ Page ID não encontrado automaticamente. " +
          "Abra facebook.com/NomeDaPagina, clique em 'Sobre' → role até ver o ID numérico. " +
          "Ou use facebook.com/ads/library → busque a empresa → copie o número da URL.",
          { duration: 10000 }
        );
      }
    },
    onError: () => toast.error("✕ Erro ao buscar Page ID."),
  }) ?? { mutate: () => {}, isPending: false };

  const [name, setName]             = useState(comp.name || "");
  const [pageId, setPageId]         = useState(comp.facebookPageId || "");
  const [pageUrl, setPageUrl]       = useState(comp.facebookPageUrl || "");
  const [igUrl, setIgUrl]           = useState(comp.instagramUrl || "");
  const [websiteUrl, setWebsiteUrl] = useState(comp.websiteUrl || "");
  const [notes, setNotes]           = useState(comp.notes || "");

  return (
    <div style={{ background: "#f8fafc", border: "2px solid var(--green)", borderRadius: 16, padding: 20, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)" }}>✏️ Editar: {comp.name}</p>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--muted)" }}>✕</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {[
          { label: "NOME *",          value: name,       set: setName,       placeholder: "Nome do concorrente" },
          { label: "URL ADS LIBRARY", value: pageUrl,    set: setPageUrl,    placeholder: "https://facebook.com/ads/library/..." },
          { label: "SITE",            value: websiteUrl, set: setWebsiteUrl, placeholder: "https://empresa.com.br" },
          { label: "NOTAS",           value: notes,      set: setNotes,      placeholder: "Observações…" },
        ].map(field => (
          <div key={field.label}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>{field.label}</label>
            <input className="input" value={field.value} onChange={e => field.set(e.target.value)} placeholder={field.placeholder} style={{ width: "100%", fontSize: 13 }} />
          </div>
        ))}

        {/* Facebook Page ID com botão de descoberta automática */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>
            FACEBOOK PAGE ID
            {pageId && <span style={{ marginLeft: 6, color: "#15803d", fontWeight: 600 }}>◎ Configurado</span>}
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <input className="input" value={pageId} onChange={e => setPageId(e.target.value)}
              placeholder="248724168983172"
              style={{ flex: 1, fontSize: 13, borderColor: pageId ? "#86efac" : undefined }} />
            <button
              onClick={() => {
                const handle = igUrl || comp.name;
                if (!handle) { toast.error("Informe o Instagram ou Website primeiro"); return; }
                (discoverPageId as any).mutate({
                  instagramHandle: handle,
                  companyName:     comp.name,
                  websiteUrl:      websiteUrl || undefined,
                  facebookPageUrl: pageUrl    || undefined,
                });
              }}
              disabled={(discoverPageId as any).isPending}
              title="Descobrir Page ID automaticamente pelo Instagram"
              style={{
                background: (discoverPageId as any).isPending ? "#e2e8f0" : "#1877f2",
                color: (discoverPageId as any).isPending ? "var(--muted)" : "white",
                border: "none", borderRadius: 8, padding: "0 10px", cursor: "pointer",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
              }}>
              {(discoverPageId as any).isPending ? "⏳" : "🔍 Auto"}
            </button>
          </div>
          <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
            Clique em "🔍 Auto" para descobrir automaticamente pelo Instagram cadastrado
          </p>
        </div>

        {/* Instagram com verificador */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>INSTAGRAM</label>
          <input className="input" value={igUrl} onChange={e => setIgUrl(e.target.value)} placeholder="@handle ou URL"
            style={{ width: "100%", fontSize: 13, borderColor: igUrl ? "#a78bfa" : undefined }} />
          {igUrl && (
            <InstagramVerifier handle={igUrl} onConfirm={h => setIgUrl(h)} onClear={() => setIgUrl("")} />
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-sm btn-green" onClick={() => updateComp.mutate({
          id: comp.id, name: name.trim(),
          facebookPageId: pageId || null, facebookPageUrl: pageUrl || null,
          instagramUrl: igUrl || null, websiteUrl: websiteUrl || null, notes: notes || null
        })} disabled={!name.trim() || updateComp.isPending} style={{ flex: 1, justifyContent: "center" }}>
          {updateComp.isPending ? "⏳ Salvando..." : "💾 Salvar alterações"}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onCancel} style={{ fontSize: 12 }}>Cancelar</button>
      </div>
      {updateComp.isError && (
        <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8 }}>
          ✕ {(updateComp.error as any)?.message?.includes("url") ? "URL inválida — use https://..." : "Erro ao salvar. Tente novamente."}
        </p>
      )}
    </div>
  );
}
