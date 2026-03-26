import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

// ── types ──────────────────────────────────────────────────────────────────────
interface VideoScene {
  scene: number;
  duration: string;
  visual: string;
  text: string;
  voiceover: string;
  musicMood: string;
  transition: string;
}

interface VideoScript {
  title: string;
  totalDuration: string;
  hook: string;
  format: string;
  ratio: string;
  targetEmotion: string;
  scenes: VideoScene[];
  hashtags: string[];
  bestPostTime: string;
  viralTip: string;
  cta: string;
}

const VIDEO_FORMATS = [
  { value: "product_demo",   label: "🛍️ Demo de produto", duration: "30s" },
  { value: "testimonial",    label: "💬 Depoimento / Prova social", duration: "45s" },
  { value: "tutorial",       label: "🎓 Tutorial / How-to", duration: "60s" },
  { value: "hook_offer",     label: "⚡ Hook + Oferta irresistível", duration: "15s" },
  { value: "behind_scenes",  label: "🎬 Bastidores", duration: "30s" },
  { value: "problem_solution", label: "❓ Problema → Solução", duration: "45s" },
  { value: "ugc_style",      label: "📱 Estilo UGC (User Generated)", duration: "30s" },
  { value: "trending_sound", label: "🎵 Trend / Som viral", duration: "15s" },
];

const TONES = [
  { value: "urgente",      label: "🔥 Urgente / FOMO" },
  { value: "emocional",    label: "❤️ Emocional / Inspirador" },
  { value: "humoristico",  label: "😂 Humorístico" },
  { value: "educativo",    label: "📚 Educativo / Informativo" },
  { value: "exclusivo",    label: "💎 Exclusivo / Premium" },
  { value: "desafio",      label: "🏆 Desafio / Competição" },
];

