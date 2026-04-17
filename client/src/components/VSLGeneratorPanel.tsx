/**
 * VSLGeneratorPanel.tsx
 *
 * Painel de geração de vídeos cinematográficos via VSL Forge + Gemini.
 * Integrado ao CampaignResult.tsx e Academy.
 *
 * USO:
 *   import VSLGeneratorPanel from "@/components/VSLGeneratorPanel";
 *
 *   <VSLGeneratorPanel
 *     campaignId={campaign.id}
 *     platform={campaign.platform}
 *     objective={campaign.objective}
 *     niche={clientProfile?.niche}
 *     productName={clientProfile?.companyName}
 *   />
 */

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  campaignId?:    number;
  platform?:      string;
  objective?:     string;
  niche?:         string;
  productName?:   string;
  targetAudience?: string;
  mainBenefit?:   string;
  cta?:           string;
  onVideoReady?:  (videoUrl: string, format: string) => void;
}

type Step = "format" | "script" | "generate" | "result";

const FORMAT_INFO: Record<string, { icon: string; color: string; platforms: string[] }> = {
  reels_9_16:   { icon: "📱", color: "#e1306c", platforms: ["Instagram Reels", "TikTok", "Facebook Reels"] },
  stories_9_16: { icon: "⭕", color: "#f58529", platforms: ["Instagram Stories", "Facebook Stories"] },
  feed_4_5:     { icon: "🖼️", color: "#405de6", platforms: ["Instagram Feed", "Facebook Feed"] },
  youtube_16_9: { icon: "▶️", color: "#ff0000", platforms: ["YouTube Ads", "Google Display"] },
  feed_1_1:     { icon: "⬜", color: "#1877f2", platforms: ["Feed Universal"] },
  academy_16_9: { icon: "🎓", color: "#16a34a", platforms: ["MECPro Academy"] },
};

const MOTION_OPTIONS = [
  { value: "push_in",      label: "Aproximar" },
  { value: "pull_out",     label: "Afastar" },
  { value: "slow_zoom_in", label: "Zoom lento" },
  { value: "drift",        label: "Deriva lateral" },
  { value: "breathe",      label: "Respirar" },
  { value: "pan_right",    label: "Panorâmica direita" },
  { value: "static",       label: "Estático" },
];

