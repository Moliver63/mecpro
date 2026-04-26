/**
 * PixelPanel.tsx
 * Painel de status do Pixel Meta + criação de audiências de retargeting
 * Mostra: pixels conectados, eventos recentes, audiências existentes
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface PixelPanelProps {
  pageId?: string;
  onClose?: () => void;
}

const EVENT_LABELS: Record<string, { icon: string; label: string }> = {
  PageView:         { icon: "👁️",  label: "Visualizações de página" },
  Lead:             { icon: "📋",  label: "Leads capturados" },
  Purchase:         { icon: "💰",  label: "Compras" },
  InitiateCheckout: { icon: "🛒",  label: "Checkouts iniciados" },
  AddToCart:        { icon: "🛍️",  label: "Adicionado ao carrinho" },
  ViewContent:      { icon: "📄",  label: "Conteúdo visualizado" },
  CompleteRegistration: { icon: "✅", label: "Cadastros completos" },
  Contact:          { icon: "📞",  label: "Contatos" },
  Search:           { icon: "🔍",  label: "Buscas" },
};

const AUDIENCE_TYPES = [
  { key: "pixel_visitors",  label: "Visitantes do site",       icon: "🌐", desc: "Pessoas que visitaram seu site rastreado pelo pixel" },
  { key: "page_engagers",   label: "Engajadores da página",    icon: "📱", desc: "Pessoas que curtiram, comentaram ou interagiram com sua página" },
  { key: "video_viewers",   label: "Quem viu seus vídeos",     icon: "🎥", desc: "Pessoas que assistiram seus vídeos no Facebook/Instagram" },
  { key: "ad_clickers",     label: "Quem clicou nos anúncios", icon: "🖱️", desc: "Pessoas que clicaram em seus anúncios ativos" },
];

export default function PixelPanel({ pageId, onClose }: PixelPanelProps) {
  const [tab, setTab]           = useState<"status" | "audiences" | "create">("status");
  const [creating, setCreating] = useState(false);
  const [newAud, setNewAud]     = useState({ name: "", type: "pixel_visitors" as string, days: 30, pixelId: "", pageId: pageId || "" });

  const { data, isLoading, refetch } = (trpc as any).integrations?.getPixelStatus?.useQuery?.({},
    { refetchOnWindowFocus: false }
  ) ?? { data: null, isLoading: false, refetch: () => {} };

  const createMutation = (trpc as any).integrations?.createRetargetingAudience?.useMutation?.({
    onSuccess: (d: any) => {
      toast.success(`✅ Audiência "${d.name}" criada! Pode levar 30min para popular.`);
      setCreating(false);
      setTab("audiences");
      refetch?.();
    },
    onError: (e: any) => {
      toast.error("Erro: " + (e.message || "tente novamente"));
      setCreating(false);
    },
  }) ?? { mutate: () => {}, isPending: false };

  const pixels    = data?.pixels    || [];
  const events    = data?.events    || [];
  const audiences = data?.audiences || [];
  const hasPixel  = pixels.length > 0;
  const totalEvents = events.reduce((s: number, e: any) => s + (e.count || 0), 0);

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18,
      overflow: "hidden", fontFamily: "var(--font)" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0f172a,#1e3a5f)", padding: "16px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>📡</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>Pixel & Audiências</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Meta Ads — rastreamento e retargeting</div>
          </div>
        </div>
        {onClose && <button onClick={onClose} style={{ background: "#334155", color: "#94a3b8",
          border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>✕</button>}
      </div>

      {/* Status geral */}
      {isLoading ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          ⏳ Consultando Meta API...
        </div>
      ) : !data?.connected ? (
        <div style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔌</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Conta Meta não conectada</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Conecte sua conta Meta Ads nas Integrações para ver o status do pixel.</div>
        </div>
      ) : (
        <>
          {/* Resumo rápido */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0, borderBottom: "1px solid var(--border)" }}>
            {[
              { label: "Pixels", value: pixels.length, icon: "📡", color: hasPixel ? "#16a34a" : "#dc2626", bg: hasPixel ? "#f0fdf4" : "#fef2f2" },
              { label: "Eventos (7d)", value: totalEvents.toLocaleString("pt-BR"), icon: "⚡", color: "#2563eb", bg: "#eff6ff" },
              { label: "Audiências", value: audiences.length, icon: "👥", color: "#7c3aed", bg: "#f5f3ff" },
            ].map(s => (
              <div key={s.label} style={{ padding: "14px 16px", background: s.bg, textAlign: "center", borderRight: "1px solid var(--border)" }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--off)" }}>
            {[
              { key: "status",    label: "📊 Status do Pixel" },
              { key: "audiences", label: "👥 Audiências" },
              { key: "create",    label: "+ Criar audiência" },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)} style={{
                flex: 1, padding: "10px 8px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                background: tab === t.key ? "white" : "transparent",
                color: tab === t.key ? "var(--black)" : "var(--muted)",
                borderBottom: tab === t.key ? "2px solid var(--blue)" : "2px solid transparent",
              }}>{t.label}</button>
            ))}
          </div>

          <div style={{ padding: "16px 18px" }}>

            {/* ── Tab: Status ── */}
            {tab === "status" && (
              <div>
                {/* Pixels */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase",
                    letterSpacing: 1, marginBottom: 10 }}>🎯 Pixels instalados</div>
                  {pixels.length === 0 ? (
                    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 12, padding: "16px" }}>
                      <div style={{ fontWeight: 700, color: "#dc2626", marginBottom: 6, fontSize: 13 }}>
                        ⚠️ Nenhum pixel encontrado
                      </div>
                      <div style={{ fontSize: 12, color: "#991b1b", lineHeight: 1.6 }}>
                        Sem o pixel instalado no seu site, você não consegue:<br/>
                        • Rastrear quem visitou ou comprou<br/>
                        • Criar audiências de retargeting<br/>
                        • Otimizar campanhas por conversão<br/><br/>
                        <strong>Como instalar:</strong> Acesse <a href="https://business.facebook.com/events_manager" target="_blank" style={{ color: "#dc2626" }}>Events Manager</a> → Criar pixel → Copiar código → Colar no seu site antes de {"</head>"}
                      </div>
                    </div>
                  ) : pixels.map((px: any) => (
                    <div key={px.id} style={{ background: px.active ? "#f0fdf4" : "#fef2f2",
                      border: `1px solid ${px.active ? "#86efac" : "#fca5a5"}`,
                      borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>{px.name}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>ID: {px.id}</div>
                          {px.lastFired && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Último disparo: {px.lastFired}</div>}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                          background: px.active ? "#dcfce7" : "#fee2e2", color: px.active ? "#166534" : "#dc2626" }}>
                          {px.active ? "● Ativo" : "● Inativo"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Eventos */}
                {events.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase",
                      letterSpacing: 1, marginBottom: 10 }}>⚡ Eventos dos últimos 7 dias</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {events.sort((a: any, b: any) => b.count - a.count).map((ev: any) => {
                        const cfg = EVENT_LABELS[ev.name] || { icon: "◌", label: ev.name };
                        const pct = totalEvents > 0 ? Math.round(ev.count / totalEvents * 100) : 0;
                        return (
                          <div key={ev.name} style={{ display: "flex", alignItems: "center", gap: 10,
                            background: "var(--off)", borderRadius: 10, padding: "8px 12px" }}>
                            <span style={{ fontSize: 16, flexShrink: 0 }}>{cfg.icon}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--black)" }}>{cfg.label}</span>
                                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--blue)" }}>
                                  {ev.count.toLocaleString("pt-BR")}
                                </span>
                              </div>
                              <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: "var(--blue)", borderRadius: 2 }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
                      ℹ️ Esses são os eventos rastreados pelo pixel no seu site. Cliques nos anúncios e interações são contabilizados aqui.
                    </div>
                  </div>
                )}

                {events.length === 0 && hasPixel && (
                  <div style={{ background: "#fefce8", border: "1px solid #fde047", borderRadius: 12, padding: "14px" }}>
                    <div style={{ fontWeight: 700, color: "#ca8a04", fontSize: 13, marginBottom: 4 }}>
                      ⚠️ Pixel instalado mas sem eventos recentes
                    </div>
                    <div style={{ fontSize: 12, color: "#92400e", lineHeight: 1.6 }}>
                      O pixel existe mas não está disparando eventos. Verifique:<br/>
                      • O código do pixel está no {"<head>"} de todas as páginas?<br/>
                      • O domínio está verificado no Business Manager?<br/>
                      • Use o <strong>Meta Pixel Helper</strong> (extensão Chrome) para diagnosticar
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Audiências ── */}
            {tab === "audiences" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase",
                  letterSpacing: 1, marginBottom: 12 }}>👥 Audiências personalizadas</div>
                {audiences.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)" }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Nenhuma audiência criada</div>
                    <div style={{ fontSize: 12 }}>Crie audiências de retargeting para re-impactar quem já interagiu com sua marca</div>
                    <button onClick={() => setTab("create")} className="btn btn-md btn-primary"
                      style={{ marginTop: 12, fontSize: 12, fontWeight: 700 }}>
                      + Criar primeira audiência
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {audiences.map((aud: any) => (
                      <div key={aud.id} style={{ background: "var(--off)", borderRadius: 12, padding: "12px 14px",
                        border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>{aud.name}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                              {aud.type} · {aud.count > 0 ? `~${aud.count.toLocaleString("pt-BR")} pessoas` : "Populando..."}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--blue)" }}>
                              {aud.count > 0 ? aud.count.toLocaleString("pt-BR") : "—"}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--muted)" }}>pessoas</div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
                      ℹ️ Use essas audiências nos Públicos dos seus Conjuntos de Anúncios para re-impactar quem já conhece sua marca
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Criar audiência ── */}
            {tab === "create" && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--black)", marginBottom: 14 }}>
                  Criar audiência de retargeting
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    Nome da audiência
                  </label>
                  <input className="input" value={newAud.name} onChange={e => setNewAud(a => ({ ...a, name: e.target.value }))}
                    placeholder="Ex: Visitantes 30 dias — Imóveis BC" style={{ width: "100%", fontSize: 13 }} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 6 }}>
                    Tipo de audiência
                  </label>
                  {AUDIENCE_TYPES.map(t => (
                    <div key={t.key} onClick={() => setNewAud(a => ({ ...a, type: t.key }))}
                      style={{ border: `2px solid ${newAud.type === t.key ? "var(--blue)" : "var(--border)"}`,
                        borderRadius: 10, padding: "10px 12px", marginBottom: 6, cursor: "pointer",
                        background: newAud.type === t.key ? "var(--blue-l)" : "transparent" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{t.icon}</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: newAud.type === t.key ? "var(--blue)" : "var(--black)" }}>
                            {t.label}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{t.desc}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {newAud.type === "pixel_visitors" && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                      ID do Pixel
                    </label>
                    <input className="input" value={newAud.pixelId} onChange={e => setNewAud(a => ({ ...a, pixelId: e.target.value }))}
                      placeholder={pixels[0]?.id || "Ex: 1234567890123456"} style={{ width: "100%", fontSize: 13 }} />
                    {pixels[0] && !newAud.pixelId && (
                      <button onClick={() => setNewAud(a => ({ ...a, pixelId: pixels[0].id }))}
                        style={{ fontSize: 11, color: "var(--blue)", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}>
                        Usar {pixels[0].name} ({pixels[0].id})
                      </button>
                    )}
                  </div>
                )}

                {newAud.type === "page_engagers" && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                      ID da Página Facebook
                    </label>
                    <input className="input" value={newAud.pageId} onChange={e => setNewAud(a => ({ ...a, pageId: e.target.value }))}
                      placeholder={pageId || "Ex: 103439422082305"} style={{ width: "100%", fontSize: 13 }} />
                    {pageId && !newAud.pageId && (
                      <button onClick={() => setNewAud(a => ({ ...a, pageId: pageId! }))}
                        style={{ fontSize: 11, color: "var(--blue)", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}>
                        Usar página atual ({pageId})
                      </button>
                    )}
                  </div>
                )}

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    Janela de retenção: {newAud.days} dias
                  </label>
                  <input type="range" min={7} max={180} value={newAud.days}
                    onChange={e => setNewAud(a => ({ ...a, days: Number(e.target.value) }))}
                    style={{ width: "100%", accentColor: "var(--blue)" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)" }}>
                    <span>7 dias</span><span>90 dias</span><span>180 dias</span>
                  </div>
                </div>

                <div style={{ background: "var(--blue-l)", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 11, color: "var(--blue)" }}>
                  ℹ️ Após criar, a audiência leva até 30 minutos para ser populada. Use ela nos Conjuntos de Anúncios para re-impactar essas pessoas.
                </div>

                <button onClick={() => {
                    if (!newAud.name) { toast.error("Informe um nome para a audiência"); return; }
                    setCreating(true);
                    createMutation.mutate({ name: newAud.name, type: newAud.type as any,
                      pixelId: newAud.pixelId || undefined, pageId: newAud.pageId || undefined,
                      retentionDays: newAud.days });
                  }}
                  disabled={creating || createMutation.isPending}
                  className="btn btn-md btn-primary" style={{ width: "100%", fontWeight: 800, fontSize: 13 }}>
                  {creating ? "⏳ Criando audiência..." : "✦ Criar audiência de retargeting"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
