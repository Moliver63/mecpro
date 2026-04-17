/**
 * Financeiro.tsx — Hub financeiro completo com navegação fluida
 * Cada aba tem o conteúdo REAL embutido + botão de voltar interno
 * Design: Liquid Glass · MECPro AI Design System v2
 */
import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const R = (v?: number | null) =>
  v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const TABS = [
  { id: "overview",  icon: "▣", label: "Visão Geral",    color: "#0071e3" },
  { id: "deposit",   icon: "◫", label: "Depositar",       color: "#0071e3" },
  { id: "credits",   icon: "◈", label: "Créditos",        color: "#30d158" },
  { id: "rateio",    icon: "◉", label: "Rateio",          color: "#5856d6" },
  { id: "transfer",  icon: "◍", label: "Transferir",      color: "#ff9f0a" },
];

const PLATS = [
  { key: "meta",   label: "Meta Ads",   icon: "📘", color: "#1877f2", bg: "#eff6ff" },
  { key: "google", label: "Google Ads", icon: "🔵", color: "#1a73e8", bg: "#eff6ff" },
  { key: "tiktok", label: "TikTok Ads", icon: "◼",  color: "#111",    bg: "#f1f5f9" },
];

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2000, 5000];

/* ── Helpers de estilo ─────────────────────────────────────── */
const glass: React.CSSProperties = {
  background: "var(--glass-bg)",
  backdropFilter: "var(--glass-blur)",
  border: "1px solid var(--glass-border)",
  borderRadius: 18,
  boxShadow: "var(--glass-shadow)",
};

const primaryBtn = (color = "var(--grad-primary)"): React.CSSProperties => ({
  width: "100%", padding: "13px 20px", borderRadius: 12, border: "none",
  background: color, color: "white", fontWeight: 700, fontSize: 14,
  cursor: "pointer", fontFamily: "var(--font)",
  boxShadow: "0 4px 20px rgba(0,0,0,0.18)", transition: "all .2s",
});

const backBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "7px 14px", borderRadius: 9, border: "1.5px solid var(--border)",
  background: "white", color: "var(--muted)", fontWeight: 600, fontSize: 12,
  cursor: "pointer", fontFamily: "var(--font)", boxShadow: "var(--shadow-xs)",
  transition: "all .15s", marginBottom: 20,
};