function SceneCard({ scene, index }: { scene: any; index: any; [key: string]: any }) {
  const colors = ["#1877f2","#1a73e8","#7c3aed","#010101","#0891b2","#059669"];
  const color  = colors[index % colors.length];
  return (
    <div style={{ border: `2px solid ${color}22`, borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
      {/* Scene header */}
      <div style={{ background: color, padding: "8px 16px", display: "flex",
        alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>
          🎬 Cena {scene.scene} — {scene.duration}
        </span>
        <span style={{ color: "rgba(255,255,255,.7)", fontSize: 11 }}>
          {scene.transition}
        </span>
      </div>
      {/* TikTok preview (9:16 ratio mockup) */}
      <div style={{ display: "flex", gap: 12, padding: 14 }}>
        <div style={{ width: 72, height: 128, background: "#0a0a0a", borderRadius: 10,
          flexShrink: 0, display: "flex", flexDirection: "column" as const,
          alignItems: "center", justifyContent: "flex-end", padding: 6,
          position: "relative" as const, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: `linear-gradient(180deg, transparent 40%, ${color}99 100%)` }} />
          <p style={{ color: "#fff", fontSize: 7, textAlign: "center" as const,
            position: "relative", zIndex: 1, lineHeight: 1.3, margin: 0 }}>
            {scene.text.slice(0, 40)}
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#374151" }}>
            🖼️ Visual
          </p>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
            {scene.visual}
          </p>
          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "#374151" }}>
            🎤 Narração
          </p>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
            {scene.voiceover}
          </p>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ background: "#f5f3ff", color: "#7c3aed", padding: "2px 8px",
              borderRadius: 6, fontSize: 10, fontWeight: 700 }}>
              🎵 {scene.musicMood}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TikTokVideoCreator() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string; campaignId?: string }>();
  const projectId  = params.id       ? Number(params.id)       : undefined;
  const campaignId = params.campaignId ? Number(params.campaignId) : undefined;

  const [format,   setFormat]   = useState("hook_offer");
  const [tone,     setTone]     = useState("urgente");
  const [product,  setProduct]  = useState("");
  const [audience, setAudience] = useState("");
  const [cta,      setCta]      = useState("");
  const [loading,  setLoading]  = useState(false);
  const [script,   setScript]   = useState<VideoScript | null>(null);
  const [copied,   setCopied]   = useState(false);

  const generateMutation = trpc.tiktokVideo.generate.useMutation({
    onSuccess: (d: any) => {
      setScript(d.script);
      setLoading(false);
      toast.success("🎬 Roteiro TikTok gerado pela IA!");
    },
    onError: (e) => {
      toast.error("Erro: " + e.message);
      setLoading(false);
    },
  });

  // Load campaign data if coming from CampaignResult
  const { data: campaign } = trpc.campaigns.get.useQuery(
    { id: campaignId! }, { enabled: !!campaignId, retry: false }
  );

  React.useEffect(() => {
    if (campaign && !product) {
      const c = campaign as any;
      try {
        const extra = JSON.parse(c.aiResponse || "{}");
        const crs   = JSON.parse(c.creatives || "[]");
        setProduct(c.name || "");
        if (Array.isArray(crs) && crs[0]?.cta) setCta(crs[0].cta);
      } catch {}
    }
  }, [campaign]);

  const handleGenerate = () => {
    if (!product) { toast.error("Descreva o produto/serviço"); return; }
    setLoading(true);
    generateMutation.mutate({
      format, tone, product, audience, cta,
      campaignId: campaignId || 0,
      projectId:  projectId  || 0,
    });
  };

  const handleCopy = () => {
    if (!script) return;
    const text = [
      `📱 ROTEIRO TIKTOK — ${script.title}`,
      `⏱️ Duração: ${script.totalDuration} | Formato: ${format} | Ratio: ${script.ratio}`,
      `🎣 Hook: ${script.hook}`,
      "",
      ...script.scenes.map(s =>
        `CENA ${s.scene} (${s.duration}):\n  Visual: ${s.visual}\n  Texto: ${s.text}\n  Narração: ${s.voiceover}\n  Música: ${s.musicMood}`
      ),
      "",
      `📢 CTA: ${script.cta}`,
      `#️⃣ Hashtags: ${script.hashtags.join(" ")}`,
      `⏰ Melhor horário: ${script.bestPostTime}`,
      `💡 Dica viral: ${script.viralTip}`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("📋 Roteiro copiado!");
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0",
    borderRadius: 10, fontSize: 14, outline: "none", marginBottom: 12,
    background: "#f8fafc", boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => setLocation(-1 as any)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22 }}>←</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🎵 TikTok Video AI</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            Gere roteiros, storyboards e scripts completos com IA
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: script ? "1fr 1fr" : "1fr", gap: 20 }}>
        {/* Left: form */}
        <div>
          <div style={{ background: "#fff", border: "1.5px solid #e2e8f0",
            borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 800 }}>⚙️ Configurar vídeo</h3>

            <label style={{ fontSize: 12, fontWeight: 600 }}>Formato do Vídeo</label>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 14 }}>
              {VIDEO_FORMATS.map(f => (
                <button key={f.value} onClick={() => setFormat(f.value)}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid",
                    borderColor: format === f.value ? "#010101" : "#e2e8f0",
                    background: format === f.value ? "#010101" : "#fff",
                    color: format === f.value ? "#fff" : "#374151",
                    fontWeight: 600, fontSize: 11, cursor: "pointer" }}>
                  {f.label}
                  <span style={{ marginLeft: 4, opacity: .6, fontSize: 10 }}>{f.duration}</span>
                </button>
              ))}
            </div>

            <label style={{ fontSize: 12, fontWeight: 600 }}>Tom / Estilo</label>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 14 }}>
              {TONES.map(t => (
                <button key={t.value} onClick={() => setTone(t.value)}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid",
                    borderColor: tone === t.value ? "#7c3aed" : "#e2e8f0",
                    background: tone === t.value ? "#7c3aed" : "#fff",
                    color: tone === t.value ? "#fff" : "#374151",
                    fontWeight: 600, fontSize: 11, cursor: "pointer" }}>
                  {t.label}
                </button>
              ))}
            </div>

            <label style={{ fontSize: 12, fontWeight: 600 }}>Produto / Serviço *</label>
            <input style={inp} placeholder="Ex: Software de marketing digital para PMEs"
              value={product} onChange={e => setProduct(e.target.value)} />

            <label style={{ fontSize: 12, fontWeight: 600 }}>Público-alvo</label>
            <input style={inp} placeholder="Ex: Empreendedores 25-45, donos de agência"
              value={audience} onChange={e => setAudience(e.target.value)} />

            <label style={{ fontSize: 12, fontWeight: 600 }}>CTA desejado</label>
            <input style={inp} placeholder="Ex: Acesse o link na bio, Cadastre grátis"
              value={cta} onChange={e => setCta(e.target.value)} />

            <button onClick={handleGenerate} disabled={loading}
              style={{ width: "100%", padding: 14, background: "#010101", color: "#fff",
                border: "none", borderRadius: 12, fontWeight: 800, fontSize: 14,
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? .7 : 1 }}>
              {loading ? "⏳ Gerando roteiro com IA…" : "🎬 Gerar Roteiro TikTok"}
            </button>
          </div>

          {/* Tip box */}
          <div style={{ background: "#fafafa", border: "1.5px solid #e2e8f0",
            borderRadius: 14, padding: 14 }}>
            <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 12 }}>💡 Dicas de performance</p>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#64748b", lineHeight: 1.9 }}>
              <li>Primeiros <strong>3 segundos</strong> são decisivos para o hook</li>
              <li>Texto na tela aumenta retenção em <strong>+40%</strong></li>
              <li>Vídeos entre <strong>15-30s</strong> têm maior taxa de conclusão</li>
              <li>Use <strong>trending sounds</strong> para boost orgânico</li>
              <li>Poste entre <strong>18h-22h</strong> para maior alcance no Brasil</li>
            </ul>
          </div>
        </div>

        {/* Right: script output */}
        {script && (
          <div>
            {/* Script header */}
            <div style={{ background: "linear-gradient(135deg,#010101,#7c3aed)",
              borderRadius: 16, padding: 20, marginBottom: 16, color: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>{script.title}</h3>
                  <p style={{ margin: 0, fontSize: 12, opacity: .8 }}>
                    ⏱️ {script.totalDuration} · {script.ratio} · {script.format}
                  </p>
                </div>
                <button onClick={handleCopy}
                  style={{ background: "rgba(255,255,255,.15)", color: "#fff", border: "none",
                    borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                  {copied ? "✅ Copiado!" : "📋 Copiar"}
                </button>
              </div>
              <div style={{ marginTop: 12, background: "rgba(255,255,255,.1)",
                borderRadius: 10, padding: 10 }}>
                <p style={{ margin: "0 0 4px", fontSize: 11, opacity: .7 }}>🎣 HOOK (primeiros 3s)</p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{script.hook}</p>
              </div>
            </div>

            {/* Scenes */}
            <div style={{ maxHeight: 520, overflowY: "auto" as const, paddingRight: 4 }}>
              {script.scenes.map((scene, i) => (
                <SceneCard key={i} scene={scene} index={i} />
              ))}
            </div>

            {/* Footer: hashtags + tip */}
            <div style={{ background: "#fff", border: "1.5px solid #e2e8f0",
              borderRadius: 14, padding: 14, marginTop: 12 }}>
              <p style={{ margin: "0 0 8px", fontSize: 12 }}>
                📢 <strong>CTA Final:</strong> {script.cta}
              </p>
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "#010101", lineHeight: 1.8 }}>
                {script.hashtags.join(" ")}
              </p>
              <p style={{ margin: "0 0 4px", fontSize: 11 }}>
                ⏰ <strong>Melhor horário:</strong> {script.bestPostTime}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: "#7c3aed" }}>
                💡 <strong>Dica viral:</strong> {script.viralTip}
              </p>
            </div>

            {/* Publish shortcut */}
            {projectId && campaignId && (
              <button
                onClick={() => setLocation(`/projects/${projectId}/tiktok-campaign?campaignId=${campaignId}`)}
                style={{ width: "100%", marginTop: 12, padding: 12, background: "#010101",
                  color: "#fff", border: "none", borderRadius: 12, fontWeight: 700,
                  fontSize: 13, cursor: "pointer" }}>
                🚀 Usar este roteiro → Publicar no TikTok Ads
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
