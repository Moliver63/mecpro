import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

interface AlertConfig {
  cpcMax:            number;
  cplMax:            number;
  cpmMax:            number;
  ctrMin:            number;
  spendDailyMax:     number;
  weeklyReportEnabled: boolean;
  weeklyReportDay:   number;  // 0=Sun,1=Mon...6=Sat
  weeklyReportHour:  number;  // 0-23 UTC
  alertEmail:        string;
  platforms:         string[];
}

const DAYS = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const PLATFORMS = [
  { value: "meta",   label: "📘 Meta Ads",   color: "#1877f2" },
  { value: "google", label: "🔵 Google Ads", color: "#1a73e8" },
  { value: "tiktok", label: "🎵 TikTok Ads", color: "#010101" },
];

export default function AlertsSettings() {
  const [, setLocation] = useLocation();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const { data: saved, refetch } = trpc.alerts.get.useQuery(undefined, { retry: false });

  const [cfg, setCfg] = useState<AlertConfig>({
    cpcMax:            5.00,
    cplMax:            30.00,
    cpmMax:            20.00,
    ctrMin:            0.01,
    spendDailyMax:     200,
    weeklyReportEnabled: true,
    weeklyReportDay:   1,   // Monday
    weeklyReportHour:  9,
    alertEmail:        "",
    platforms:         ["meta","google","tiktok"],
  });

  // Sync with saved data
  React.useEffect(() => {
    if (saved) setCfg(saved as AlertConfig);
  }, [saved]);

  const saveMutation = trpc.alerts.save.useMutation({
    onSuccess: () => { toast.success("✅ Alertas salvos!"); refetch(); setSaving(false); },
    onError:   (e) => { toast.error("Erro: " + e.message); setSaving(false); },
  });

  const testMutation = trpc.alerts.sendTestReport.useMutation({
    onSuccess: () => { toast.success("📧 Relatório de teste enviado ao seu e-mail!"); setTesting(false); },
    onError:   (e) => { toast.error("Erro: " + e.message); setTesting(false); },
  });

  const set = (k: keyof AlertConfig, v: any) => setCfg(f => ({ ...f, [k]: v }));

  const togglePlatform = (p: string) =>
    set("platforms", cfg.platforms.includes(p)
      ? cfg.platforms.filter(x => x !== p)
      : [...cfg.platforms, p]);

  const inp: React.CSSProperties = {
    padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8,
    fontSize: 13, outline: "none", background: "#f8fafc", width: "100%",
    boxSizing: "border-box",
  };
  const row: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 0", borderBottom: "1px solid #f1f5f9",
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => setLocation("/settings")}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22 }}>←</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🔔 Alertas & Relatórios</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            Configure alertas automáticos e relatório semanal por e-mail
          </p>
        </div>
      </div>

      {/* Platforms */}
      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0",
        borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 800 }}>📊 Plataformas monitoradas</h3>
        <div style={{ display: "flex", gap: 10 }}>
          {PLATFORMS.map(p => (
            <button key={p.value} onClick={() => togglePlatform(p.value)}
              style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: "2px solid",
                borderColor: cfg.platforms.includes(p.value) ? p.color : "#e2e8f0",
                background: cfg.platforms.includes(p.value) ? p.color + "11" : "#fff",
                cursor: "pointer", fontWeight: 700, fontSize: 12, color: cfg.platforms.includes(p.value) ? p.color : "#94a3b8" }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* CPC/CPL/CPM Thresholds */}
      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0",
        borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>⚠️ Limites de alerta</h3>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#64748b" }}>
          Você será notificado quando qualquer métrica ultrapassar estes limites.
        </p>

        <div style={row}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>CPC máximo (R$)</p>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>Custo por clique acima deste valor → alerta</p>
          </div>
          <input style={{ ...inp, width: 90, textAlign: "right" as const }} type="number"
            step="0.01" value={cfg.cpcMax} onChange={e => set("cpcMax", Number(e.target.value))} />
        </div>

        <div style={row}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>CPL máximo (R$)</p>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>Custo por lead acima deste valor → alerta</p>
          </div>
          <input style={{ ...inp, width: 90, textAlign: "right" as const }} type="number"
            step="0.01" value={cfg.cplMax} onChange={e => set("cplMax", Number(e.target.value))} />
        </div>

        <div style={row}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>CPM máximo (R$)</p>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>Custo por mil impressões</p>
          </div>
          <input style={{ ...inp, width: 90, textAlign: "right" as const }} type="number"
            step="0.01" value={cfg.cpmMax} onChange={e => set("cpmMax", Number(e.target.value))} />
        </div>

        <div style={row}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>CTR mínimo (%)</p>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>Abaixo deste CTR → alerta de performance</p>
          </div>
          <input style={{ ...inp, width: 90, textAlign: "right" as const }} type="number"
            step="0.001" value={(cfg.ctrMin * 100).toFixed(2)}
            onChange={e => set("ctrMin", Number(e.target.value) / 100)} />
        </div>

        <div style={{ ...row, borderBottom: "none" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>Gasto diário máximo (R$)</p>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>Alerta se gastar mais que isto por dia</p>
          </div>
          <input style={{ ...inp, width: 90, textAlign: "right" as const }} type="number"
            value={cfg.spendDailyMax} onChange={e => set("spendDailyMax", Number(e.target.value))} />
        </div>
      </div>

      {/* Weekly report */}
      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0",
        borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>📧 Relatório semanal</h3>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              Receba métricas consolidadas das 3 plataformas por e-mail
            </p>
          </div>
          {/* Toggle switch */}
          <div onClick={() => set("weeklyReportEnabled", !cfg.weeklyReportEnabled)}
            style={{ width: 48, height: 26, borderRadius: 13, cursor: "pointer",
              background: cfg.weeklyReportEnabled ? "#16a34a" : "#e2e8f0",
              transition: "background .2s", position: "relative" as const }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff",
              position: "absolute", top: 3,
              left: cfg.weeklyReportEnabled ? 25 : 3, transition: "left .2s" }} />
          </div>
        </div>

        {cfg.weeklyReportEnabled && (
          <>
            <label style={{ fontSize: 12, fontWeight: 600 }}>E-mail para envio</label>
            <input style={{ ...inp, marginBottom: 12 }} type="email"
              placeholder="seu@email.com" value={cfg.alertEmail}
              onChange={e => set("alertEmail", e.target.value)} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Dia da semana</label>
                <select style={{ ...inp, marginTop: 4 }} value={cfg.weeklyReportDay}
                  onChange={e => set("weeklyReportDay", Number(e.target.value))}>
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Horário (UTC)</label>
                <input style={{ ...inp, marginTop: 4 }} type="number" min={0} max={23}
                  value={cfg.weeklyReportHour}
                  onChange={e => set("weeklyReportHour", Number(e.target.value))} />
              </div>
            </div>

            <button onClick={() => { setTesting(true); testMutation.mutate(); }}
              disabled={testing || !cfg.alertEmail}
              style={{ padding: "8px 16px", background: "#eff6ff", border: "1.5px solid #bfdbfe",
                borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, color: "#1e40af" }}>
              {testing ? "⏳ Enviando…" : "📧 Enviar relatório de teste agora"}
            </button>
          </>
        )}
      </div>

      {/* Save button */}
      <button onClick={() => { setSaving(true); saveMutation.mutate(cfg); }}
        disabled={saving}
        style={{ width: "100%", padding: 14, background: "#0a0a0a", color: "#fff",
          border: "none", borderRadius: 12, fontWeight: 800, fontSize: 14,
          cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1 }}>
        {saving ? "💾 Salvando…" : "💾 Salvar configurações"}
      </button>
    </div>
  );
}