function SectionHeader({ icon, color, title, sub, onBack }: {
  icon: string; color: string; title: string; sub: string; onBack?: () => void;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      {onBack && (
        <button onClick={onBack} style={backBtn}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--dark)"; e.currentTarget.style.borderColor = "var(--border2)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}>
          ← Voltar para Visão Geral
        </button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color, flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--black)", letterSpacing: "-0.03em" }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ background: color + "0a", border: `1.5px solid ${color}28`, borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ABAS INDIVIDUAIS
═══════════════════════════════════════════════════════════════ */

function TabDeposit({ balance, ps, onBack }: { balance: any; ps: any; onBack: () => void }) {
  const [amount, setAmount] = useState("");
  const [step, setStep]     = useState<"form" | "pix">("form");
  const [pixData, setPixData] = useState<any>(null);
  const feePercent = ps?.feePercent ?? 10;
  const parsed     = parseFloat(String(amount).replace(",", ".")) || 0;
  const fee        = parsed * feePercent / 100;
  const credited   = parsed - fee;

  const pixMutation = (trpc as any).mediaBudget?.requestPixDeposit?.useMutation?.({
    onSuccess: (data: any) => { setPixData(data); setStep("pix"); },
    onError:   (e: any)    => toast.error(e.message),
  }) ?? { mutate: () => {}, isPending: false };

  if (!ps?.modeWallet) {
    return (
      <div>
        <SectionHeader icon="◫" color="#0071e3" title="Depositar via Pix" sub="Adicione saldo à sua wallet" onBack={onBack} />
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>🔒</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>Modo wallet desabilitado</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Configure em Admin → Financeiro</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader icon="◫" color="#0071e3" title="Depositar via Pix"
        sub="Adicione saldo à sua wallet. Taxa de gestão descontada automaticamente." onBack={onBack} />

      {step === "form" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Formulário */}
          <div>
            <InfoCard color="#0071e3">
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Saldo atual</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#0071e3", letterSpacing: "-0.04em" }}>{R(balance?.balance)}</div>
            </InfoCard>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                Valor a depositar (R$)
              </label>
              <input
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Ex: 500"
                style={{ width: "100%", padding: "12px 16px", borderRadius: 11, border: "1.5px solid var(--border)", fontSize: 20, fontWeight: 800, fontFamily: "var(--font)", background: "white", outline: "none", transition: "border .15s", boxSizing: "border-box" }}
                onFocus={e => e.target.style.borderColor = "#0071e3"}
                onBlur={e  => e.target.style.borderColor = "var(--border)"}
              />
            </div>

            {/* Valores rápidos */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 16 }}>
              {QUICK_AMOUNTS.map(a => (
                <button key={a} onClick={() => setAmount(String(a))}
                  style={{
                    padding: "7px 4px", borderRadius: 8, border: "1.5px solid var(--border)",
                    background: amount === String(a) ? "#0071e314" : "white",
                    color: amount === String(a) ? "#0071e3" : "var(--muted)",
                    fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--font)",
                    borderColor: amount === String(a) ? "#0071e3" : "var(--border)",
                    transition: "all .15s",
                  }}>
                  {R(a)}
                </button>
              ))}
            </div>

            <button onClick={() => pixMutation.mutate({ amount: parsed, method: "pix" })}
              disabled={parsed < 50 || pixMutation.isPending}
              style={{ ...primaryBtn(), opacity: parsed < 50 ? 0.45 : 1, cursor: parsed < 50 ? "not-allowed" : "pointer" }}>
              {pixMutation.isPending ? "Gerando Pix..." : `Gerar Pix de ${R(parsed)}`}
            </button>
            {parsed > 0 && parsed < 50 && (
              <div style={{ fontSize: 11, color: "var(--red)", textAlign: "center", marginTop: 6 }}>Valor mínimo: R$ 50,00</div>
            )}
          </div>

          {/* Preview da taxa */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Simulação</div>
            {[
              { label: "Valor depositado", value: R(parsed || 0), color: "var(--dark)" },
              { label: `Taxa de gestão (${feePercent}%)`, value: parsed ? `− ${R(fee)}` : "—", color: "var(--red)" },
              { label: "Crédito na wallet", value: parsed ? R(credited) : "—", color: "#30d158" },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "var(--off)", borderRadius: 11 }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{row.label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: row.color }}>{row.value}</span>
              </div>
            ))}
            <div style={{ marginTop: 4, padding: "12px 16px", background: "var(--blue-l)", border: "1px solid #bfdbfe", borderRadius: 11 }}>
              <div style={{ fontSize: 11, color: "#1d4ed8", lineHeight: 1.5 }}>
                ◈ Pix aprovado em até <strong>15 minutos</strong> em horário comercial.
                Processamento pelo <strong>Asaas</strong>.
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Exibir QR code Pix */
        <div style={{ textAlign: "center" }}>
          <InfoCard color="#30d158">
            <div style={{ fontSize: 13, fontWeight: 700, color: "#15803d", marginBottom: 4 }}>✅ Solicitação criada</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Realize o Pix abaixo para prosseguir</div>
          </InfoCard>
          {pixData?.qrCodeImage && (
            <img src={pixData.qrCodeImage} alt="QR Code Pix" style={{ width: 200, height: 200, borderRadius: 12, margin: "0 auto 16px", display: "block" }} />
          )}
          {pixData?.pixKey && (
            <div style={{ background: "var(--off)", borderRadius: 11, padding: "12px 16px", marginBottom: 16, fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all", color: "var(--dark)" }}>
              {pixData.pixKey}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            {pixData?.pixKey && (
              <button onClick={() => { navigator.clipboard.writeText(pixData.pixKey); toast.success("Chave copiada!"); }}
                style={{ ...primaryBtn(), flex: 1 }}>
                📋 Copiar chave Pix
              </button>
            )}
            <button onClick={() => { setStep("form"); setAmount(""); setPixData(null); }}
              style={{ ...backBtn, marginBottom: 0, flex: "0 0 auto" }}>
              Nova solicitação
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TabCredits({ summary, onBack }: { summary: any; onBack: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const guides: Record<string, { steps: string[]; url: string; color: string }> = {
    meta:   { color: "#1877f2", url: "https://business.facebook.com/billing/payment_activity", steps: ["Acesse o Gerenciador de Anúncios Meta", "Vá em Faturamento → Adicionar método de pagamento", "Escolha Cartão de Crédito ou Boleto", "Defina o limite de gasto e clique em Salvar"] },
    google: { color: "#1a73e8", url: "https://ads.google.com/aw/billing", steps: ["Acesse sua conta Google Ads", "Vá em Ferramentas → Faturamento e pagamentos", "Clique em Fazer um pagamento manual", "Informe o valor e confirme com seu cartão"] },
    tiktok: { color: "#111", url: "https://ads.tiktok.com/i18n/accountinfo/paymentManagement", steps: ["Acesse o TikTok Ads Manager", "Vá em Conta → Gerenciamento de pagamentos", "Clique em Adicionar saldo", "Siga as instruções para pagamento por cartão ou Pix"] },
  };

  return (
    <div>
      <SectionHeader icon="◈" color="#30d158" title="Comprar Créditos"
        sub="Adicione créditos diretamente nas plataformas de anúncios" onBack={onBack} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
        {PLATS.map(p => {
          const isOpen = selected === p.key;
          return (
            <button key={p.key} onClick={() => setSelected(isOpen ? null : p.key)}
              style={{
                padding: "18px 14px", borderRadius: 14, border: `2px solid ${isOpen ? p.color : "var(--border)"}`,
                background: isOpen ? p.color + "0a" : "white", cursor: "pointer", textAlign: "center",
                transition: "all .2s", fontFamily: "var(--font)",
                boxShadow: isOpen ? `0 4px 16px ${p.color}22` : "var(--shadow-xs)",
              }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{p.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: isOpen ? p.color : "var(--dark)" }}>{p.label}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                {R(summary?.spendMonth?.[p.key])} no mês
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: p.color, marginTop: 8 }}>
                {isOpen ? "▲ Fechar" : "Ver guia →"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Guia expandido */}
      {selected && (() => {
        const p   = PLATS.find(x => x.key === selected)!;
        const g   = guides[selected];
        return (
          <div style={{ background: p.color + "08", border: `1.5px solid ${p.color}30`, borderRadius: 16, padding: 22, animation: "fadeIn .2s ease" }}>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }`}</style>
            <div style={{ fontSize: 14, fontWeight: 800, color: p.color, marginBottom: 16 }}>
              {p.icon} Passo a passo — {p.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              {g.steps.map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: p.color, color: "white", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>{step}</div>
                </div>
              ))}
            </div>
            <a href={g.url} target="_blank" rel="noreferrer"
              style={{ ...primaryBtn(p.color), textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              Acessar {p.label} →
            </a>
          </div>
        );
      })()}

      {!selected && (
        <div style={{ textAlign: "center", padding: "20px 0", color: "var(--muted)", fontSize: 13 }}>
          ◈ Selecione uma plataforma acima para ver o guia de compra
        </div>
      )}
    </div>
  );
}

function TabRateio({ ps, summary, onBack }: { ps: any; summary: any; onBack: () => void }) {
  const defaults = ps?.defaultDist || { meta: 50, google: 30, tiktok: 20 };
  const [dist, setDist] = useState<Record<string, number>>(defaults);
  const total = Object.values(dist).reduce((a, b) => a + b, 0);

  const updateMutation = (trpc as any).mediaBudget?.updateDistribution?.useMutation?.({
    onSuccess: () => toast.success("✅ Rateio atualizado!"),
    onError:   (e: any) => toast.error(e.message),
  }) ?? { mutate: () => {}, isPending: false };

  return (
    <div>
      <SectionHeader icon="◉" color="#5856d6" title="Rateio de Verba"
        sub="Defina como o orçamento é distribuído entre as plataformas" onBack={onBack} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Sliders */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Distribuição (total: <span style={{ color: total === 100 ? "#30d158" : "var(--red)" }}>{total}%</span>)
          </div>
          {PLATS.map(p => (
            <div key={p.key} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{p.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)" }}>{p.label}</span>
                </div>
                <span style={{ fontSize: 18, fontWeight: 900, color: p.color, letterSpacing: "-0.04em" }}>{dist[p.key]}%</span>
              </div>
              <input type="range" min={0} max={100} value={dist[p.key]}
                onChange={e => setDist(d => ({ ...d, [p.key]: Number(e.target.value) }))}
                style={{ width: "100%", accentColor: p.color, height: 6, cursor: "pointer" }}
              />
              <div style={{ height: 5, background: "var(--border2)", borderRadius: 99, overflow: "hidden", marginTop: 4 }}>
                <div style={{ width: dist[p.key] + "%", height: "100%", background: p.color, borderRadius: 99, transition: "width .2s" }} />
              </div>
            </div>
          ))}
          <button onClick={() => updateMutation.mutate({ distribution: dist })}
            disabled={total !== 100 || updateMutation.isPending}
            style={{ ...primaryBtn("linear-gradient(135deg,#5856d6,#4c46c4)"), opacity: total !== 100 ? 0.45 : 1, cursor: total !== 100 ? "not-allowed" : "pointer" }}>
            {updateMutation.isPending ? "Salvando..." : total !== 100 ? `Total deve ser 100% (atual: ${total}%)` : "Salvar Rateio"}
          </button>
        </div>

        {/* Preview pizza */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Simulação mensal
          </div>
          {PLATS.map(p => {
            const pct   = dist[p.key];
            const month = summary?.totalSpendMonth || 0;
            return (
              <div key={p.key} style={{ background: "var(--off)", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{p.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: p.color }}>{p.label}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: "var(--dark)" }}>{pct}%</div>
                    {month > 0 && <div style={{ fontSize: 10, color: "var(--muted)" }}>{R(month * pct / 100)}/mês</div>}
                  </div>
                </div>
                <div style={{ height: 6, background: "var(--border2)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: pct + "%", height: "100%", background: `linear-gradient(90deg, ${p.color}, ${p.color}aa)`, borderRadius: 99, transition: "width .3s" }} />
                </div>
              </div>
            );
          })}
          <div style={{ padding: "12px 16px", background: "rgba(88,86,214,0.06)", border: "1px solid rgba(88,86,214,0.2)", borderRadius: 12, fontSize: 11, color: "#4338ca", lineHeight: 1.5 }}>
            ◉ O rateio é aplicado automaticamente ao distribuir a verba do orçamento da campanha.
          </div>
        </div>
      </div>
    </div>
  );
}

function TabTransfer({ asaas, onBack }: { asaas: any; onBack: () => void }) {
  const [amount, setAmount] = useState("");
  const [key, setKey]       = useState("");
  const [keyType, setKeyType] = useState("cpf");
  const parsed = parseFloat(String(amount).replace(",", ".")) || 0;

  const transferMutation = (trpc as any).mediaBudget?.transferAsaas?.useMutation?.({
    onSuccess: () => { toast.success("✅ Transferência realizada!"); setAmount(""); setKey(""); },
    onError:   (e: any) => toast.error(e.message),
  }) ?? { mutate: () => {}, isPending: false };

  return (
    <div>
      <SectionHeader icon="◍" color="#ff9f0a" title="Transferir via Asaas"
        sub="Envie saldo do Asaas para sua conta bancária cadastrada" onBack={onBack} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Form */}
        <div>
          <InfoCard color="#ff9f0a">
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Saldo disponível Asaas</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#ff9f0a", letterSpacing: "-0.04em" }}>{R(asaas?.balance)}</div>
          </InfoCard>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
              Valor (R$)
            </label>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ex: 500"
              style={{ width: "100%", padding: "12px 16px", borderRadius: 11, border: "1.5px solid var(--border)", fontSize: 18, fontWeight: 800, fontFamily: "var(--font)", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
              Tipo de chave Pix
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
              {["cpf", "cnpj", "email", "phone"].map(t => (
                <button key={t} onClick={() => setKeyType(t)}
                  style={{ padding: "7px 4px", borderRadius: 8, border: `1.5px solid ${keyType === t ? "#ff9f0a" : "var(--border)"}`, background: keyType === t ? "#ff9f0a14" : "white", color: keyType === t ? "#d97706" : "var(--muted)", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "var(--font)", transition: "all .15s" }}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
            <input value={key} onChange={e => setKey(e.target.value)} placeholder={`Chave Pix (${keyType})`}
              style={{ width: "100%", padding: "11px 14px", borderRadius: 11, border: "1.5px solid var(--border)", fontSize: 13, fontFamily: "var(--font)", boxSizing: "border-box" }}
            />
          </div>

          <button onClick={() => transferMutation.mutate({ amount: parsed, pixKey: key, pixKeyType: keyType })}
            disabled={parsed <= 0 || !key || transferMutation.isPending}
            style={{ ...primaryBtn("linear-gradient(135deg,#ff9f0a,#d97706)"), opacity: !parsed || !key ? 0.45 : 1, cursor: !parsed || !key ? "not-allowed" : "pointer" }}>
            {transferMutation.isPending ? "Transferindo..." : `Transferir ${parsed > 0 ? R(parsed) : ""}`}
          </button>
        </div>

        {/* Info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Informações</div>
          {[
            { icon: "⏱", label: "Prazo de processamento", value: "Mesmo dia útil até 17h" },
            { icon: "💳", label: "Valor mínimo", value: "R$ 10,00" },
            { icon: "🔒", label: "Segurança", value: "Transferência via Asaas certificado" },
            { icon: "📱", label: "Comprovante", value: "Enviado por e-mail automaticamente" },
          ].map(info => (
            <div key={info.label} style={{ background: "var(--off)", borderRadius: 11, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>{info.icon}</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 2 }}>{info.label}</div>
                <div style={{ fontSize: 13, color: "var(--dark)" }}>{info.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════════════════════ */
export default function Financeiro() {
  const [tab, setTab] = useState(0);

  const { data: balance } = (trpc as any).mediaBudget?.getBalance?.useQuery?.()       ?? {};
  const { data: ps }      = (trpc as any).admin?.getPaymentSettings?.useQuery?.()     ?? {};
  const { data: asaas }   = (trpc as any).mediaBudget?.asaasBalance?.useQuery?.()     ?? {};
  const { data: summary } = (trpc as any).mediaBudget?.financialSummary?.useQuery?.() ?? {};

  const feePercent = (ps as any)?.feePercent ?? 10;
  const isFirst = tab === 0;
  const isLast  = tab === TABS.length - 1;

  const KPIS = [
    { label: "Saldo wallet",  value: R((balance as any)?.balance),         icon: "◈", color: "#30d158" },
    { label: "Saldo Asaas",   value: R((asaas as any)?.balance),           icon: "◉", color: "#0071e3" },
    { label: "Gasto hoje",    value: R((summary as any)?.totalSpendToday), icon: "▣", color: "#ff9f0a" },
    { label: "Taxa gestão",   value: `${feePercent}%`,                     icon: "⚙", color: "#5856d6" },
  ];

  return (
    <Layout>
      <style>{`
        .fn-nav:hover { background: rgba(0,0,0,0.05) !important; color: var(--dark) !important; }
        .fn-nav:hover .fn-ic { transform: scale(1.1); }
        .fn-ic { transition: transform .15s; }
        .fn-kpi:hover { transform: translateY(-2px); box-shadow: var(--shadow-md) !important; }
        .fn-ab:hover { opacity: .88; }
      `}</style>

      <div style={{ maxWidth: 1060, margin: "0 auto", padding: "28px 20px", fontFamily: "var(--font)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--grad-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: "var(--shadow-blue)", flexShrink: 0, color: "white" }}>▣</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--black)", letterSpacing: "-0.04em" }}>Financeiro</h1>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Gerencie saldo, créditos e verba de mídia</p>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 22 }}>
          {KPIS.map(k => (
            <div key={k.label} className="fn-kpi" style={{ ...glass, padding: "14px 16px", transition: "all .2s", cursor: "default" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: k.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: k.color }}>{k.icon}</div>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.label}</span>
              </div>
              <div style={{ fontSize: 19, fontWeight: 900, color: k.color, letterSpacing: "-0.04em" }}>{k.value || "—"}</div>
            </div>
          ))}
        </div>

        {/* ── Saldo por Plataforma ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 22 }}>
          {PLATS.map(p => {
            const today  = (summary as any)?.spendToday?.[p.key]  || 0;
            const month  = (summary as any)?.spendMonth?.[p.key]  || 0;
            const budget = (summary as any)?.platformBudget?.[p.key];
            const dailyBudget  = budget?.budgetDaily    || 0;
            const monthBudget  = budget?.budgetMonthly  || 0;
            const campaigns    = budget?.campaignCount  || 0;
            const pctToday = dailyBudget  > 0 ? Math.min(100, Math.round(today / dailyBudget * 100))  : null;
            const pctMonth = monthBudget  > 0 ? Math.min(100, Math.round(month / monthBudget * 100)) : null;
            return (
              <div key={p.key} style={{ ...glass, padding: "18px 20px", transition: "all .2s" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--shadow-md)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "var(--glass-shadow)"; }}>

                {/* Header plataforma */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: p.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                      {p.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: p.color }}>{p.label}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>
                        {campaigns > 0 ? `${campaigns} campanha${campaigns > 1 ? "s" : ""} ativa${campaigns > 1 ? "s" : ""}` : "Sem campanhas"}
                      </div>
                    </div>
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: campaigns > 0 ? "#30d158" : "var(--border2)", boxShadow: campaigns > 0 ? "0 0 0 3px #30d15830" : "none" }} />
                </div>

                {/* Gasto hoje */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Gasto hoje</span>
                    {pctToday !== null && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: pctToday > 80 ? "var(--red)" : pctToday > 50 ? "#ff9f0a" : "#30d158" }}>
                        {pctToday}% do diário
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "var(--dark)", letterSpacing: "-0.04em", marginBottom: 6 }}>
                    {R(today)}
                  </div>
                  {dailyBudget > 0 && (
                    <>
                      <div style={{ height: 4, background: "var(--border2)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{
                          width: (pctToday || 0) + "%", height: "100%", borderRadius: 99,
                          background: (pctToday || 0) > 80 ? "var(--red)" : (pctToday || 0) > 50 ? "#ff9f0a" : p.color,
                          transition: "width .5s var(--ease)",
                        }} />
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                        Budget diário: {R(dailyBudget)}
                      </div>
                    </>
                  )}
                </div>

                {/* Divisor */}
                <div style={{ height: 1, background: "var(--border)", margin: "12px 0" }} />

                {/* Gasto no mês */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Mês atual</span>
                    {pctMonth !== null && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>{pctMonth}% do mensal</span>
                    )}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: p.color, letterSpacing: "-0.03em", marginBottom: monthBudget > 0 ? 6 : 0 }}>
                    {R(month)}
                  </div>
                  {monthBudget > 0 && (
                    <>
                      <div style={{ height: 4, background: "var(--border2)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{
                          width: (pctMonth || 0) + "%", height: "100%", borderRadius: 99,
                          background: `linear-gradient(90deg, ${p.color}, ${p.color}aa)`,
                          transition: "width .6s var(--ease)",
                        }} />
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                        Budget mensal: {R(monthBudget)}
                      </div>
                    </>
                  )}
                  {!monthBudget && !month && (
                    <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>Sem dados ainda</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Layout: nav lateral + conteúdo */}
        <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 14, marginBottom: 16 }}>

          {/* Nav lateral — estilo sidebar */}
          <div style={{ ...glass, padding: "10px 10px", height: "fit-content", position: "sticky", top: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 10px 8px" }}>Módulos</div>
            {TABS.map((t, i) => {
              const active = tab === i;
              return (
                <button key={t.id} onClick={() => setTab(i)} className="fn-nav" style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 10, border: "none",
                  cursor: "pointer", width: "100%", textAlign: "left",
                  fontFamily: "var(--font)", fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  color: active ? t.color : "var(--muted)",
                  background: active ? t.color + "14" : "transparent",
                  position: "relative", transition: "all .15s", marginBottom: 2,
                }}>
                  {active && <div style={{ position: "absolute", left: 0, top: "20%", height: "60%", width: 3, background: t.color, borderRadius: "0 2px 2px 0" }} />}
                  <div className="fn-ic" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: active ? t.color + "18" : "rgba(0,0,0,0.04)", color: active ? t.color : "var(--muted)" }}>
                    {t.icon}
                  </div>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
                  {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: t.color, flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>

          {/* Conteúdo */}
          <div style={{ ...glass, padding: 26, minHeight: 440 }}>

            {/* Visão Geral */}
            {tab === 0 && (
              <div>
                <SectionHeader icon="▣" color="#0071e3" title="Visão Geral" sub="Resumo financeiro e acesso rápido" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
                  <div style={{ background: "var(--off)", borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 12 }}>Gasto por plataforma</div>
                    {PLATS.map((p, i) => (
                      <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < PLATS.length - 1 ? "1px solid var(--border)" : "none" }}>
                        <span style={{ fontSize: 18 }}>{p.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: p.color }}>{p.label}</div>
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>{R((summary as any)?.spendMonth?.[p.key])} no mês</div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: "var(--dark)" }}>{R((summary as any)?.spendToday?.[p.key])}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "var(--off)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700 }}>Últimas movimentações</div>
                    {(summary as any)?.recentMovements?.slice(0, 5).map((m: any, i: number) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
                        <span>{m.type === "deposit" ? "📥" : m.type === "fee" ? "🏷️" : m.type === "transfer" ? "💸" : "📢"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.type === "deposit" ? "Depósito" : m.type === "fee" ? "Taxa" : m.type === "transfer" ? "Transferência" : m.platform || "Gasto"}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>{new Date(m.createdAt).toLocaleDateString("pt-BR")}</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: m.direction === "credit" ? "#30d158" : "var(--red)", flexShrink: 0 }}>
                          {m.direction === "credit" ? "+" : "−"}{R(m.amount)}
                        </div>
                      </div>
                    ))}
                    {!(summary as any)?.recentMovements?.length && (
                      <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Nenhuma movimentação ainda</div>
                    )}
                  </div>
                </div>

                {/* Atalhos */}
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Acesso rápido</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {TABS.slice(1).map((t, i) => (
                    <button key={t.id} onClick={() => setTab(i + 1)}
                      style={{ padding: "14px 10px", borderRadius: 12, border: "1.5px solid var(--border)", background: "white", cursor: "pointer", textAlign: "center", transition: "all .2s", fontFamily: "var(--font)" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.boxShadow = `0 4px 14px ${t.color}28`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, margin: "0 auto 8px", background: t.color + "14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: t.color }}>
                        {t.icon}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dark)", marginBottom: 4 }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: t.color, fontWeight: 600 }}>Acessar →</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 1 && <TabDeposit balance={balance} ps={ps} onBack={() => setTab(0)} />}
            {tab === 2 && <TabCredits summary={summary} onBack={() => setTab(0)} />}
            {tab === 3 && <TabRateio ps={ps} summary={summary} onBack={() => setTab(0)} />}
            {tab === 4 && <TabTransfer asaas={asaas} onBack={() => setTab(0)} />}
          </div>
        </div>

        {/* Back / Dots / Next */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...glass, padding: "14px 20px" }}>
          <button onClick={() => setTab(t => Math.max(0, t - 1))} disabled={isFirst} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", borderRadius: 10,
            border: "1.5px solid var(--border)", background: isFirst ? "var(--off)" : "white",
            color: isFirst ? "var(--muted)" : "var(--dark)", fontWeight: 700, fontSize: 13,
            cursor: isFirst ? "not-allowed" : "pointer", opacity: isFirst ? 0.4 : 1,
            fontFamily: "var(--font)", boxShadow: isFirst ? "none" : "var(--shadow-xs)", transition: "all .2s",
          }}>
            <span style={{ fontSize: 18 }}>←</span>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 500, lineHeight: 1, marginBottom: 2 }}>Anterior</div>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{!isFirst ? TABS[tab - 1].label : "—"}</div>
            </div>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {TABS.map((t, i) => (
              <button key={t.id} onClick={() => setTab(i)} style={{
                width: i === tab ? 22 : 7, height: 7, borderRadius: 99, border: "none", padding: 0,
                cursor: "pointer", background: i === tab ? t.color : "var(--border2)",
                transition: "all .3s var(--ease)",
              }} />
            ))}
          </div>

          <button onClick={() => setTab(t => Math.min(TABS.length - 1, t + 1))} disabled={isLast} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", borderRadius: 10, border: "none",
            background: isLast ? "var(--off)" : "var(--grad-primary)", color: isLast ? "var(--muted)" : "white",
            fontWeight: 700, fontSize: 13, cursor: isLast ? "not-allowed" : "pointer", opacity: isLast ? 0.4 : 1,
            fontFamily: "var(--font)", boxShadow: isLast ? "none" : "var(--shadow-blue)", transition: "all .2s",
          }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 500, lineHeight: 1, marginBottom: 2, opacity: 0.75 }}>Próximo</div>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{!isLast ? TABS[tab + 1].label : "—"}</div>
            </div>
            <span style={{ fontSize: 18 }}>→</span>
          </button>
        </div>

      </div>
    </Layout>
  );
}
