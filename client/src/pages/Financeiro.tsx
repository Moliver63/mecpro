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
  const [amount, setAmount]   = useState("");
  const [cpf,    setCpf]      = useState("");
  const [method, setMethod]   = useState<"pix" | "card">("pix");
  const [step,   setStep]     = useState<"form" | "pix" | "card">("form");
  const [pixData, setPixData] = useState<any>(null);
  const [polling, setPolling] = useState(false);
  const [paid,    setPaid]    = useState(false);

  const feePercent = (ps as any)?.feePercent ?? 10;
  const parsed     = parseFloat(String(amount).replace(",", ".")) || 0;
  const fee        = parsed * feePercent / 100;
  const credited   = parsed - fee;

  const pixMutation = (trpc as any).mediaBudget?.requestPixDeposit?.useMutation?.({
    onSuccess: (data: any) => {
      setPixData(data);
      setStep("pix");
      // Polling automático — verifica pagamento a cada 5s por 10min
      let tries = 0;
      setPolling(true);
      const interval = setInterval(async () => {
        tries++;
        if (tries > 120) { clearInterval(interval); setPolling(false); return; }
        try {
          // Verifica saldo — se aumentou, foi aprovado
          const res = await fetch("/trpc/mediaBudget.getBalance", { credentials: "include" });
          if (res.ok) {
            const json = await res.json();
            const newBal = json?.result?.data?.balance ?? 0;
            if (newBal > ((balance as any)?.balance ?? 0)) {
              clearInterval(interval);
              setPolling(false);
              setPaid(true);
              toast.success("🎉 Pix confirmado! Saldo creditado automaticamente.");
            }
          }
        } catch { /* silencioso */ }
      }, 5000);
    },
    onError: (e: any) => toast.error(e.message),
  }) ?? { mutate: () => {}, isPending: false };

  if (!(ps as any)?.modeWallet) {
    return (
      <div>
        <SectionHeader icon="◫" color="#0071e3" title="Depositar" sub="Adicione saldo à sua wallet" onBack={onBack} />
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.25 }}>◻</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>Depósito temporariamente desabilitado</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Contate o administrador para habilitar</div>
        </div>
      </div>
    );
  }

  /* ── Tela de sucesso ── */
  if (paid) return (
    <div>
      <SectionHeader icon="◫" color="#0071e3" title="Depositar" sub="" onBack={onBack} />
      <div style={{ textAlign: "center", padding: "32px 20px" }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#30d15820", border: "2px solid #30d158", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, margin: "0 auto 20px" }}>✓</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>Pagamento confirmado!</div>
        <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>
          <strong style={{ color: "#30d158" }}>{R(credited)}</strong> creditados no seu saldo
        </div>
        <button onClick={() => { setPaid(false); setStep("form"); setAmount(""); setCpf(""); setPixData(null); }}
          style={{ ...primaryBtn(), maxWidth: 280, margin: "0 auto", display: "block" }}>
          Fazer outro depósito
        </button>
      </div>
    </div>
  );

  /* ── Tela do QR Code Pix ── */
  if (step === "pix" && pixData) return (
    <div>
      <SectionHeader icon="◫" color="#0071e3" title="Pague com Pix" sub="Escaneie o QR Code ou copie o código" onBack={() => setStep("form")} />
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 28, alignItems: "start" }}>

        {/* QR Code */}
        <div style={{ textAlign: "center" }}>
          {pixData.pixQrCode ? (
            <img src={`data:image/png;base64,${pixData.pixQrCode}`} alt="QR Pix"
              style={{ width: 200, height: 200, borderRadius: 16, border: "2px solid var(--border)", display: "block" }} />
          ) : (
            <div style={{ width: 200, height: 200, borderRadius: 16, background: "var(--off)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>
              📱
            </div>
          )}
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--muted)" }}>
            {polling ? (
              <span style={{ color: "#0071e3", fontWeight: 700 }}>⏳ Aguardando confirmação...</span>
            ) : "Válido por 24 horas"}
          </div>
        </div>

        {/* Detalhes */}
        <div>
          {/* Resumo do pagamento */}
          {[
            { label: "Valor do Pix",       value: R(pixData.amount),    color: "var(--dark)" },
            { label: `Taxa (${feePercent}%)`, value: `− ${R(pixData.feeAmount)}`, color: "var(--red)" },
            { label: "Crédito na wallet",   value: R(pixData.netAmount), color: "#30d158" },
          ].map(row => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{row.label}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: row.color }}>{row.value}</span>
            </div>
          ))}

          <div style={{ marginTop: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              Código Pix (copia e cola)
            </div>
            <div style={{ background: "var(--off)", borderRadius: 10, padding: "10px 14px", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--dark)", wordBreak: "break-all", lineHeight: 1.5 }}>
              {pixData.pixPayload || "—"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { navigator.clipboard.writeText(pixData.pixPayload || ""); toast.success("Código copiado!"); }}
              style={{ ...primaryBtn(), flex: 1, fontSize: 13 }}>
              📋 Copiar código Pix
            </button>
          </div>

          <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(0,113,227,0.06)", border: "1px solid rgba(0,113,227,0.15)", borderRadius: 10, fontSize: 11, color: "#1d4ed8", lineHeight: 1.5 }}>
            ◈ O saldo é creditado <strong>automaticamente</strong> em até 15 minutos após a confirmação do Pix pelo Asaas.
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Formulário principal ── */
  return (
    <div>
      <SectionHeader icon="◫" color="#0071e3" title="Depositar créditos"
        sub="Pague com Pix e o saldo é creditado automaticamente" onBack={onBack} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Coluna esquerda — form */}
        <div>
          {/* Saldo atual */}
          <div style={{ background: "rgba(0,113,227,0.06)", border: "1.5px solid rgba(0,113,227,0.2)", borderRadius: 14, padding: "14px 18px", marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Saldo atual na wallet</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#0071e3", letterSpacing: "-0.04em" }}>{R((balance as any)?.balance)}</div>
          </div>

          {/* Método */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
            {(["pix", "card"] as const).map(m => (
              <button key={m} onClick={() => setMethod(m)} style={{
                padding: "12px 8px", borderRadius: 11, border: `2px solid ${method === m ? "#0071e3" : "var(--border)"}`,
                background: method === m ? "rgba(0,113,227,0.07)" : "white",
                color: method === m ? "#0071e3" : "var(--muted)",
                fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "var(--font)", transition: "all .15s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                {m === "pix" ? "◎ Pix" : "▣ Cartão"}
                {m === "pix" && <span style={{ fontSize: 10, background: "#30d158", color: "white", padding: "1px 5px", borderRadius: 4, fontWeight: 800 }}>GRÁTIS</span>}
              </button>
            ))}
          </div>

          {/* Valor */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
              Valor (R$)
            </label>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ex: 500"
              style={{ width: "100%", padding: "13px 16px", borderRadius: 11, border: "1.5px solid var(--border)", fontSize: 22, fontWeight: 900, fontFamily: "var(--font)", boxSizing: "border-box", outline: "none", transition: "border .15s", color: "var(--black)" }}
              onFocus={e => e.target.style.borderColor = "#0071e3"}
              onBlur={e  => e.target.style.borderColor = "var(--border)"}
            />
          </div>

          {/* Valores rápidos */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 6, marginBottom: method === "pix" ? 14 : 0 }}>
            {QUICK_AMOUNTS.map(a => (
              <button key={a} onClick={() => setAmount(String(a))} style={{
                padding: "8px 4px", borderRadius: 9,
                border: `1.5px solid ${amount === String(a) ? "#0071e3" : "var(--border)"}`,
                background: amount === String(a) ? "rgba(0,113,227,0.08)" : "white",
                color: amount === String(a) ? "#0071e3" : "var(--muted)",
                fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--font)", transition: "all .15s",
              }}>
                {R(a)}
              </button>
            ))}
          </div>

          {/* CPF (só Pix) */}
          {method === "pix" && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                CPF / CNPJ
              </label>
              <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00 ou 00.000.000/0001-00"
                style={{ width: "100%", padding: "11px 14px", borderRadius: 11, border: "1.5px solid var(--border)", fontSize: 14, fontFamily: "var(--font)", boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>Obrigatório para emissão do Pix pelo Asaas</div>
            </div>
          )}

          {/* Botão */}
          <button
            onClick={() => {
              if (method === "pix") {
                pixMutation.mutate({ amount: parsed, cpfCnpj: cpf });
              } else {
                toast.info("Pagamento por cartão em breve. Use o Pix por enquanto.");
              }
            }}
            disabled={parsed < 50 || pixMutation.isPending || (method === "pix" && cpf.replace(/\D/g,"").length < 11)}
            style={{
              ...primaryBtn(), marginTop: 4,
              opacity: (parsed < 50 || (method === "pix" && cpf.replace(/\D/g,"").length < 11)) ? 0.45 : 1,
              cursor:  (parsed < 50 || (method === "pix" && cpf.replace(/\D/g,"").length < 11)) ? "not-allowed" : "pointer",
            }}>
            {pixMutation.isPending ? "Gerando..." : method === "pix" ? `Gerar Pix de ${parsed >= 50 ? R(parsed) : "R$ ——"}` : `Pagar ${parsed >= 50 ? R(parsed) : ""} com Cartão`}
          </button>

          {parsed > 0 && parsed < 50 && (
            <div style={{ fontSize: 11, color: "var(--red)", textAlign: "center", marginTop: 6 }}>Valor mínimo: R$ 50,00</div>
          )}
        </div>

        {/* Coluna direita — simulação */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Simulação</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {[
              { label: "Valor pago",              val: R(parsed || 0),   color: "var(--dark)" },
              { label: `Taxa gestão (${feePercent}%)`, val: parsed ? `− ${R(fee)}` : "—", color: "var(--red)" },
              { label: "💰 Crédito na wallet",    val: parsed ? R(credited) : "—", color: "#30d158", big: true },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", background: "var(--off)", borderRadius: 11 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{row.label}</span>
                <span style={{ fontSize: row.big ? 18 : 14, fontWeight: 900, color: row.color }}>{row.val}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { icon: "⚡", title: "Aprovação automática", desc: "Pix confirmado pelo Asaas em até 15min" },
              { icon: "🔒", title: "Pagamento seguro",     desc: "Processado via Asaas (certificado PCI)" },
              { icon: "◈",  title: "Sem juros",            desc: "Pix é isento de taxas bancárias" },
              { icon: "📱", title: "QR Code na tela",      desc: "Não precisa sair do MECPro" },
            ].map(info => (
              <div key={info.title} style={{ display: "flex", gap: 10, padding: "10px 14px", background: "var(--off)", borderRadius: 10 }}>
                <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.4 }}>{info.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 1 }}>{info.title}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{info.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 20 }}>
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
    onSuccess: () => toast.success("◎ Rateio atualizado!"),
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
          <button onClick={() => updateMutation.mutate({ dist: { meta: dist.meta ?? 0, google: dist.google ?? 0, tiktok: dist.tiktok ?? 0 } })}
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
    onSuccess: () => { toast.success("◎ Transferência realizada!"); setAmount(""); setKey(""); },
    onError:   (e: any) => toast.error(e.message),
  }) ?? { mutate: () => {}, isPending: false };

  const syncMutation = (trpc as any).mediaBudget?.syncAsaasBalance?.useMutation?.({
    onSuccess: (data: any) => toast.success(`◎ R$ ${data.credited.toFixed(2)} creditados na wallet!`),
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
            {(asaas?.balance ?? 0) > 0 && (
              <>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
                  {asaas?.pendingCount ?? 0} Pix pendente{(asaas?.pendingCount ?? 0) !== 1 ? "s" : ""} aguardando confirmação
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => syncMutation.mutate({ amountReais: asaas?.balance })}
                  disabled={syncMutation.isPending}
                  style={{
                    marginTop: 8, width: "100%",
                    background: "var(--orange)", color: "white",
                    fontWeight: 700, fontSize: 12,
                    opacity: syncMutation.isPending ? 0.7 : 1,
                  }}>
                  {syncMutation.isPending
                    ? "Confirmando..."
                    : `Confirmar Pix de R$ ${(asaas?.balance ?? 0).toFixed(2)}`}
                </button>
              </>
            )}
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 6, marginBottom: 10 }}>
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

function PendingRechargesPanel() {
  const { data: pending = [], refetch } =
    (trpc as any).mediaBudget?.listPendingRecharges?.useQuery?.() ?? { data: [] };

  const confirmMut = (trpc as any).mediaBudget?.markRechargeConfirmed?.useMutation?.({
    onSuccess: () => { toast.success("◎ Recarga confirmada!"); refetch(); },
    onError:   (e: any) => toast.error(e.message),
  });

  if (!pending.length) return null;

  const PLAT: Record<string, string> = { meta: "📘 Meta", google: "🔵 Google", tiktok: "◼ TikTok" };

  return (
    <div style={{
      background: "rgba(255,159,10,0.06)", border: "1.5px solid rgba(255,159,10,0.3)",
      borderRadius: "var(--r)", padding: "16px 20px", marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#b25000", marginBottom: 12 }}>
        ◬ {pending.length} recarga{pending.length > 1 ? "s" : ""} aguardando confirmação
      </div>
      {pending.map((r: any) => (
        <div key={r.id} style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 0", borderBottom: "1px solid rgba(255,159,10,0.15)",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dark)" }}>
              {PLAT[r.platform] || r.platform} — R$ {r.amount.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              {r.hoursPending}h pendente · expira em {r.expiresIn}h
              {r.reminderSent && " · lembrete enviado"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{
              height: 4, width: `${Math.min(100, (r.hoursPending / 24) * 100)}%`,
              background: r.expiresIn < 4 ? "var(--red)" : "var(--orange)",
              borderRadius: 99, minWidth: 40, maxWidth: 80,
            }} />
            <button
              className="btn btn-sm btn-primary"
              onClick={() => confirmMut?.mutate({ budgetId: r.id })}
              style={{ fontSize: 11, padding: "4px 12px" }}>
              Confirmar
            </button>
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
        Confirme após realizar o pagamento na plataforma. Não confirmadas em 24h são canceladas e o saldo é devolvido.
      </div>
    </div>
  );
}

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

      <div style={{ maxWidth: "100%", margin: "0 auto", padding: "clamp(14px, 2.5vw, 28px) clamp(14px, 2vw, 20px)", fontFamily: "var(--font)" }}>

        <PendingRechargesPanel />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--grad-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: "var(--shadow-blue)", flexShrink: 0, color: "white" }}>▣</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--black)", letterSpacing: "-0.04em" }}>Financeiro</h1>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Gerencie saldo, créditos e verba de mídia</p>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 22 }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 22 }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "clamp(160px, 20%, 210px) 1fr", gap: 14, marginBottom: 16 }}>

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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 22 }}>
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
                        <span>{m.type === "deposit" ? "📥" : m.type === "fee" ? "🏷️" : m.type === "transfer" ? "◍" : "📢"}</span>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8 }}>
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