const COLOR_GRADE_OPTIONS = [
  { value: "warm_film",   label: "🎞️ Filme quente" },
  { value: "teal_orange", label: "🎬 Teal & Orange" },
  { value: "moody_teal",  label: "💙 Dark moody" },
  { value: "clean",       label: "✨ Clean" },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function VSLGeneratorPanel({
  campaignId, platform, objective, niche,
  productName, targetAudience, mainBenefit, cta,
  onVideoReady,
}: Props) {
  const [step, setStep]                 = useState<Step>("format");
  const [selectedFormat, setFormat]     = useState("reels_9_16");
  const [script, setScript]             = useState<any>(null);
  const [editingScene, setEditingScene] = useState<number | null>(null);
  const [activeJobId, setActiveJobId]   = useState<string | null>(null);
  const [jobStatus, setJobStatus]       = useState<any>(null);
  const [pollInterval, setPollInterval] = useState<any>(null);
  const [expanded, setExpanded]         = useState(false);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null);

  // Form de configuração do roteiro
  const [form, setForm] = useState({
    productName:    productName    || "",
    targetAudience: targetAudience || "",
    mainBenefit:    mainBenefit    || "",
    cta:            cta            || "Clique agora",
    duration:       60,
    style:          "emocional e persuasivo",
    voice:          "hpp4J3VqNfWAUOO0d1Us",
    draft:          false,
  });

  // tRPC
  const healthQuery       = (trpc as any).vsl?.serviceHealth?.useQuery?.();
  const formatsQuery      = (trpc as any).vsl?.listFormats?.useQuery?.();
  const voicesQuery       = (trpc as any).vsl?.listVoices?.useQuery?.();
  const generateTTSMutation = (trpc as any).vsl?.generateSceneTTS?.useMutation?.();
  const statusQuery     = (trpc as any).vsl?.jobStatus?.useQuery?.(
    { jobId: activeJobId! },
    { enabled: !!activeJobId, refetchInterval: activeJobId ? 3000 : false }
  );

  const generateScriptMutation = (trpc as any).vsl?.generateScript?.useMutation?.({
    onSuccess: (data: any) => {
      setScript(data);
      setStep("script");
      toast.success(`✅ Roteiro gerado com ${data.scenes.length} cenas!`);
    },
    onError: (e: any) => toast.error(`❌ ${e.message}`),
  });

  const startGenerationMutation = (trpc as any).vsl?.startGeneration?.useMutation?.({
    onSuccess: (data: any) => {
      setActiveJobId(data.jobId);
      setStep("generate");
      toast.success(`🎬 Geração iniciada! Estimativa: ${data.estimatedMin} minutos`);
    },
    onError: (e: any) => toast.error(`❌ ${e.message}`),
  });

  // Verifica status do job
  useEffect(() => {
    if (!statusQuery?.data) return;
    const s = statusQuery.data;
    setJobStatus(s);

    if (s.status === "done") {
      setStep("result");
      toast.success("🎉 Vídeo pronto!");
      if (onVideoReady && s.videoUrl) onVideoReady(s.videoUrl, selectedFormat);
    } else if (s.status === "error") {
      toast.error(`❌ Erro na geração: ${s.error?.slice(0, 100)}`);
    }
  }, [statusQuery?.data]);

  // Verifica disponibilidade do serviço
  useEffect(() => {
    if (healthQuery?.data) {
      setServiceAvailable(healthQuery.data.available);
    }
  }, [healthQuery?.data]);

  const formats = formatsQuery?.data?.formats || {};

  const handleGenerateScript = () => {
    if (!form.productName.trim()) {
      toast.error("Informe o nome do produto/serviço");
      return;
    }
    generateScriptMutation?.mutate({
      format:         selectedFormat,
      platform:       platform || "meta",
      objective:      objective || "leads",
      niche:          niche    || "geral",
      productName:    form.productName,
      targetAudience: form.targetAudience,
      mainBenefit:    form.mainBenefit,
      cta:            form.cta,
      duration:       form.duration,
      style:          form.style,
    });
  };

  const handleStartGeneration = () => {
    if (!script?.scenes?.length) return;
    startGenerationMutation?.mutate({
      campaignId,
      projectName:  form.productName.replace(/\s+/g, "_").toLowerCase(),
      format:       selectedFormat,
      title:        script.title,
      scenes:       script.scenes,
      voice:        form.voice,
      addSubtitles: true,
      colorGrade:   "warm_film",
      draft:        form.draft,
    });
  };

  const updateScene = (idx: number, field: string, value: any) => {
    if (!script) return;
    const scenes = [...script.scenes];
    scenes[idx] = { ...scenes[idx], [field]: value };
    setScript({ ...script, scenes });
  };

  const fmtInfo = FORMAT_INFO[selectedFormat] || FORMAT_INFO.reels_9_16;

  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 18, padding: 24, marginBottom: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 2 }}>
            🎬 Gerador de Vídeos com IA
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Gemini gera o roteiro · FLUX gera as imagens · ElevenLabs narra · FFmpeg monta
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {serviceAvailable !== null && (
            <div style={{
              fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
              background: serviceAvailable ? "#f0fdf4" : "#fef2f2",
              color: serviceAvailable ? "#16a34a" : "#dc2626",
              border: `1px solid ${serviceAvailable ? "#86efac" : "#fca5a5"}`,
            }}>
              {serviceAvailable ? "✅ Serviço online" : "❌ Serviço offline"}
            </div>
          )}
          <button onClick={() => setExpanded(v => !v)} style={{
            fontSize: 11, padding: "5px 12px", borderRadius: 20,
            border: "1px solid #e2e8f0", background: "white", cursor: "pointer", color: "#64748b",
          }}>
            {expanded ? "▲ Fechar" : "▼ Abrir"}
          </button>
        </div>
      </div>

      {!expanded && (
        <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "8px 0" }}>
          Clique em "Abrir" para gerar vídeos para Reels, TikTok, YouTube e Academy
        </div>
      )}

      {expanded && (
        <>
          {/* Steps */}
          <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "2px solid #e2e8f0" }}>
            {(["format", "script", "generate", "result"] as Step[]).map((s, i) => {
              const labels = ["1. Formato", "2. Roteiro", "3. Gerar", "4. Resultado"];
              const done   = ["format","script","generate","result"].indexOf(step) > i;
              const active = step === s;
              return (
                <div key={s} style={{
                  padding: "10px 16px", fontSize: 12, fontWeight: active ? 800 : 500,
                  color: active ? "#0f172a" : done ? "#16a34a" : "#94a3b8",
                  borderBottom: `2px solid ${active ? "#0f172a" : "transparent"}`,
                  marginBottom: -2, cursor: done ? "pointer" : "default",
                }} onClick={() => done && setStep(s)}>
                  {done ? "✓ " : ""}{labels[i]}
                </div>
              );
            })}
          </div>

          {/* ── STEP 1: Formato ── */}
          {step === "format" && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>
                Escolha o formato do vídeo
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 12, marginBottom: 24 }}>
                {Object.entries(formats).map(([key, fmt]: [string, any]) => {
                  const info = FORMAT_INFO[key] || { icon: "🎬", color: "#64748b", platforms: [] };
                  return (
                    <div key={key}
                      onClick={() => setFormat(key)}
                      style={{
                        border: `2px solid ${selectedFormat === key ? info.color : "#e2e8f0"}`,
                        borderRadius: 14, padding: 16, cursor: "pointer",
                        background: selectedFormat === key ? `${info.color}10` : "white",
                        transition: "all 0.15s",
                      }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>{info.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
                        {fmt.label || key}
                      </div>
                      <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 8 }}>
                        {fmt.resolution || "—"}
                      </div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {info.platforms.map(p => (
                          <span key={p} style={{
                            fontSize: 9, padding: "2px 6px", borderRadius: 10,
                            background: "#f1f5f9", color: "#64748b", fontWeight: 600,
                          }}>{p}</span>
                        ))}
                      </div>
                      {selectedFormat === key && (
                        <div style={{ marginTop: 8, fontSize: 11, color: info.color, fontWeight: 700 }}>✓ Selecionado</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Config básica */}
              <div style={{ background: "#f8fafc", borderRadius: 14, padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>
                  📝 Informações do produto
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { label: "Produto/Serviço *", field: "productName",    placeholder: "Ex: Curso de Investimentos" },
                    { label: "Público-alvo",       field: "targetAudience", placeholder: "Ex: Mulheres 30-50 anos" },
                    { label: "Principal benefício", field: "mainBenefit",   placeholder: "Ex: Dobrar a renda em 90 dias" },
                    { label: "CTA",                field: "cta",            placeholder: "Ex: Clique e saiba mais" },
                  ].map(f => (
                    <div key={f.field}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>
                        {f.label}
                      </label>
                      <input
                        className="input"
                        placeholder={f.placeholder}
                        value={(form as any)[f.field]}
                        onChange={e => setForm(prev => ({ ...prev, [f.field]: e.target.value }))}
                        style={{ fontSize: 12 }}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>
                      Duração total (segundos)
                    </label>
                    <select className="input" value={form.duration}
                      onChange={e => setForm(prev => ({ ...prev, duration: Number(e.target.value) }))}
                      style={{ fontSize: 12 }}>
                      <option value={30}>30s — Ultra curto (Stories/TikTok)</option>
                      <option value={60}>60s — Curto (Reels)</option>
                      <option value={90}>90s — Médio</option>
                      <option value={120}>2 min — Longo</option>
                      <option value={180}>3 min — YouTube</option>
                      <option value={600}>10 min — Aula</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>
                      Estilo narrativo
                    </label>
                    <select className="input" value={form.style}
                      onChange={e => setForm(prev => ({ ...prev, style: e.target.value }))}
                      style={{ fontSize: 12 }}>
                      <option value="emocional e persuasivo">Emocional e persuasivo</option>
                      <option value="storytelling com personagem">Storytelling com personagem</option>
                      <option value="direto e objetivo">Direto e objetivo</option>
                      <option value="educacional e informativo">Educacional e informativo</option>
                      <option value="urgência e escassez">Urgência e escassez</option>
                    </select>
                  </div>
                </div>

                {/* Seletor de voz ElevenLabs */}
                <div style={{ marginTop: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>
                    🎙️ Voz da narração {voicesQuery?.data?.configured ? "(ElevenLabs ativo)" : "(configure ELEVENLABS_API_KEY)"}
                  </label>
                  <select className="input" value={form.voice}
                    onChange={e => setForm((prev: any) => ({ ...prev, voice: e.target.value }))}
                    style={{ fontSize: 12, width: "100%" }}>
                    {(voicesQuery?.data?.voices || [
                      { id: "hpp4J3VqNfWAUOO0d1Us", name: "Alex (masculino, confiante)" },
                      { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (feminina, profissional)" },
                      { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi (feminina, energética)" },
                      { id: "ErXwobaYiN019PkySvjV", name: "Antoni (masculino, suave)" },
                      { id: "VR6AewLTigWG4xSOukaG", name: "Arnold (masculino, forte)" },
                      { id: "pNInz6obpgDQGcFmaJgB", name: "Adam (masculino, narrador)" },
                    ]).map((v: any) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" id="draft-mode" checked={form.draft}
                    onChange={e => setForm(prev => ({ ...prev, draft: e.target.checked }))} />
                  <label htmlFor="draft-mode" style={{ fontSize: 12, color: "#64748b", cursor: "pointer" }}>
                    ⚡ Modo rascunho — geração mais rápida (qualidade reduzida, ideal para testes)
                  </label>
                </div>
              </div>

              <button
                onClick={handleGenerateScript}
                disabled={generateScriptMutation?.isPending || !form.productName.trim()}
                style={{
                  width: "100%", padding: 14, borderRadius: 12,
                  background: generateScriptMutation?.isPending ? "#93c5fd" : "linear-gradient(135deg,#0f172a,#1e3a5f)",
                  color: "white", fontWeight: 800, fontSize: 14, border: "none",
                  cursor: generateScriptMutation?.isPending ? "wait" : "pointer",
                }}
              >
                {generateScriptMutation?.isPending
                  ? "⏳ Gemini gerando roteiro..."
                  : `✨ Gerar roteiro para ${fmtInfo.icon} ${selectedFormat.replace(/_/g, " ")}`}
              </button>
            </div>
          )}

          {/* ── STEP 2: Roteiro ── */}
          {step === "script" && script && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                    📄 Roteiro: {script.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {script.scenes.length} cenas · ~{Math.round(script.estimated_duration)}s estimados
                  </div>
                </div>
                <button onClick={() => setStep("format")} style={{
                  fontSize: 11, padding: "5px 12px", borderRadius: 8,
                  border: "1px solid #e2e8f0", background: "white", cursor: "pointer", color: "#64748b",
                }}>
                  ← Voltar
                </button>
              </div>

              <div style={{ marginBottom: 16, maxHeight: 400, overflowY: "auto" }}>
                {script.scenes.map((scene: any, idx: number) => (
                  <div key={idx} style={{
                    border: "1px solid #e2e8f0", borderRadius: 12, padding: 16,
                    marginBottom: 10, background: editingScene === idx ? "#f0f9ff" : "white",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: "#eff6ff", color: "#1d4ed8" }}>
                          Cena {idx + 1}
                        </span>
                        <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>{scene.id}</span>
                      </div>
                      <button onClick={() => setEditingScene(editingScene === idx ? null : idx)} style={{
                        fontSize: 10, padding: "3px 10px", borderRadius: 8,
                        border: "1px solid #e2e8f0", background: "white", cursor: "pointer", color: "#64748b",
                      }}>
                        {editingScene === idx ? "✓ Fechar" : "✏️ Editar"}
                      </button>
                    </div>

                    {editingScene === idx ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div>
                          <label style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>NARRAÇÃO</label>
                          <textarea className="input" rows={3} value={scene.narration}
                            onChange={e => updateScene(idx, "narration", e.target.value)}
                            style={{ fontSize: 12, width: "100%", marginTop: 4 }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>PROMPT DE IMAGEM (inglês)</label>
                          <textarea className="input" rows={2} value={scene.prompt}
                            onChange={e => updateScene(idx, "prompt", e.target.value)}
                            style={{ fontSize: 11, width: "100%", marginTop: 4 }} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <label style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>MOVIMENTO</label>
                            <select className="input" value={scene.motion}
                              onChange={e => updateScene(idx, "motion", e.target.value)}
                              style={{ fontSize: 11, marginTop: 4 }}>
                              {MOTION_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>COLOR GRADE</label>
                            <select className="input" value={scene.color_grade}
                              onChange={e => updateScene(idx, "color_grade", e.target.value)}
                              style={{ fontSize: 11, marginTop: 4 }}>
                              {COLOR_GRADE_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.5, marginBottom: 6 }}>
                          {scene.narration.slice(0, 120)}{scene.narration.length > 120 ? "..." : ""}
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic" }}>
                          🖼️ {scene.prompt.slice(0, 80)}{scene.prompt.length > 80 ? "..." : ""}
                        </div>
                        {/* Botão de preview de áudio ElevenLabs */}
                        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            onClick={async () => {
                              if (ttsPreview?.sceneIdx === idx) {
                                setTtsPreview(null); return;
                              }
                              setTtsLoading(idx);
                              try {
                                const result = await generateTTSMutation?.mutateAsync({
                                  text:    scene.narration,
                                  voiceId: form.voice,
                                });
                                if (result?.audioBase64) {
                                  const blob = new Blob(
                                    [Uint8Array.from(atob(result.audioBase64), c => c.charCodeAt(0))],
                                    { type: "audio/mpeg" }
                                  );
                                  const url = URL.createObjectURL(blob);
                                  setTtsPreview({ sceneIdx: idx, url });
                                }
                              } catch (e: any) {
                                toast.error("❌ TTS: " + (e?.message || "Erro ao gerar áudio"));
                              } finally {
                                setTtsLoading(null);
                              }
                            }}
                            disabled={ttsLoading === idx}
                            style={{
                              fontSize: 11, padding: "4px 12px", borderRadius: 8, cursor: "pointer",
                              background: ttsPreview?.sceneIdx === idx ? "#dcfce7" : "#f0f9ff",
                              color:      ttsPreview?.sceneIdx === idx ? "#15803d" : "#0369a1",
                              border:     "1px solid " + (ttsPreview?.sceneIdx === idx ? "#86efac" : "#bae6fd"),
                              fontWeight: 700,
                            }}>
                            {ttsLoading === idx ? "⏳ Gerando..." : ttsPreview?.sceneIdx === idx ? "⏹ Parar" : "🎙️ Ouvir narração"}
                          </button>
                          {ttsPreview?.sceneIdx === idx && (
                            <audio
                              src={ttsPreview.url}
                              autoPlay
                              controls
                              style={{ height: 28, flex: 1 }}
                              onEnded={() => setTtsPreview(null)}
                            />
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 10, background: "#f1f5f9", color: "#64748b" }}>
                            {scene.motion}
                          </span>
                          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 10, background: "#f1f5f9", color: "#64748b" }}>
                            {scene.color_grade}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleGenerateScript} disabled={generateScriptMutation?.isPending} style={{
                  flex: 1, padding: 12, borderRadius: 10, border: "1px solid #e2e8f0",
                  background: "white", cursor: "pointer", fontSize: 12, color: "#64748b", fontWeight: 700,
                }}>
                  🔄 Regenerar roteiro
                </button>
                {/* Aviso quando serviço VSL offline */}
                {serviceAvailable === false && (
                  <div style={{
                    flex: 2, padding: 12, borderRadius: 10, background: "#fef2f2",
                    border: "1px solid #fca5a5", fontSize: 11, color: "#7f1d1d",
                  }}>
                    <p style={{ fontWeight: 800, marginBottom: 6 }}>⚙️ VSL Service não configurado</p>
                    <p style={{ margin: "4px 0" }}>Para gerar vídeos, configure no Render:</p>
                    <code style={{ display: "block", background: "#fee2e2", padding: "4px 8px", borderRadius: 4, margin: "4px 0", fontSize: 10 }}>
                      VSL_SERVICE_URL=https://arcane-embryologic-tiffiny.ngrok-free.dev
                    </code>
                    <code style={{ display: "block", background: "#fee2e2", padding: "4px 8px", borderRadius: 4, fontSize: 10 }}>
                      VSL_SECRET_KEY=mecpro-vsl-2026
                    </code>
                    <p style={{ margin: "6px 0 0", color: "#991b1b", fontSize: 10 }}>
                      E rode <strong>vsl_service.py + ngrok</strong> na sua máquina local.
                    </p>
                  </div>
                )}
                {serviceAvailable !== false && (
                <button
                  onClick={handleStartGeneration}
                  disabled={startGenerationMutation?.isPending || !serviceAvailable}
                  style={{
                    flex: 2, padding: 12, borderRadius: 10,
                    background: !serviceAvailable ? "#94a3b8" : "linear-gradient(135deg,#16a34a,#15803d)",
                    color: "white", fontWeight: 800, fontSize: 13, border: "none",
                    cursor: !serviceAvailable ? "not-allowed" : "pointer",
                  }}
                >
                  {startGenerationMutation?.isPending ? "⏳ Iniciando..." :
                   !serviceAvailable ? "⚠️ Serviço offline" :
                   `🎬 Gerar vídeo ${fmtInfo.icon} ${form.draft ? "(rascunho)" : "(final)"}`}
                </button>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 3: Gerando ── */}
          {step === "generate" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
                Gerando seu vídeo...
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
                {jobStatus?.message || "Processando..."}
              </div>

              {/* Progress bar */}
              <div style={{ background: "#f1f5f9", borderRadius: 8, height: 12, marginBottom: 12, overflow: "hidden" }}>
                <div style={{
                  width: `${jobStatus?.progress || 0}%`, height: "100%",
                  background: "linear-gradient(90deg,#16a34a,#22c55e)",
                  borderRadius: 8, transition: "width 0.5s",
                }} />
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 24 }}>
                {jobStatus?.progress || 0}% concluído
              </div>

              {/* Fases */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 400, margin: "0 auto" }}>
                {[
                  { icon: "🎙️", label: "Narração",      threshold: 20 },
                  { icon: "🖼️", label: "Imagens FLUX",  threshold: 40 },
                  { icon: "🎬", label: "Montagem",       threshold: 75 },
                  { icon: "✅", label: "Export final",   threshold: 90 },
                ].map(phase => {
                  const done    = (jobStatus?.progress || 0) >= phase.threshold;
                  const active  = (jobStatus?.progress || 0) >= phase.threshold - 20 && !done;
                  return (
                    <div key={phase.label} style={{
                      padding: "10px 14px", borderRadius: 10,
                      background: done ? "#f0fdf4" : active ? "#eff6ff" : "#f8fafc",
                      border: `1px solid ${done ? "#86efac" : active ? "#93c5fd" : "#e2e8f0"}`,
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span style={{ fontSize: 18 }}>{done ? "✅" : active ? "⏳" : phase.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: done ? 700 : 500, color: done ? "#16a34a" : "#64748b" }}>
                        {phase.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 20, fontSize: 11, color: "#94a3b8" }}>
                ⏱️ Tempo estimado: {script?.scenes?.length * 2 || 5}–{(script?.scenes?.length || 5) * 3} minutos
              </div>
            </div>
          )}

          {/* ── STEP 4: Resultado ── */}
          {step === "result" && jobStatus?.videoUrl && (
            <div>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
                  Vídeo pronto!
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {jobStatus.durationS}s · {jobStatus.sizeMb}MB · {FORMAT_INFO[selectedFormat]?.icon} {selectedFormat.replace(/_/g, " ")}
                </div>
              </div>

              {/* Player */}
              <div style={{ background: "#0f172a", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
                <video
                  controls
                  style={{ width: "100%", maxHeight: 400, display: "block" }}
                  src={jobStatus.videoUrl}
                />
              </div>

              {/* Ações */}
              <div style={{ display: "flex", gap: 10 }}>
                <a href={jobStatus.videoUrl} download style={{
                  flex: 1, padding: 12, borderRadius: 10,
                  background: "linear-gradient(135deg,#0f172a,#1e3a5f)",
                  color: "white", fontWeight: 700, fontSize: 13,
                  textDecoration: "none", textAlign: "center" as const,
                }}>
                  ⬇️ Download MP4
                </a>
                <button onClick={() => { setStep("format"); setScript(null); setJobStatus(null); setActiveJobId(null); }}
                  style={{
                    flex: 1, padding: 12, borderRadius: 10,
                    border: "1px solid #e2e8f0", background: "white",
                    cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#64748b",
                  }}>
                  🔄 Gerar outro
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
