/**
 * SellerDashboard.tsx — Painel do vendedor no Marketplace
 * Rota: /marketplace/seller (protegida)
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { toast } from "sonner";

function MetricCard({ icon, label, value, color }: { icon: string; label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: color || "var(--black)", letterSpacing: "-0.03em" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function CtrBar({ ctr }: { ctr: number }) {
  const color = ctr >= 5 ? "#30d158" : ctr >= 3 ? "#ff9f0a" : "#ff453a";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>CTR</span>
        <span style={{ fontSize: 11, fontWeight: 800, color }}>{ctr.toFixed(1)}%</span>
      </div>
      <div style={{ height: 4, background: "var(--off)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(ctr * 10, 100)}%`, background: color, borderRadius: 2, transition: "width .6s" }} />
      </div>
    </div>
  );
}

export default function SellerDashboard() {
  const [, setLocation] = useLocation();
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState<number | null>(null);
  const [activeTab, setActiveTab]   = useState<"listings" | "orders">("listings");
  const [editingListing, setEditingListing] = useState<any>(null);
  const [editForm, setEditForm]     = useState<any>({});
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ url: string; type: "image" | "video" } | null>(null);
  const [galleryItems, setGalleryItems]   = useState<{ type: "image"|"video"; url: string; thumb?: string }[]>([]);
  const [deletingPhoto, setDeletingPhoto] = useState<string | null>(null);
  // ── Gerador de vídeo ──────────────────────────────────────────────────────
  const [showVideoGen,  setShowVideoGen]  = useState(false);
  const [videoFormat,   setVideoFormat]   = useState<"feed"|"stories"|"square">("feed");
  const [videoTransition, setVideoTransition] = useState<"fade"|"dissolve"|"wiperight"|"slideleft"|"circleopen">("fade");
  const [videoDuration, setVideoDuration] = useState(4);
  const [videoTitle,    setVideoTitle]    = useState("");
  const [videoSub,      setVideoSub]      = useState("");
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress]   = useState("");

  // Lê ?edit=ID da URL para abrir o modal automaticamente
  const editIdFromUrl = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("edit")
    : null;

  useEffect(() => {
    fetch("/api/marketplace/seller/dashboard", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setData(d);
          // Abre modal automaticamente se ?edit=ID estiver na URL
          if (editIdFromUrl && d.listings) {
            const target = d.listings.find((l: any) => String(l.id) === editIdFromUrl);
            if (target) {
              setTimeout(() => openEdit(target), 100);
              // Limpa o parâmetro da URL sem recarregar
              window.history.replaceState({}, "", "/marketplace/seller");
            }
          }
        } else {
          setData(MOCK_DATA);
        }
      })
      .catch(() => setData(MOCK_DATA))
      .finally(() => setLoading(false));
  }, []);

  async function optimize(listingId: number) {
    setOptimizing(listingId);
    try {
      const res  = await fetch(`/api/marketplace/${listingId}/optimize`, { method: "POST", credentials: "include" });
      const resp = await res.json();
      if (resp.success) {
        toast.success("✦ IA gerou sugestões de otimização!");
        // Atualiza listing na lista
        setData((prev: any) => ({
          ...prev,
          listings: prev.listings.map((l: any) =>
            l.id === listingId ? { ...l, aiSuggestions: resp.suggestions } : l
          ),
        }));
      } else {
        toast.error(resp.error || "Erro ao otimizar");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setOptimizing(null);
    }
  }

  function openEdit(l: any) {
    setEditingListing(l);
    setEditForm({
      title:          l.title || "",
      description:    l.description || "",
      price:          l.price ? String(l.price) : "",
      priceType:      l.priceType || "fixed",
      benefits:       Array.isArray(l.benefits)
        ? l.benefits.map((b: any) => typeof b === "string" ? b : b.title || "").join("\n")
        : (typeof l.benefits === "string" ? l.benefits : ""),
      whatsappNumber: l.whatsappNumber || "",
      checkoutUrl:    l.checkoutUrl    || "",
      contactEmail:   l.contactEmail   || "",
      city:           l.city           || "",
      state:          l.state          || "",
      imageUrl:       l.imageUrl       || "",
      videoUrl:       l.videoUrl       || "",
    });
    // Carrega preview da mídia atual
    if (l.videoUrl) setMediaPreview({ url: l.videoUrl, type: "video" });
    else if (l.imageUrl) setMediaPreview({ url: l.imageUrl, type: "image" });
    else setMediaPreview(null);
    // Carrega galeria de fotos extras
    try {
      const gal = l.gallery ? JSON.parse(l.gallery) : [];
      setGalleryItems(gal);
    } catch { setGalleryItems([]); }
  }

  async function saveEdit(regenerate = false) {
    if (!editingListing) return;
    setSaving(true);
    try {
      const benefits = editForm.benefits
        ? editForm.benefits.split("\n").filter(Boolean)
        : [];
      const res = await fetch(`/api/marketplace/${editingListing.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, price: editForm.price ? Number(editForm.price) : null, benefits, regenerateLanding: regenerate }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(regenerate ? "✦ Oferta editada e landing page regenerada com IA!" : "◎ Oferta salva!");
        setData((prev: any) => ({
          ...prev,
          listings: prev.listings.map((l: any) => l.id === editingListing.id ? data.listing : l),
        }));
        setEditingListing(null);
      } else {
        toast.error(data.error || "Erro ao salvar");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  async function deleteListing(listingId: number) {
    if (!confirm("Tem certeza que deseja remover esta oferta? Esta ação não pode ser desfeita.")) return;
    setDeletingId(listingId);
    try {
      await fetch(`/api/marketplace/${listingId}`, { method: "DELETE", credentials: "include" });
      setData((prev: any) => ({ ...prev, listings: prev.listings.filter((l: any) => l.id !== listingId) }));
      toast.success("Oferta removida.");
    } catch {
      toast.error("Erro ao remover");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Gera vídeo slideshow com FFmpeg ──────────────────────────────────────
  async function generateVideo(listingId: number) {
    setGeneratingVideo(true);
    setVideoProgress("⏳ Gerando vídeo — pode levar até 60s...");
    try {
      const res = await fetch(`/api/marketplace/${listingId}/generate-video`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format:     videoFormat,
          transition: videoTransition,
          duration:   videoDuration,
          title:      videoTitle || undefined,
          subtitle:   videoSub   || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      // Faz o download do vídeo gerado
      const blob = await res.blob();
      const durHeader = res.headers.get("X-Video-Duration");
      const url  = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const fmt  = videoFormat === "stories" ? "reels" : videoFormat;
      link.href  = url;
      link.download = `video-${fmt}-mecproai.mp4`;
      link.click();
      URL.revokeObjectURL(url);

      const dur = durHeader ? `${durHeader}s` : "";
      setVideoProgress(`✅ Vídeo ${dur} gerado e baixado!`);
      toast.success(`🎬 Vídeo ${fmt} gerado com sucesso!`);
      setTimeout(() => { setVideoProgress(""); setShowVideoGen(false); }, 3000);
    } catch (e: any) {
      setVideoProgress(`❌ ${e.message}`);
      toast.error("Erro ao gerar vídeo: " + e.message);
    } finally {
      setGeneratingVideo(false);
    }
  }

  // Remove foto individual da galeria
  async function deleteGalleryPhoto(listingId: number, photoUrl: string) {
    if (!confirm("Remover esta foto?")) return;
    setDeletingPhoto(photoUrl);
    try {
      // Atualiza galeria removendo o item
      const newGallery = galleryItems.filter(m => m.url !== photoUrl);
      await fetch(`/api/marketplace/${listingId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gallery: JSON.stringify(newGallery) }),
      });
      setGalleryItems(newGallery);
      // Se era a imagem principal, limpa
      if (editForm.imageUrl === photoUrl) set("imageUrl", newGallery.find(m => m.type === "image")?.url || "");
      if (editForm.videoUrl === photoUrl) set("videoUrl", newGallery.find(m => m.type === "video")?.url || "");
      toast.success("Foto removida");
    } catch { toast.error("Erro ao remover foto"); }
    finally { setDeletingPhoto(null); }
  }

  async function toggleStatus(listing: any) {
    const newStatus = listing.status === "active" ? "paused" : "active";
    try {
      await fetch(`/api/marketplace/${listing.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setData((prev: any) => ({
        ...prev,
        listings: prev.listings.map((l: any) =>
          l.id === listing.id ? { ...l, status: newStatus } : l
        ),
      }));
      toast.success(`Listagem ${newStatus === "active" ? "reativada" : "pausada"}`);
    } catch {
      toast.error("Erro ao atualizar status");
    }
  }

  const s = data?.stats;

  function set(k: string, v: any) { setEditForm((f: any) => ({ ...f, [k]: v })); }

  async function handleMediaUpload(file: File) {
    if (!editingListing) return;
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) { toast.error("Use JPG, PNG, WebP ou MP4, MOV"); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 50MB."); return; }
    setUploadingMedia(true);
    // Preview local imediato
    const localUrl = URL.createObjectURL(file);
    setMediaPreview({ url: localUrl, type: isVideo ? "video" : "image" });
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("listingId", String(editingListing.id));
      const res = await fetch("/api/marketplace/upload-media", { method: "POST", credentials: "include", body: form });
      const data = await res.json();
      if (!res.ok || !data.success) { toast.error(data.error || "Erro no upload"); setMediaPreview(null); return; }
      // Atualiza form com a URL permanente
      set(data.type === "video" ? "videoUrl" : "imageUrl", data.url);
      setMediaPreview({ url: data.url, type: data.type });
      toast.success(isVideo ? "🎬 Vídeo carregado!" : "🖼️ Imagem carregada!");
    } catch { toast.error("Erro de conexão no upload"); setMediaPreview(null); }
    finally { setUploadingMedia(false); }
  }

  return (
    <Layout>
      <style>{`
        .listing-row:hover { background: var(--off) !important; }
        .order-row:hover { background: var(--off) !important; }
        .action-btn:hover { opacity: .8; }
        .edit-input { width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:8px; font-size:13px; font-family:var(--font); background:var(--card); color:var(--black); box-sizing:border-box; }
        .edit-input:focus { outline:none; border-color:var(--blue); }
      `}</style>

      {/* ── Modal de Edição — Layout redesenhado ── */}
      {editingListing && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:1000, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"16px 16px", overflowY:"auto" }}
          onClick={e => { if (e.target === e.currentTarget) { setEditingListing(null); setMediaPreview(null); } }}>
          <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:620, margin:"auto", boxShadow:"0 32px 80px rgba(0,0,0,.3)", overflow:"hidden" }}>

            {/* Header fixo */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 24px 16px", borderBottom:"1px solid #f1f5f9", background:"#fff", position:"sticky", top:0, zIndex:1 }}>
              <div>
                <div style={{ fontSize:17, fontWeight:900, color:"#0f172a", letterSpacing:"-0.03em" }}>✏️ Editar oferta</div>
                <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{editingListing.title?.slice(0,50)}</div>
              </div>
              <button onClick={() => { setEditingListing(null); setMediaPreview(null); }}
                style={{ width:32, height:32, borderRadius:50, background:"#f1f5f9", border:"none", cursor:"pointer", fontSize:18, color:"#64748b", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>

            {/* Conteúdo com scroll */}
            <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:18, maxHeight:"70vh", overflowY:"auto" }}>

              {/* ── MÍDIA ── */}
              <div style={{ background:"#f8fafc", borderRadius:14, padding:"16px" }}>
                <div style={{ fontSize:11, fontWeight:800, color:"#64748b", letterSpacing:"0.05em", marginBottom:12 }}>📸 IMAGEM OU VÍDEO DA OFERTA</div>

                {/* Preview */}
                {(mediaPreview || editingListing?.imageUrl || editingListing?.videoUrl) ? (
                  <div style={{ position:"relative", borderRadius:12, overflow:"hidden", marginBottom:10, border:"2px solid #e2e8f0" }}>
                    {(mediaPreview?.type === "video" || (!mediaPreview && editingListing?.videoUrl)) ? (
                      <video src={mediaPreview?.url || editingListing?.videoUrl} controls style={{ width:"100%", maxHeight:220, objectFit:"cover", display:"block", background:"#000" }} />
                    ) : (
                      <img src={mediaPreview?.url || editingListing?.imageUrl} alt="" style={{ width:"100%", maxHeight:220, objectFit:"cover", display:"block" }} />
                    )}
                    {uploadingMedia && (
                      <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.5)", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                        <div style={{ width:24, height:24, border:"3px solid white", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 1s linear infinite" }} />
                        <span style={{ color:"white", fontWeight:700, fontSize:13 }}>Enviando...</span>
                      </div>
                    )}
                    <button onClick={() => { setMediaPreview(null); set("imageUrl",""); set("videoUrl",""); }}
                      style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,.65)", color:"white", border:"none", borderRadius:"50%", width:28, height:28, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>×</button>
                  </div>
                ) : (
                  <div style={{ borderRadius:12, border:"2px dashed #cbd5e1", background:"white", padding:"24px", textAlign:"center", marginBottom:10 }}>
                    <div style={{ fontSize:28, marginBottom:6 }}>📤</div>
                    <div style={{ fontSize:12, fontWeight:700, color:"#475569" }}>Nenhuma mídia adicionada</div>
                    <div style={{ fontSize:11, color:"#94a3b8" }}>Clique nos botões abaixo para adicionar</div>
                  </div>
                )}

                {/* Galeria de fotos com exclusão */}
                {galleryItems.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase",
                      letterSpacing: "0.05em", marginBottom: 6 }}>
                      Galeria ({galleryItems.length}/5)
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {galleryItems.map((m, i) => (
                        <div key={i} style={{ position: "relative", width: 68, height: 52,
                          borderRadius: 8, overflow: "hidden", border: "2px solid #e2e8f0",
                          flexShrink: 0 }}>
                          {m.type === "video"
                            ? <div style={{ width: "100%", height: "100%", background: "#1e293b",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "white", fontSize: 18 }}>▶</div>
                            : <img src={m.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                onError={e => { (e.target as HTMLImageElement).src = ""; }} />}
                          {/* Botão excluir foto */}
                          <button
                            onClick={() => editingListing && deleteGalleryPhoto(editingListing.id, m.url)}
                            disabled={deletingPhoto === m.url}
                            style={{ position: "absolute", top: 2, right: 2,
                              width: 18, height: 18, borderRadius: "50%",
                              background: deletingPhoto === m.url ? "#94a3b8" : "#dc2626",
                              color: "white", border: "none", cursor: "pointer",
                              fontSize: 10, fontWeight: 900, display: "flex",
                              alignItems: "center", justifyContent: "center",
                              lineHeight: 1, padding: 0 }}>
                            {deletingPhoto === m.url ? "…" : "✕"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botões upload */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <label htmlFor="mp-photo-input" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"10px", borderRadius:10, border:"1.5px solid #bfdbfe", background:"#eff6ff", cursor: uploadingMedia ? "wait" : "pointer", opacity: uploadingMedia ? .6 : 1 }}>
                    <span style={{ fontSize:18 }}>🖼️</span>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#1d4ed8" }}>{uploadingMedia ? "Enviando..." : "Trocar foto"}</div>
                      <div style={{ fontSize:10, color:"#60a5fa" }}>JPG, PNG, WebP</div>
                    </div>
                  </label>
                  <input id="mp-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display:"none" }}
                    onChange={e => { const f=e.target.files?.[0]; if(f) handleMediaUpload(f); e.currentTarget.value=""; }} />

                  <label htmlFor="mp-video-input" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"10px", borderRadius:10, border:"1.5px solid #d8b4fe", background:"#faf5ff", cursor: uploadingMedia ? "wait" : "pointer", opacity: uploadingMedia ? .6 : 1 }}>
                    <span style={{ fontSize:18 }}>🎬</span>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#7c3aed" }}>{uploadingMedia ? "Enviando..." : "Adicionar vídeo"}</div>
                      <div style={{ fontSize:10, color:"#a78bfa" }}>MP4, MOV (máx 50MB)</div>
                    </div>
                  </label>
                  <input id="mp-video-input" type="file" accept="video/mp4,video/mov,video/quicktime,video/webm" style={{ display:"none" }}
                    onChange={e => { const f=e.target.files?.[0]; if(f) handleMediaUpload(f); e.currentTarget.value=""; }} />
                </div>
              </div>

              {/* ── INFORMAÇÕES ── */}
              <div>
                <div style={{ fontSize:11, fontWeight:800, color:"#64748b", letterSpacing:"0.05em", marginBottom:10 }}>📝 INFORMAÇÕES DA OFERTA</div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:"#475569", display:"block", marginBottom:4 }}>Título *</label>
                    <input className="edit-input" value={editForm.title} onChange={e => set("title", e.target.value)} placeholder="Ex: Apartamento de alto padrão em BC" maxLength={120} />
                    <div style={{ fontSize:10, color:"#94a3b8", marginTop:3 }}>{editForm.title?.length || 0}/120 caracteres</div>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:"#475569", display:"block", marginBottom:4 }}>Descrição</label>
                    <textarea className="edit-input" value={editForm.description} onChange={e => set("description", e.target.value)} placeholder="Descreva os principais diferenciais da oferta..." rows={3} style={{ resize:"vertical", minHeight:80 }} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:"#475569", display:"block", marginBottom:4 }}>Benefícios <span style={{ fontWeight:400, color:"#94a3b8" }}>(um por linha)</span></label>
                    <textarea className="edit-input" value={editForm.benefits} onChange={e => set("benefits", e.target.value)} placeholder={"✓ Piscina e área de lazer\n✓ Localização privilegiada\n✓ Alto padrão construtivo"} rows={4} style={{ resize:"vertical" }} />
                  </div>
                </div>
              </div>

              {/* ── PREÇO ── */}
              <div>
                <div style={{ fontSize:11, fontWeight:800, color:"#64748b", letterSpacing:"0.05em", marginBottom:10 }}>💰 PREÇO</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:"#475569", display:"block", marginBottom:4 }}>Valor (R$)</label>
                    <div style={{ position:"relative" }}>
                      <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:13, fontWeight:700, color:"#64748b" }}>R$</span>
                      <input className="edit-input" type="number" value={editForm.price} onChange={e => set("price", e.target.value)} placeholder="0,00" min="0" style={{ paddingLeft:30 }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:"#475569", display:"block", marginBottom:4 }}>Tipo</label>
                    <select className="edit-input" value={editForm.priceType} onChange={e => set("priceType", e.target.value)}>
                      <option value="fixed">💳 Preço fixo</option>
                      <option value="monthly">🔄 Mensalidade</option>
                      <option value="negotiable">🤝 A negociar</option>
                      <option value="free">🎁 Gratuito</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* ── GERADOR DE VIDEO ── */}
              <div style={{ background:"linear-gradient(135deg,#0f172a,#1e3a5f)", borderRadius:14, padding:16 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: showVideoGen ? 14 : 0 }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:800, color:"white" }}>&#127916; Gerar Video para Redes Sociais</div>
                    <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>Converte suas fotos em MP4 pronto para postar</div>
                  </div>
                  <button onClick={() => setShowVideoGen(v => !v)}
                    style={{ background: showVideoGen ? "#334155" : "#3b82f6", color:"white", border:"none", borderRadius:8, padding:"6px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                    {showVideoGen ? "Fechar" : "Criar video"}
                  </button>
                </div>
                {showVideoGen && editingListing && (
                  <div>
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:10, color:"#94a3b8", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Formato</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                        {[["feed","Feed 4:5"],["stories","Stories 9:16"],["square","Quadrado 1:1"]].map(([k,l]: any) => (
                          <button key={k} onClick={() => setVideoFormat(k)}
                            style={{ padding:"8px 4px", borderRadius:8, border:"none", cursor:"pointer", textAlign:"center",
                              background: videoFormat===k ? "#3b82f6" : "#1e293b",
                              color: videoFormat===k ? "white" : "#94a3b8", fontSize:11, fontWeight:700 }}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:10, color:"#94a3b8", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>
                        Duracao por foto: <strong style={{ color:"white" }}>{videoDuration}s</strong>
                      </div>
                      <input type="range" min={2} max={8} value={videoDuration}
                        onChange={e => setVideoDuration(Number(e.target.value))} style={{ width:"100%", accentColor:"#3b82f6" }} />
                    </div>
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:10, color:"#94a3b8", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Transicao</div>
                      <select value={videoTransition} onChange={e => setVideoTransition(e.target.value as any)}
                        style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"none", background:"#1e293b", color:"white", fontSize:12 }}>
                        <option value="fade">Fade</option>
                        <option value="dissolve">Dissolve</option>
                        <option value="slideleft">Slide esquerda</option>
                        <option value="wiperight">Wipe direita</option>
                        <option value="circleopen">Circulo</option>
                      </select>
                    </div>
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:10, color:"#94a3b8", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Texto sobreposto (opcional)</div>
                      <input placeholder="Titulo" value={videoTitle} onChange={e => setVideoTitle(e.target.value)} maxLength={60}
                        style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"none", background:"#1e293b", color:"white", fontSize:12, marginBottom:6, boxSizing:"border-box" as any }} />
                      <input placeholder="Subtitulo" value={videoSub} onChange={e => setVideoSub(e.target.value)} maxLength={80}
                        style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"none", background:"#1e293b", color:"white", fontSize:12, boxSizing:"border-box" as any }} />
                    </div>
                    <div style={{ background:"#0f172a", borderRadius:8, padding:"8px 10px", marginBottom:10, fontSize:11, color:"#94a3b8" }}>
                      {galleryItems.length + (editForm.imageUrl ? 1 : 0)} foto(s) disponiveis
                      {galleryItems.length + (editForm.imageUrl ? 1 : 0) === 0 && <span style={{ color:"#f87171" }}> - adicione fotos primeiro</span>}
                    </div>
                    {videoProgress && (
                      <div style={{ background:"#1e293b", borderRadius:8, padding:"8px 10px", marginBottom:10, fontSize:11,
                        color: videoProgress.startsWith("✅") ? "#34d399" : videoProgress.startsWith("❌") ? "#f87171" : "#93c5fd" }}>
                        {videoProgress}
                      </div>
                    )}
                    <button onClick={() => generateVideo(editingListing.id)}
                      disabled={generatingVideo || galleryItems.length + (editForm.imageUrl ? 1 : 0) === 0}
                      style={{ width:"100%", padding:"12px 0", borderRadius:10, border:"none", fontWeight:800, fontSize:13,
                        background: generatingVideo || galleryItems.length + (editForm.imageUrl ? 1 : 0) === 0 ? "#1e293b" : "#3b82f6",
                        color: generatingVideo || galleryItems.length + (editForm.imageUrl ? 1 : 0) === 0 ? "#475569" : "white",
                        cursor:"pointer" }}>
                      {generatingVideo ? "Gerando video..." : "Gerar e baixar MP4"}
                    </button>
                  </div>
                )}
              </div>

                            {/* ── CONTATO ── */}
              <div>
                <div style={{ fontSize:11, fontWeight:800, color:"#64748b", letterSpacing:"0.05em", marginBottom:10 }}>📞 CONTATO E CONVERSÃO</div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div>
                      <label style={{ fontSize:11, fontWeight:700, color:"#475569", display:"block", marginBottom:4 }}>WhatsApp</label>
                      <div style={{ position:"relative" }}>
                        <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:13 }}>📱</span>
                        <input className="edit-input" value={editForm.whatsappNumber} onChange={e => set("whatsappNumber", e.target.value)} placeholder="47999999999" style={{ paddingLeft:30 }} />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize:11, fontWeight:700, color:"#475569", display:"block", marginBottom:4 }}>E-mail</label>
                      <input className="edit-input" type="email" value={editForm.contactEmail} onChange={e => set("contactEmail", e.target.value)} placeholder="seu@email.com" />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:"#475569", display:"block", marginBottom:4 }}>Link de Checkout / Site / WhatsApp URL</label>
                    <input className="edit-input" value={editForm.checkoutUrl} onChange={e => set("checkoutUrl", e.target.value)} placeholder="https://wa.me/47999... ou https://seu-site.com" />
                  </div>
                </div>
              </div>

              {/* ── LOCALIZAÇÃO ── */}
              <div>
                <div style={{ fontSize:11, fontWeight:800, color:"#64748b", letterSpacing:"0.05em", marginBottom:10 }}>📍 LOCALIZAÇÃO</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 80px", gap:10 }}>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:"#475569", display:"block", marginBottom:4 }}>Cidade</label>
                    <input className="edit-input" value={editForm.city} onChange={e => set("city", e.target.value)} placeholder="Balneário Camboriú" />
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:"#475569", display:"block", marginBottom:4 }}>UF</label>
                    <input className="edit-input" value={editForm.state} onChange={e => set("state", e.target.value.toUpperCase())} placeholder="SC" maxLength={2} style={{ textAlign:"center", fontWeight:700 }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer com botões — fixo no fundo */}
            <div style={{ padding:"16px 24px", borderTop:"1px solid #f1f5f9", background:"#fff" }}>
              {/* Botão excluir anúncio */}
              <button
                onClick={() => {
                  if (editingListing) {
                    deleteListing(editingListing.id);
                    setEditingListing(null);
                  }
                }}
                disabled={deletingId === editingListing?.id}
                style={{ width:"100%", marginBottom:8, padding:"10px 0", borderRadius:10,
                  border:"1px solid #fca5a5", background:"#fef2f2", color:"#dc2626",
                  cursor:"pointer", fontWeight:700, fontSize:13,
                  display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                {deletingId === editingListing?.id ? "⏳ Removendo..." : "🗑 Excluir este anúncio permanentemente"}
              </button>
              {/* Salvar */}
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => saveEdit(false)} disabled={saving || !editForm.title?.trim()}
                  style={{ flex:1, padding:"12px 0", borderRadius:12, border:"none", cursor: saving || !editForm.title?.trim() ? "not-allowed" : "pointer", fontWeight:800, fontSize:13, background: saving || !editForm.title?.trim() ? "#e2e8f0" : "#0f172a", color: saving || !editForm.title?.trim() ? "#94a3b8" : "white", transition:"all .2s" }}>
                  {saving ? "⏳ Salvando..." : "◎ Salvar alterações"}
                </button>
                <button onClick={() => saveEdit(true)} disabled={saving || !editForm.title?.trim()}
                  style={{ flex:1, padding:"12px 0", borderRadius:12, border:"1.5px solid #3b82f6", cursor: saving || !editForm.title?.trim() ? "not-allowed" : "pointer", fontWeight:800, fontSize:13, background:"white", color:"#3b82f6", opacity: saving || !editForm.title?.trim() ? .5 : 1 }}>
                  {saving ? "⏳ Salvando..." : "🤖 Salvar + Regenerar LP"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px 60px", fontFamily: "var(--font)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--black)", letterSpacing: "-0.04em" }}>
              🛒 Dashboard do Vendedor
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>Gerencie suas listagens e acompanhe vendas em tempo real</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-md" onClick={() => setLocation("/marketplace")} style={{ fontSize: 12 }}>Ver vitrine →</button>
            <button className="btn btn-md btn-primary" onClick={() => setLocation("/marketplace/publish")}
              style={{ fontWeight: 700, fontSize: 12, background: "#30d158" }}>+ Nova oferta</button>
          </div>
        </div>

        {/* Métricas */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
            {Array(5).fill(0).map((_, i) => <div key={i} style={{ height: 90, background: "var(--off)", borderRadius: 14 }} />)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
            <MetricCard icon="◫"  label="Listagens ativas"   value={String(s?.activeListings || 0)} />
            <MetricCard icon="👁" label="Visualizações"      value={(s?.totalViews || 0).toLocaleString("pt-BR")} />
            <MetricCard icon="↗" label="Cliques totais"     value={(s?.totalClicks || 0).toLocaleString("pt-BR")} />
            <MetricCard icon="✓"  label="Pedidos"            value={String(s?.totalOrders || 0)} color="#30d158" />
            <MetricCard icon="R$" label="Receita gerada"     value={`R$ ${(s?.totalRevenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} color="var(--blue)" />
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
          {(["listings", "orders"] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{
                padding: "8px 16px", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
                background: activeTab === t ? "var(--off)" : "transparent",
                color: activeTab === t ? "var(--black)" : "var(--muted)",
                borderBottom: activeTab === t ? "2px solid var(--blue)" : "2px solid transparent",
                borderRadius: "8px 8px 0 0",
              }}>
              {t === "listings" ? `📋 Minhas listagens (${data?.listings?.length || 0})` : `🧾 Pedidos (${data?.recentOrders?.length || 0})`}
            </button>
          ))}
        </div>

        {/* Listagens */}
        {activeTab === "listings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(data?.listings || []).length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Nenhuma listagem ainda</div>
                <button className="btn btn-md btn-primary" style={{ fontWeight: 700 }}
                  onClick={() => setLocation("/marketplace/publish")}>+ Publicar primeira oferta</button>
              </div>
            )}
            {(data?.listings || []).map((l: any) => {
              const ctr = l.views > 0 ? (l.clicks / l.views * 100) : 0;
              const isLow = ctr < 3 && l.views > 50;
              return (
                <div key={l.id} className="listing-row"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px", transition: "background .15s" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, textTransform: "uppercase",
                          background: l.status === "active" ? "rgba(48,209,88,.15)" : "var(--off)",
                          color: l.status === "active" ? "#30d158" : "var(--muted)",
                        }}>{l.status === "active" ? "● Ativo" : "⏸ Pausado"}</span>
                        {isLow && <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: "rgba(255,159,10,.15)", color: "#ff9f0a" }}>⚡ CTR baixo</span>}
                        {l.boostActive && <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: "rgba(90,200,250,.15)", color: "#5ac8fa" }}>🚀 Boost ativo</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 3, lineHeight: 1.3 }}>{l.title}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        {l.views} views · {l.clicks} cliques · {l.conversions || 0} conversões
                        {l.price && ` · R$ ${Number(l.price).toLocaleString("pt-BR")}`}
                      </div>
                    </div>

                    <div style={{ width: 140, flexShrink: 0 }}>
                      <CtrBar ctr={ctr} />
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
                        Receita: <strong style={{ color: "var(--black)" }}>R$ {Number(l.revenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                      {isLow && (
                        <button className="btn btn-sm action-btn" onClick={() => optimize(l.id)}
                          disabled={optimizing === l.id}
                          style={{ fontSize: 11, background: "rgba(255,159,10,.12)", color: "#ff9f0a", fontWeight: 700, border: "1px solid rgba(255,159,10,.3)" }}>
                          {optimizing === l.id ? "⏳ Otimizando..." : "✦ Otimizar com IA"}
                        </button>
                      )}
                      <button className="btn btn-sm action-btn" onClick={() => openEdit(l)}
                        style={{ fontSize: 11, fontWeight: 700, background: "#334155", color: "white", border: "none" }}>✏️ Editar</button>
                      <button className="btn btn-sm action-btn" onClick={() => setLocation(`/marketplace/${l.slug}`)}
                        style={{ fontSize: 11, fontWeight: 600 }}>Ver →</button>
                      <button className="btn btn-sm action-btn" onClick={() => toggleStatus(l)}
                        style={{ fontSize: 11, fontWeight: 600 }}>{l.status === "active" ? "⏸ Pausar" : "▶ Reativar"}</button>
                      <button className="btn btn-sm action-btn" onClick={() => deleteListing(l.id)}
                        disabled={deletingId === l.id}
                        style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", border: "1px solid #fecaca" }}>
                        {deletingId === l.id ? "..." : "🗑️"}
                      </button>
                    </div>
                  </div>

                  {/* Sugestões da IA */}
                  {l.aiSuggestions && (
                    <div style={{ marginTop: 10, background: "var(--blue-l)", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--blue)", marginBottom: 4 }}>💡 Sugestões da IA</div>
                      {(Array.isArray(l.aiSuggestions) ? l.aiSuggestions : l.aiSuggestions.improvements || []).slice(0, 3).map((s: string, i: number) => (
                        <div key={i} style={{ fontSize: 11, color: "var(--blue)", marginBottom: 2 }}>• {s}</div>
                      ))}
                      {l.aiSuggestions.newHeadline && (
                        <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
                          Nova headline sugerida: <strong style={{ color: "var(--black)" }}>"{l.aiSuggestions.newHeadline}"</strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pedidos */}
        {activeTab === "orders" && (
          <div>
            {(data?.recentOrders || []).length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📬</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum pedido ainda</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Seus pedidos aparecerão aqui quando os clientes converterem</div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(data?.recentOrders || []).map((o: any, i: number) => (
                <div key={i} className="order-row"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 14, transition: "background .15s" }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: o.status === "completed" ? "rgba(48,209,88,.15)" : "var(--off)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
                  }}>{o.status === "completed" ? "✓" : "⏳"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>{o.buyerName || o.buyerEmail}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{o.listingTitle || "Oferta"} · {new Date(o.createdAt).toLocaleDateString("pt-BR")}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#30d158" }}>R$ {Number(o.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>Comissão: R$ {Number(o.commission || 0).toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Banner boost */}
        <div style={{
          marginTop: 28, background: "linear-gradient(135deg, var(--blue-l), var(--card))",
          border: "1px solid var(--blue-l)", borderRadius: 16, padding: "18px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>🚀 Aumente sua visibilidade com Boost</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Destaque sua oferta no topo do marketplace por 7, 15 ou 30 dias</div>
          </div>
          <button className="btn btn-md btn-primary" style={{ fontWeight: 700, fontSize: 12 }}>
            Ver planos de destaque →
          </button>
        </div>
      </div>
    </Layout>
  );
}

// Mock para preview
const MOCK_DATA = {
  stats: { activeListings: 3, totalViews: 1247, totalClicks: 58, totalOrders: 4, totalRevenue: 840 },
  listings: [
    { id:1, slug:"aptos-centro-sp", title:"Apartamentos no Centro de SP", niche:"imobiliario", status:"active", views:892, clicks:43, conversions:2, price:"380000", revenue:"0", boostActive:false, aiSuggestions:["Adicionar vídeo de tour virtual","Incluir urgência: 'Apenas 3 restantes'","Adicionar número de unidades"] },
    { id:2, slug:"gestao-trafego-pro", title:"Gestão de Tráfego Pago — Resultados em 30 dias", niche:"servicos", status:"active", views:255, clicks:8, conversions:1, price:"1200", revenue:"1200", boostActive:true },
    { id:3, slug:"curso-emagrecimento", title:"Curso Emagrecimento Definitivo 21 Dias", niche:"infoprodutos", status:"paused", views:100, clicks:2, conversions:1, price:"197", revenue:"197" },
  ],
  recentOrders: [
    { buyerName:"João Silva", buyerEmail:"joao@email.com", listingTitle:"Curso Emagrecimento", amount:"197", commission:"19.70", status:"completed", createdAt:new Date().toISOString() },
    { buyerName:"Maria Fernanda", buyerEmail:"maria@email.com", listingTitle:"Gestão de Tráfego", amount:"1200", commission:"120.00", status:"completed", createdAt:new Date(Date.now()-86400000).toISOString() },
  ],
};
