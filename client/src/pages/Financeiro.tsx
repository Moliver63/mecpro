/**
 * Financeiro.tsx — Hub financeiro completo com navegação fluida
 * Cada aba tem o conteúdo REAL embutido + botão de voltar interno
 * Design: Liquid Glass · MECPro AI Design System v2
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const R = (v?: number | null) =>
  v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const TABS = [
  { id: "overview",  icon: "▣", label: "Visão Geral",        color: "#0071e3",  desc: "Resumo do seu financeiro"                    },
  { id: "deposit",   icon: "◫", label: "Depositar",           color: "#0071e3",  desc: "Adicione saldo via Pix ou cartão"            },
  { id: "transfer",  icon: "🏦", label: "MecBank → Wallet",   color: "#30d158",  desc: "Transfira saldo confirmado para sua carteira" },
  { id: "buy",       icon: "◆", label: "Distribuir Verba",    color: "#5856d6",  desc: "Distribua saldo para campanhas ativas"       },
  { id: "pay",       icon: "⎆", label: "Pagar Código Ads",    color: "#af52de",  desc: "Pague Pix/boleto gerado nas plataformas"     },
  { id: "credits",   icon: "◈", label: "Guia de Recarga",     color: "#16a34a",  desc: "Como recarregar diretamente nas plataformas" },
  { id: "history",   icon: "📋", label: "Histórico",          color: "#6b7280",  desc: "Movimentações e status dos seus depósitos"   },
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

function TabDeposit({ balance, ps, psLoading, onBack }: { balance: any; ps: any; psLoading: boolean; onBack: () => void }) {
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

  const cardMutation = (trpc as any).mediaBudget?.requestCardDeposit?.useMutation?.({
    onSuccess: (data: any) => {
      toast.success("◎ Redirecionando para pagamento seguro...");
      // Redireciona para a página hospedada do Asaas (PCI-DSS-SAQ-A)
      // Usuário paga com cartão lá e volta para o MECPro
      window.location.href = data.invoiceUrl;
    },
    onError: (e: any) => toast.error(e.message),
  }) ?? { mutate: () => {}, isPending: false };

  const handleSubmit = () => {
    if (!parsed || parsed <= 0) { toast.error("Informe o valor"); return; }
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length < 11) { toast.error("Informe um CPF ou CNPJ válido"); return; }

    if (method === "pix") {
      pixMutation.mutate({ amount: parsed, cpfCnpj: cleanCpf });
    } else {
      cardMutation.mutate({ amount: parsed, cpfCnpj: cleanCpf });
    }
  };

  if (psLoading) {
    return (
      <div>
        <SectionHeader icon="◫" color="#0071e3" title="Depositar" sub="Adicione saldo à sua wallet" onBack={onBack} />
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>◌</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>Carregando configuração de depósito…</div>
        </div>
      </div>
    );
  }

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
        <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>
          <strong style={{ color: "#30d158" }}>{R(credited)}</strong> creditados no seu saldo
        </div>
        {/* MecCoins earned */}
        {credited >= 19 && (
          <div style={{ background: "linear-gradient(135deg,#0a1a0e,#0d2212)", border: "1.5px solid rgba(48,209,88,.35)", borderRadius: 14, padding: "14px 20px", marginBottom: 20, display: "inline-flex", alignItems: "center", gap: 12 }}>
            <img src="/logo-512.png" alt="MecCoin" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#30d158" }}>
                +{Math.floor(credited / 19)} MecCoins 🪙
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)" }}>
                1 MecCoin = R$ 19,00 em campanhas
              </div>
            </div>
          </div>
        )}
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
            ◈ O saldo é creditado <strong>automaticamente</strong> em até 15 minutos após a confirmação do Pix pelo MecBank.
          </div>

          {/* Preview MecCoins que serão recebidos */}
          {(pixData?.netAmount ?? 0) >= 19 && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, background: "linear-gradient(135deg,#0a1a0e,#0d2212)", border: "1.5px solid rgba(48,209,88,.3)", borderRadius: 10, padding: "10px 14px" }}>
              <img src="/logo-512.png" alt="MecCoin" style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#30d158" }}>
                  Ao confirmar: +{Math.floor((pixData?.netAmount ?? 0) / 19)} MecCoins 🪙
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", marginTop: 1 }}>
                  {R(pixData?.netAmount ?? 0)} líquido · 1 MecCoin = R$ 19,00
                </div>
              </div>
            </div>
          )}
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

          {/* CPF / CNPJ — obrigatório para Pix e Cartão */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
              CPF / CNPJ
            </label>
            <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00 ou 00.000.000/0001-00"
              style={{ width: "100%", padding: "11px 14px", borderRadius: 11, border: "1.5px solid var(--border)", fontSize: 14, fontFamily: "var(--font)", boxSizing: "border-box" }}
            />
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>Obrigatório para emissão da cobrança via MecBank</div>
          </div>

          {/* Botão */}
          <button
            onClick={handleSubmit}
            disabled={parsed < 10 || (pixMutation.isPending || cardMutation.isPending) || cpf.replace(/\D/g,"").length < 11}
            style={{
              ...primaryBtn(), marginTop: 4,
              opacity: (parsed < 10 || cpf.replace(/\D/g,"").length < 11) ? 0.45 : 1,
              cursor:  (parsed < 10 || cpf.replace(/\D/g,"").length < 11) ? "not-allowed" : "pointer",
            }}>
            {(pixMutation.isPending || cardMutation.isPending) ? "Processando..." : method === "pix" ? "◎ Gerar Pix" : "◎ Ir para pagamento com cartão"}
          </button>

          {parsed > 0 && parsed < 10 && (
            <div style={{ fontSize: 11, color: "var(--red)", textAlign: "center", marginTop: 6 }}>Valor mínimo: R$ 10,00</div>
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
              { icon: "⚡", title: "Aprovação automática", desc: "Pix confirmado pelo MecBank em até 15min" },
              { icon: "🔒", title: "Pagamento seguro",     desc: "Processado via MecBank (certificado PCI)" },
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

function TabPayCode({ balance, onBack }: { balance: any; onBack: () => void }) {
  const walletBalance = (balance as any)?.balance ?? 0;

  const [code,      setCode]      = useState("");
  const [platform,  setPlatform]  = useState<"meta"|"google"|"tiktok"|"other">("meta");
  const [override,  setOverride]  = useState("");
  const [notes,     setNotes]     = useState("");
  const [step,      setStep]      = useState<"input"|"confirm"|"done">("input");
  const [result,    setResult]    = useState<any>(null);
  const [scanMode,  setScanMode]  = useState(false);
  const [scanErr,   setScanErr]   = useState("");

  // Validação em tempo real — só dispara com 20+ chars
  const { data: validated, isLoading: validating } =
    (trpc as any).mediaBudget?.validateExternalCode?.useQuery?.(
      { code: code.trim() },
      { enabled: code.trim().length >= 20 }
    ) ?? { data: null, isLoading: false };

  // Auto-seleciona a plataforma quando o código Pix identifica o recebedor
  // (useEffect DEPOIS de validated para respeitar ordem dos hooks)
  useEffect(() => {
    if ((validated as any)?.detectedPlatform) {
      setPlatform((validated as any).detectedPlatform as any);
    }
  }, [(validated as any)?.detectedPlatform]);

  const finalAmount   = validated?.amount ?? (parseFloat(override.replace(",", ".")) || 0);
  const needsOverride = validated?.valid && !validated?.amount;
  const hasEnough     = walletBalance >= finalAmount && finalAmount > 0;

  // ── Leitor QR Code via câmera (jsQR via CDN) ──────────────────────────────
  function startScan() {
    setScanErr(""); setScanMode(true);
    if (!(window as any).jsQR) {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js";
      s.onload = () => openCamera();
      s.onerror = () => { setScanErr("Biblioteca QR não carregou. Cole o código manualmente."); setScanMode(false); };
      document.head.appendChild(s);
    } else { openCamera(); }
  }

  function openCamera() {
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        const video = document.getElementById("pay-qr-video") as HTMLVideoElement;
        if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream; video.play();
        scanFrame(video, stream);
      })
      .catch(() => { setScanErr("Câmera não disponível. Permita o acesso ou cole o código."); setScanMode(false); });
  }

  function scanFrame(video: HTMLVideoElement, stream: MediaStream) {
    let active = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    function tick() {
      if (!active) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = (window as any).jsQR?.(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (data?.data) {
          setCode(data.data); setScanMode(false); active = false;
          stream.getTracks().forEach(t => t.stop());
          toast.success("QR Code lido com sucesso!");
          return;
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function stopScan() {
    setScanMode(false);
    const video = document.getElementById("pay-qr-video") as HTMLVideoElement;
    if (video?.srcObject) { (video.srcObject as MediaStream).getTracks().forEach(t => t.stop()); video.srcObject = null; }
  }

  const payMut = (trpc as any).mediaBudget?.payExternalCode?.useMutation?.({
    onSuccess: (data: any) => { setResult(data); setStep("done"); toast.success(`✅ Pagamento de R$ ${data.amount.toFixed(2)} realizado!`); },
    onError:   (e: any)    => { toast.error(e.message); setStep("input"); },
  }) ?? { mutate: () => {}, isPending: false };

  function handlePay() {
    if (!validated?.valid) { toast.error("Código inválido"); return; }
    if (!hasEnough) { toast.error("Saldo insuficiente"); return; }
    payMut.mutate({ code: code.trim(), amountOverride: needsOverride ? parseFloat(override.replace(",", ".")) : undefined, platform, notes: notes || undefined });
  }

  // ── SUCESSO ────────────────────────────────────────────────────────────────
  if (step === "done" && result) return (
    <div>
      <SectionHeader icon="⎆" color="#af52de" title="Pagamento realizado!" sub="" onBack={onBack} />
      <div style={{ background: "rgba(48,209,88,.08)", border: "1.5px solid rgba(48,209,88,.3)", borderRadius: 16, padding: 28, marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "var(--green-d)", marginBottom: 6 }}>Pagamento confirmado</div>
        <div style={{ fontSize: 15, color: "var(--muted)", marginBottom: 8 }}>
          R$ {result.amount?.toFixed(2)} · {result.type === "pix" ? "Pix" : "Boleto"} · {result.platform?.toUpperCase()}
        </div>
        {result.asaasId && <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>ID: {result.asaasId}</div>}
      </div>
      <button onClick={() => { setStep("input"); setCode(""); setOverride(""); setNotes(""); setResult(null); }}
        style={{ ...primaryBtn("var(--grad-primary)") }}>
        Fazer novo pagamento
      </button>
    </div>
  );

  // ── CONFIRMAR ──────────────────────────────────────────────────────────────
  if (step === "confirm" && validated?.valid) return (
    <div>
      <SectionHeader icon="⎆" color="#af52de" title="Confirmar pagamento" sub="Revise os dados antes de confirmar" onBack={() => setStep("input")} />
      <div style={{ background: "var(--off)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
        {[
          { l: "Tipo",       v: validated.type === "pix" ? "📱 Pix copia-e-cola" : "📄 Boleto bancário" },
          { l: "Plataforma", v: platform === "meta" ? "📘 Meta Ads" : platform === "google" ? "🔵 Google Ads" : platform === "tiktok" ? "◼ TikTok Ads" : "◌ Outra" },
          { l: "Valor",      v: `R$ ${finalAmount.toFixed(2)}`, bold: true },
          ...(validated.recipient  ? [{ l: "Recebedor",   v: validated.recipient }] : []),
          ...(validated.expiresAt  ? [{ l: "Vencimento",  v: new Date(validated.expiresAt).toLocaleDateString("pt-BR") }] : []),
          { l: "Saldo antes",  v: `R$ ${walletBalance.toFixed(2)}` },
          { l: "Saldo depois", v: `R$ ${(walletBalance - finalAmount).toFixed(2)}`, bold: true, color: "var(--green-d)" },
        ].map((r: any, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{r.l}</span>
            <span style={{ fontSize: r.bold ? 16 : 13, fontWeight: r.bold ? 900 : 700, color: r.color || "var(--dark)" }}>{r.v}</span>
          </div>
        ))}
      </div>
      <div style={{ background: "rgba(255,159,10,.06)", border: "1px solid rgba(255,159,10,.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: "#b25000" }}>
        ⚠️ Após confirmar o valor é debitado da Wallet e enviado ao gateway. Ação irreversível.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button onClick={() => setStep("input")} style={{ padding: "13px", borderRadius: 12, border: "1.5px solid var(--border)", background: "white", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "var(--font)" }}>← Voltar</button>
        <button onClick={handlePay} disabled={payMut.isPending} style={{ ...primaryBtn("linear-gradient(135deg,#af52de,#6d2b9f)"), opacity: payMut.isPending ? 0.6 : 1 }}>
          {payMut.isPending ? "⏳ Processando..." : `✅ Confirmar · R$ ${finalAmount.toFixed(2)}`}
        </button>
      </div>
    </div>
  );

  // ── FORMULÁRIO PRINCIPAL ───────────────────────────────────────────────────
  return (
    <div>
      <SectionHeader icon="⎆" color="#af52de" title="Pagar Código Ads"
        sub="Cole ou escaneie o código Pix/boleto gerado nas plataformas" onBack={onBack} />

      {/* Saldo */}
      <InfoCard color="#af52de">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Saldo disponível na Wallet</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#af52de", letterSpacing: "-.04em" }}>{R(walletBalance)}</div>
          </div>
          {walletBalance <= 0 && (
            <div style={{ background: "rgba(255,59,48,.08)", border: "1px solid rgba(255,59,48,.2)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "var(--red)", lineHeight: 1.5 }}>
              ⚠️ Saldo zero.<br/>Deposite antes de pagar.
            </div>
          )}
        </div>
      </InfoCard>

      {/* Explicação */}
      <div style={{ background: "rgba(0,113,227,.05)", border: "1px solid rgba(0,113,227,.15)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--blue)", lineHeight: 1.6 }}>
        <strong>Como funciona:</strong> gere um Pix ou boleto na Meta / Google / TikTok Ads, cole ou escaneie aqui — o MECPro paga usando seu saldo da Wallet. 100% legal, sem acesso à sua conta nas plataformas.
      </div>

      {/* Plataforma */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 8 }}>
          1. Plataforma de destino
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
          {[
            { key: "meta",   label: "Meta",   icon: "📘", color: "#1877f2" },
            { key: "google", label: "Google", icon: "🔵", color: "#1a73e8" },
            { key: "tiktok", label: "TikTok", icon: "◼",  color: "#111"    },
            { key: "other",  label: "Outra",  icon: "◌",  color: "#6b7280" },
          ].map(p => (
            <button key={p.key} onClick={() => setPlatform(p.key as any)}
              style={{ padding: "10px 6px", borderRadius: 10, border: platform === p.key ? `2px solid ${p.color}` : "1.5px solid var(--border)", background: platform === p.key ? p.color + "12" : "white", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--font)", transition: "all .15s" }}>
              <div style={{ fontSize: 18, marginBottom: 2 }}>{p.icon}</div>{p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Código — colar ou câmera */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>
            2. Código Pix ou boleto
          </label>
          <button onClick={scanMode ? stopScan : startScan}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: scanMode ? "var(--red)" : "#af52de", background: scanMode ? "rgba(255,59,48,.06)" : "rgba(175,82,222,.08)", border: `1px solid ${scanMode ? "rgba(255,59,48,.2)" : "rgba(175,82,222,.2)"}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "var(--font)" }}>
            {scanMode ? "⏹ Parar câmera" : "📷 Escanear QR Code"}
          </button>
        </div>

        {/* Preview câmera */}
        {scanMode && (
          <div style={{ marginBottom: 12, borderRadius: 14, overflow: "hidden", border: "2px solid #af52de", position: "relative", background: "#000" }}>
            <video id="pay-qr-video" style={{ width: "100%", maxHeight: 260, objectFit: "cover", display: "block" }} playsInline muted />
            <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center", fontSize: 12, color: "#fff", fontWeight: 700 }}>
              📷 Aponte para o QR Code
            </div>
          </div>
        )}
        {scanErr && (
          <div style={{ marginBottom: 10, fontSize: 12, color: "var(--red)", background: "rgba(255,59,48,.06)", borderRadius: 8, padding: "8px 12px" }}>
            ⚠️ {scanErr}
          </div>
        )}

        <textarea
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="Cole aqui o código Pix copia-e-cola ou a linha digitável do boleto..."
          rows={4}
          style={{ width: "100%", padding: "12px 14px", borderRadius: 11, border: `1.5px solid ${validated?.valid ? "rgba(48,209,88,.5)" : code.trim().length > 20 && validated && !validated.valid ? "rgba(255,59,48,.3)" : "var(--border)"}`, fontSize: 12, fontFamily: "monospace", boxSizing: "border-box", resize: "vertical", minHeight: 90, transition: "border-color .2s", outline: "none" }}
        />

        {/* Feedback validação */}
        {code.trim().length > 0 && code.trim().length < 20 && (
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
            ✏️ Continue digitando... ({code.trim().length}/20 mín)
          </div>
        )}
        {validating && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #e5e7eb", borderTop: "2px solid #af52de", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            Validando código...
          </div>
        )}
        {validated?.valid && !validating && (
          <div style={{ marginTop: 8, padding: "12px 14px", background: "rgba(48,209,88,.08)", border: "1.5px solid rgba(48,209,88,.3)", borderRadius: 10 }}>
            <div style={{ fontWeight: 800, color: "var(--green-d)", marginBottom: 8, fontSize: 13, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              ✅ {validated.type === "pix" ? "📱 Pix válido" : "📄 Boleto válido"}
              {/* Badge plataforma detectada */}
              {(validated as any).detectedPlatform && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 99,
                  background: (validated as any).detectedPlatform === "meta" ? "#1877f214" : (validated as any).detectedPlatform === "google" ? "#1a73e814" : "#11111114",
                  color: (validated as any).detectedPlatform === "meta" ? "#1877f2" : (validated as any).detectedPlatform === "google" ? "#1a73e8" : "#111",
                  border: `1px solid ${(validated as any).detectedPlatform === "meta" ? "#1877f240" : (validated as any).detectedPlatform === "google" ? "#1a73e840" : "#11111140"}`,
                }}>
                  {(validated as any).detectedPlatform === "meta" ? "📘 Meta Ads detectado automaticamente" :
                   (validated as any).detectedPlatform === "google" ? "🔵 Google Ads detectado automaticamente" :
                   "◼ TikTok Ads detectado automaticamente"}
                </span>
              )}
              {(validated as any).amountLocked && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "#16a34a", background: "rgba(22,163,74,.1)", padding: "2px 8px", borderRadius: 99 }}>
                  🔒 valor fixo
                </span>
              )}
              {validated.valid && !validated.amount && validated.type === "pix" && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "#d97706", background: "rgba(255,159,10,.1)", padding: "2px 8px", borderRadius: 99 }}>
                  valor aberto — informe abaixo
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--body)" }}>
              {validated.amount
                ? <div>💰 Valor: <strong>R$ {validated.amount.toFixed(2)}</strong>
                    {(validated as any).amountLocked && <span style={{ color: "var(--muted)", fontSize: 11 }}> (não pode ser alterado)</span>}
                  </div>
                : validated.type === "pix"
                    ? <div style={{ color: "#d97706" }}>💰 Valor: <strong>não definido no código</strong> — informe manualmente</div>
                    : null
              }
              {validated.recipient && (
                <div>👤 Recebedor: <strong>{validated.recipient}</strong></div>
              )}
              {(validated as any).pixKey && (
                <div style={{ fontSize: 11, color: "var(--muted)" }}>🔑 Chave Pix: <span style={{ fontFamily: "monospace" }}>{(validated as any).pixKey}</span></div>
              )}
              {validated.expiresAt && (
                <div>📅 Vencimento: <strong>{new Date(validated.expiresAt).toLocaleDateString("pt-BR")}</strong></div>
              )}
              {validated.description && <div>📝 {validated.description}</div>}
            </div>
          </div>
        )}
        {/* Código já usado */}
        {!validating && validated && (validated as any).alreadyUsed && (
          <div style={{ marginTop: 8, padding: "12px 14px", background: "rgba(255,59,48,.06)", border: "1.5px solid rgba(255,59,48,.3)", borderRadius: 10 }}>
            <div style={{ fontWeight: 800, color: "var(--red)", marginBottom: 4, fontSize: 13 }}>
              🚫 Código já utilizado
            </div>
            <div style={{ fontSize: 12, color: "var(--red)", lineHeight: 1.6 }}>
              {validated.error}<br/>
              <strong>Gere um novo código Pix ou boleto na plataforma de anúncios.</strong>
            </div>
          </div>
        )}
        {code.trim().length >= 20 && !validating && validated && !validated.valid && (
          <div style={{ marginTop: 8, padding: "10px 14px", background: "rgba(255,59,48,.06)", border: "1px solid rgba(255,59,48,.2)", borderRadius: 10, fontSize: 12, color: "var(--red)" }}>
            ❌ {validated.error || "Código inválido. Verifique se é um Pix copia-e-cola ou linha digitável de boleto."}
          </div>
        )}
      </div>

      {/* Valor manual — só exibe se Pix genuinamente sem valor (amountLocked=false) */}
      {needsOverride && !(validated as any)?.amountLocked && (
        <div style={{ marginBottom: 16 }}>
          {/* Explicação — normal para Meta e Google */}
          <div style={{ background: "rgba(255,159,10,.07)", border: "1px solid rgba(255,159,10,.25)", borderRadius: 12, padding: "12px 16px", marginBottom: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>ℹ️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#d97706", marginBottom: 4 }}>
                Pix de valor aberto — isso é normal para Meta e Google Ads
              </div>
              <div style={{ fontSize: 12, color: "#92400e", lineHeight: 1.6 }}>
                A Meta Ads e o Google Ads geram Pix <strong>sem valor fixo no código</strong> por padrão. O valor que você quer pagar deve ser informado manualmente — use exatamente o valor que aparece no portal da plataforma antes de gerar o código.
              </div>
            </div>
          </div>

          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 8 }}>
            3. Qual valor deseja pagar?
          </label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, fontWeight: 800, color: "var(--muted)" }}>R$</span>
            <input
              type="number"
              value={override}
              onChange={e => setOverride(e.target.value)}
              placeholder="0,00"
              step="0.01"
              min="1"
              style={{ width: "100%", padding: "13px 14px 13px 44px", borderRadius: 11, border: `1.5px solid ${override && parseFloat(override.replace(",",".")) > 0 ? "rgba(48,209,88,.5)" : "var(--border)"}`, fontSize: 20, fontWeight: 900, fontFamily: "var(--font)", boxSizing: "border-box", outline: "none" }}
            />
          </div>
          {override && parseFloat(override.replace(",",".")) > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--green-d)", fontWeight: 700 }}>
              ✅ Valor confirmado: R$ {parseFloat(override.replace(",",".")).toFixed(2)}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
            💡 Confira o valor exato no painel da {platform === "meta" ? "Meta Business Suite → Faturamento" : platform === "google" ? "Google Ads → Faturamento e pagamentos" : platform === "tiktok" ? "TikTok Ads Manager → Pagamentos" : "plataforma"} antes de confirmar.
          </div>
        </div>
      )}

      {/* Notas */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 6 }}>
          {needsOverride ? "4." : "3."} Descrição <span style={{ fontWeight: 400, textTransform: "none" }}>(opcional)</span>
        </label>
        <input value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Ex: Recarga Meta Ads — campanha de verão" maxLength={200}
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--border)", fontSize: 13, fontFamily: "var(--font)", boxSizing: "border-box" }} />
      </div>

      {/* CTA */}
      <button
        onClick={() => setStep("confirm")}
        disabled={!validated?.valid || !hasEnough || (needsOverride && !parseFloat(override.replace(",", ".")))}
        style={{ ...primaryBtn("linear-gradient(135deg,#af52de,#6d2b9f)"), opacity: (!validated?.valid || !hasEnough || (needsOverride && !parseFloat(override.replace(",", ".")))) ? 0.45 : 1 }}>
        {!validated?.valid
          ? "Cole ou escaneie um código válido"
          : !hasEnough
            ? `⚠️ Saldo insuficiente — falta R$ ${Math.max(0, finalAmount - walletBalance).toFixed(2)}`
            : `Revisar pagamento · R$ ${finalAmount.toFixed(2)} →`}
      </button>

      {/* Formatos aceitos */}
      <div style={{ marginTop: 16, background: "var(--off)", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>Formatos aceitos</div>
        {[
          { icon: "📱", t: "Pix copia-e-cola",       d: 'Começa com "00020126..." — copie no app da plataforma de anúncios' },
          { icon: "📄", t: "Linha digitável boleto",  d: "47 ou 48 dígitos — disponível no boleto bancário gerado" },
          { icon: "📷", t: "QR Code",                 d: "Escaneie com a câmera do dispositivo — Pix ou boleto" },
        ].map(f => (
          <div key={f.t} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{f.icon}</span>
            <div style={{ fontSize: 12 }}>
              <strong style={{ color: "var(--dark)" }}>{f.t}</strong>
              <span style={{ color: "var(--muted)" }}> — {f.d}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// Helper para rows de revisão
function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>{label}</span>
      <span style={{ fontSize: bold ? 16 : 13, fontWeight: bold ? 900 : 700, color: color || "var(--dark)" }}>{value}</span>
    </div>
  );
}

function TabBuyCredits({ balance, platBal, onBack }: { balance: any; platBal?: any; onBack: () => void }) {
  const walletBalance = (balance as any)?.balance ?? 0;

  const [amounts,   setAmounts]   = useState<Record<string, string>>({ meta: "", google: "", tiktok: "" });
  const [campaigns, setCampaigns] = useState<Record<string, string>>({ meta: "", google: "", tiktok: "" });
  const [result,    setResult]    = useState<any>(null);

  // Busca campanhas ativas de todas as plataformas
  const { data: platformCamps, isLoading: loadingCamps } =
    (trpc as any).mediaBudget?.fetchActiveCampaigns?.useQuery?.() ?? { data: null, isLoading: false };

  const metaCamps   = platformCamps?.meta   ?? [];
  const googleCamps = platformCamps?.google ?? [];
  const tiktokCamps = platformCamps?.tiktok ?? [];

  // Quando o usuário seleciona uma campanha, preenche o campo de ID
  const selectCampaign = (plat: string, id: string) => {
    setCampaigns(v => ({ ...v, [plat]: id }));
  };

  const PLAT_CFG = [
    { key: "meta",   label: "Meta Ads",   icon: "📘", color: "#1877f2", bg: "rgba(24,119,242,0.08)"  },
    { key: "google", label: "Google Ads", icon: "🔵", color: "#1a73e8", bg: "rgba(26,115,232,0.08)"  },
    { key: "tiktok", label: "TikTok Ads", icon: "◼",  color: "#111",    bg: "rgba(0,0,0,0.05)"       },
  ];

  const total = PLAT_CFG.reduce((sum, p) => sum + (parseFloat(amounts[p.key]) || 0), 0);
  const hasEnough = walletBalance >= total && total > 0;

  const applyMut = (trpc as any).mediaBudget?.applyDistribution?.useMutation?.({
    onSuccess: (data: any) => {
      setResult(data);
      if (data.applied?.length) toast.success(`◎ ${data.applied.length} campanha(s) atualizada(s)!`);
      if (data.failed?.length)  toast.error(`◬ ${data.failed.length} falha(s). Verifique as integrações.`);
    },
    onError: (e: any) => toast.error(e.message),
  }) ?? { mutate: () => {}, isPending: false };

  const handleBuy = () => {
    const items = PLAT_CFG
      .filter(p => parseFloat(amounts[p.key]) > 0 && campaigns[p.key])
      .map(p => ({
        platform:   p.key as "meta" | "google" | "tiktok",
        campaignId: campaigns[p.key],
        amount:     parseFloat(amounts[p.key]),
      }));

    if (!items.length) {
      toast.error("Informe o valor e o ID da campanha para pelo menos uma plataforma.");
      return;
    }

    applyMut.mutate({ items, totalAmount: total, deductFromBalance: true });
  };

  return (
    <div>
      <SectionHeader icon="◆" color="#30d158" title="Comprar Créditos"
        sub="Use seu saldo MECPro para adicionar verba nas campanhas" onBack={onBack} />

      {/* Saldo disponível */}
      <InfoCard color="#30d158">
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
          Saldo disponível na wallet
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, color: "#30d158", letterSpacing: "-0.05em" }}>
          {R(walletBalance)}
        </div>
        {walletBalance <= 0 && (
          <div style={{ fontSize: 12, color: "var(--red)", marginTop: 6, fontWeight: 600 }}>
            ◬ Saldo insuficiente — deposite primeiro na aba Depositar
          </div>
        )}
      </InfoCard>

      {/* Explicação rápida */}
      <div style={{ background: "var(--blue-l)", border: "1px solid rgba(0,113,227,0.2)", borderRadius: "var(--r-sm)", padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--blue)" }}>
        ◉ Informe o valor e o ID da campanha em cada plataforma. O sistema atualiza o orçamento diário via API e debita seu saldo automaticamente.
      </div>

      {/* Cards por plataforma */}
      {PLAT_CFG.map(p => {
        const pd = (platBal as any)?.[p.key];
        const platBalance = p.key === "google"
          ? null  // Google não expõe saldo
          : pd?.balance ?? null;
        const platAlert = pd?.alert;

        return (
        <div key={p.key} style={{ ...{ background: "var(--glass-bg)", backdropFilter: "var(--glass-blur)", border: `1px solid ${platAlert === "critical" ? "rgba(255,59,48,0.3)" : platAlert === "warning" ? "rgba(255,159,10,0.25)" : "var(--glass-border)"}`, borderRadius: "var(--r)", padding: 18, marginBottom: 12, boxShadow: "var(--shadow-xs)" } }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: platBalance !== null || p.key === "google" ? 8 : 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: p.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
              {p.icon}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: p.color }}>{p.label}</div>
            {pd?.connected && platBalance !== null && (
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: (pd?.displayBalance ?? platBalance) > 0 ? "var(--dark)" : "var(--red)" }}>
                  {R(pd?.displayBalance ?? platBalance)}
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase" }}>
                  {pd?.hasDebt ? "crédito" : "saldo"}
                </div>
                {pd?.hasDebt && <div style={{ fontSize: 9, color: "var(--orange)" }}>débito {R(pd.debtAmount)}</div>}
              </div>
            )}
            {p.key === "google" && pd?.connected && (
              <div style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)", textAlign: "right" }}>
                pós-pago<br/>{R(pd?.spentThisMonth)} mês
              </div>
            )}
          </div>
          {platAlert === "critical" && (
            <div style={{ fontSize: 11, color: "var(--red)", fontWeight: 600, marginBottom: 10, padding: "6px 10px", background: "rgba(255,59,48,0.06)", borderRadius: 6 }}>
              ◬ Saldo crítico — recarregue antes de comprar créditos
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {/* Valor */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>
                Valor (R$/dia)
              </label>
              <input
                type="number"
                placeholder="Ex: 50"
                value={amounts[p.key]}
                onChange={e => setAmounts(v => ({ ...v, [p.key]: e.target.value }))}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 9, border: "1.5px solid var(--border)", fontSize: 16, fontWeight: 700, fontFamily: "var(--font)", boxSizing: "border-box" }}
              />
            </div>

            {/* Seletor de campanha */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>
                Campanha
              </label>
              {loadingCamps ? (
                <div style={{ padding: "10px 14px", borderRadius: 9, border: "1.5px solid var(--border)", fontSize: 12, color: "var(--muted)" }}>Carregando...</div>
              ) : (p.key === "meta" ? metaCamps : p.key === "google" ? googleCamps : tiktokCamps).length > 0 ? (
                <select
                  value={campaigns[p.key]}
                  onChange={e => selectCampaign(p.key, e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 9, border: "1.5px solid var(--border)", fontSize: 13, fontFamily: "var(--font)", boxSizing: "border-box", background: "white", cursor: "pointer" }}>
                  <option value="">-- Selecionar campanha --</option>
                  {(p.key === "meta" ? metaCamps : p.key === "google" ? googleCamps : tiktokCamps).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.status === "ACTIVE" || c.status === "ENABLED" ? "◎" : "◷"} {c.budget ? `· R$${c.budget.toFixed(0)}/dia` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="ID da campanha (conta não conectada)"
                  value={campaigns[p.key]}
                  onChange={e => setCampaigns(v => ({ ...v, [p.key]: e.target.value }))}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 9, border: "1.5px solid var(--border)", fontSize: 13, fontFamily: "var(--font)", boxSizing: "border-box" }}
                />
              )}
            </div>
          </div>

          {amounts[p.key] && !campaigns[p.key] && (
            <div style={{ fontSize: 11, color: "var(--orange)", marginTop: 6 }}>◬ Informe o ID da campanha</div>
          )}
        </div>
        );
      })}

      {/* Resumo */}
      {total > 0 && (
        <div style={{ background: "var(--off)", borderRadius: "var(--r-sm)", padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total a debitar</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: hasEnough ? "var(--dark)" : "var(--red)", letterSpacing: "-0.04em" }}>{R(total)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Saldo após</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: hasEnough ? "var(--green-d)" : "var(--red)" }}>
              {hasEnough ? R(walletBalance - total) : "Insuficiente"}
            </div>
          </div>
        </div>
      )}

      {/* Botão comprar */}
      <button
        onClick={handleBuy}
        disabled={!hasEnough || applyMut.isPending}
        style={{ ...primaryBtn(hasEnough ? "linear-gradient(135deg,#30d158,#248a3d)" : "#aaa"), opacity: (!hasEnough || applyMut.isPending) ? 0.6 : 1 }}>
        {applyMut.isPending ? "Processando..." : hasEnough ? `◎ Comprar créditos — ${R(total)}` : "Saldo insuficiente"}
      </button>

      {/* Resultado */}
      {result && (
        <div style={{ marginTop: 16 }}>
          {result.applied?.length > 0 && (
            <div style={{ background: "rgba(48,209,88,0.08)", border: "1.5px solid rgba(48,209,88,0.3)", borderRadius: "var(--r)", padding: "16px 18px", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--green-d)", marginBottom: 12 }}>
                ◎ Orçamento atualizado com sucesso
              </div>
              {result.applied.map((a: any, i: number) => {
                const LINKS: Record<string, string> = {
                  meta:   "https://www.facebook.com/adsmanager/manage/campaigns",
                  google: "https://ads.google.com/aw/campaigns",
                  tiktok: "https://ads.tiktok.com/i18n/dashboard",
                };
                return (
                  <div key={i} style={{ background: "white", borderRadius: "var(--r-sm)", padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 20, flexShrink: 0 }}>
                      {a.platform === "meta" ? "📘" : a.platform === "google" ? "🔵" : "◼"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dark)" }}>
                        {a.platform?.toUpperCase()} — R$ {a.amount?.toFixed(2)}/dia aplicado
                      </div>
                      {a.adsetName && (
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                          Ad Set: {a.adsetName}
                        </div>
                      )}
                    </div>
                    <a href={LINKS[a.platform]} target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, fontWeight: 700, color: "var(--blue)", textDecoration: "none", flexShrink: 0, padding: "4px 10px", border: "1px solid var(--blue)", borderRadius: 6 }}>
                      Verificar →
                    </a>
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                O orçamento foi atualizado via API. Pode levar alguns minutos para refletir no painel da plataforma.
              </div>
            </div>
          )}
          {result.failed?.length > 0 && (
            <div style={{ background: "rgba(255,59,48,0.06)", border: "1.5px solid rgba(255,59,48,0.2)", borderRadius: "var(--r)", padding: "16px 18px" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--red)", marginBottom: 10 }}>◬ Falha ao atualizar</div>
              {result.failed.map((f: any, i: number) => (
                <div key={i} style={{ fontSize: 12, color: "var(--body)", marginBottom: 6, padding: "8px 12px", background: "white", borderRadius: "var(--r-sm)" }}>
                  <span style={{ fontWeight: 700 }}>{f.platform?.toUpperCase()}</span>
                  <span style={{ color: "var(--muted)", marginLeft: 6 }}>{f.error}</span>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    Verifique se a conta está conectada em Configurações → Integrações
                  </div>
                </div>
              ))}
            </div>
          )}
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
    onSuccess: (data: any) => {
      const coins = Math.floor(data.credited / 19);
      toast.success(
        coins > 0
          ? `◎ ${R(data.credited)} creditados na Wallet · +${coins} MecCoins 🪙`
          : `◎ ${R(data.credited)} creditados na Wallet!`
      );
    },
    onError: (e: any) => toast.error(e.message),
  }) ?? { mutate: () => {}, isPending: false };

  return (
    <div>
      <SectionHeader icon="◍" color="#ff9f0a" title="Transferir via MecBank"
        sub="Envie saldo do MecBank para sua conta bancária cadastrada" onBack={onBack} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Form */}
        <div>
          <InfoCard color="#ff9f0a">
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Saldo MecBank</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#ff9f0a", letterSpacing: "-0.04em" }}>{R(asaas?.balance ?? 0)}</div>

            {/* Breakdown: confirmado vs aguardando */}
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {/* Confirmado — pode transferir */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: (asaas?.confirmedBalance ?? 0) > 0 ? "rgba(48,209,88,.12)" : "rgba(255,255,255,.04)", border: `1px solid ${(asaas?.confirmedBalance ?? 0) > 0 ? "rgba(48,209,88,.3)" : "rgba(255,255,255,.1)"}`, borderRadius: 8, padding: "7px 10px" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: (asaas?.confirmedBalance ?? 0) > 0 ? "#30d158" : "var(--muted)" }}>
                    {(asaas?.confirmedBalance ?? 0) > 0 ? "✅ Confirmado no MecBank" : "⏳ Aguardando confirmação"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                    {(asaas?.confirmedBalance ?? 0) > 0
                      ? `${asaas.confirmedCount} Pix confirmado(s) — disponível para wallet`
                      : `${asaas?.pendingCount ?? 0} Pix aguardando pagamento`}
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, color: (asaas?.confirmedBalance ?? 0) > 0 ? "#30d158" : "var(--muted)" }}>
                  {R(asaas?.confirmedBalance ?? 0)}
                </div>
              </div>

              {/* Pendente — não pode transferir ainda */}
              {(asaas?.pendingCount ?? 0) > (asaas?.confirmedCount ?? 0) && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,159,10,.06)", border: "1px solid rgba(255,159,10,.2)", borderRadius: 8, padding: "7px 10px" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#ff9f0a" }}>⏳ Pix não pago ainda</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>Pague o Pix para liberar para a wallet</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#ff9f0a" }}>
                    {R((asaas?.balanceNet ?? asaas?.balance ?? 0) - (asaas?.confirmedBalance ?? 0))}
                  </div>
                </div>
              )}
            </div>

            {/* Botão transferir para wallet — só habilitado se há saldo confirmado */}
            {(asaas?.confirmedBalance ?? 0) > 0 ? (
              <div style={{ marginTop: 10 }}>
                {/* Preview de MecCoins que serão recebidos */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(48,209,88,.08)", border: "1px solid rgba(48,209,88,.2)", borderRadius: 10, padding: "9px 12px", marginBottom: 8 }}>
                  <img src="/logo-512.png" alt="MecCoin" style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#30d158" }}>
                      Você receberá <strong>+{Math.floor((asaas?.confirmedBalance ?? 0) / 19)} MecCoins 🪙</strong>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
                      {R(asaas?.confirmedBalance ?? 0)} confirmados · 1 MecCoin = R$ 19,00
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => syncMutation.mutate({ amountReais: asaas?.confirmedBalance })}
                  disabled={syncMutation.isPending}
                  style={{ width: "100%", background: "linear-gradient(135deg,#30d158,#15803d)", color: "white", fontWeight: 800, fontSize: 14, opacity: syncMutation.isPending ? 0.7 : 1, border: "none", borderRadius: 10, padding: "12px", cursor: syncMutation.isPending ? "not-allowed" : "pointer", fontFamily: "var(--font)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {syncMutation.isPending ? (
                    "⏳ Transferindo..."
                  ) : (
                    <>
                      💰 Transferir {R(asaas?.confirmedBalance ?? 0)} para Wallet
                      <span style={{ background: "rgba(0,0,0,.2)", borderRadius: 99, fontSize: 11, padding: "2px 8px" }}>
                        +{Math.floor((asaas?.confirmedBalance ?? 0) / 19)} 🪙
                      </span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 10, padding: "9px 12px", background: "rgba(255,255,255,.04)", borderRadius: 8, fontSize: 11, color: "var(--muted)", lineHeight: 1.5, textAlign: "center" }}>
                Pague o Pix gerado para liberar a transferência para a wallet
              </div>
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
            { icon: "🔒", label: "Segurança", value: "Transferência via MecBank certificado" },
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


// ── TabHistory: histórico completo com status compensado/pendente ─────────────
function TabHistory({ balance, summary, asaas, onBack }: { balance: any; summary: any; asaas: any; onBack: () => void }) {
  const walletBal   = (balance as any)?.balance     ?? 0;
  const mecBankBal  = (asaas  as any)?.balance      ?? 0;
  const confirmed   = (asaas  as any)?.confirmedBalance ?? 0;
  const pending     = mecBankBal - confirmed;
  const movements   = (summary as any)?.recentMovements ?? [];

  const TYPE_MAP: Record<string, { label: string; icon: string; color: string }> = {
    deposit:      { label: "Depósito Pix",         icon: "📥", color: "#0071e3" },
    promo_credit: { label: "Crédito Plano Anual",  icon: "🎁", color: "#16a34a" },
    fee:          { label: "Taxa de serviço",       icon: "🏷️", color: "#9ca3af" },
    ad_spend:     { label: "Verba de campanha",     icon: "📢", color: "#af52de" },
    transfer:     { label: "Transferência",         icon: "🔄", color: "#ff9f0a" },
    refund:       { label: "Estorno",               icon: "↩️", color: "#30d158" },
  };

  return (
    <div>
      <SectionHeader icon="📋" color="#6b7280" title="Histórico Financeiro"
        sub="Veja o status de cada movimentação — compensado ou pendente" onBack={onBack} />

      {/* Cards de status */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
        {/* Wallet */}
        <div style={{ background: "rgba(48,209,88,.06)", border: "1.5px solid rgba(48,209,88,.25)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>💳</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: ".06em" }}>Wallet</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#16a34a", letterSpacing: "-.04em" }}>{R(walletBal)}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>✅ Compensado — disponível para campanhas</div>
        </div>

        {/* MecBank confirmado */}
        <div style={{ background: confirmed > 0 ? "rgba(48,209,88,.06)" : "rgba(255,255,255,.02)", border: `1.5px solid ${confirmed > 0 ? "rgba(48,209,88,.25)" : "var(--border)"}`, borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>🏦</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: confirmed > 0 ? "#16a34a" : "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>MecBank — Confirmado</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: confirmed > 0 ? "#16a34a" : "var(--muted)", letterSpacing: "-.04em" }}>{R(confirmed)}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            {confirmed > 0 ? "✅ Pago e confirmado — transfira para Wallet" : "Nenhum Pix confirmado"}
          </div>
        </div>

        {/* MecBank pendente */}
        <div style={{ background: pending > 0 ? "rgba(255,159,10,.06)" : "rgba(255,255,255,.02)", border: `1.5px solid ${pending > 0 ? "rgba(255,159,10,.3)" : "var(--border)"}`, borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>⏳</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: pending > 0 ? "#ff9f0a" : "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>MecBank — Pendente</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: pending > 0 ? "#ff9f0a" : "var(--muted)", letterSpacing: "-.04em" }}>{R(pending)}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            {pending > 0 ? "⏳ Aguardando pagamento do Pix" : "Sem pendências"}
          </div>
        </div>

        {/* MecCoins */}
        <div style={{ background: "linear-gradient(135deg,#0a1a0e,#0d2212)", border: "1.5px solid rgba(48,209,88,.2)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <img src="/logo-512.png" alt="MecCoin" style={{ width: 20, height: 20, borderRadius: 4 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#86efac", textTransform: "uppercase", letterSpacing: ".06em" }}>MecCoins</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#30d158", letterSpacing: "-.04em" }}>{Math.floor(walletBal / 19)} 🪙</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 4 }}>1 MecCoin = R$ 19,00</div>
        </div>
      </div>

      {/* Legenda de status */}
      <div style={{ background: "var(--off)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Legenda:</div>
        {[
          { icon: "✅", label: "Compensado",    desc: "Pix confirmado e saldo disponível"     },
          { icon: "⏳", label: "Pendente",      desc: "Aguardando pagamento do Pix"           },
          { icon: "❌", label: "Cancelado",     desc: "Pix expirado ou cancelado"            },
          { icon: "🔄", label: "Em processamento", desc: "Sendo verificado pelo MecBank"     },
        ].map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>{s.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--dark)" }}>{s.label}</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>— {s.desc}</span>
          </div>
        ))}
      </div>

      {/* Movimentações recentes */}
      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--dark)" }}>Últimas movimentações</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>{movements.length} registros</div>
        </div>

        {movements.length === 0 ? (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            Nenhuma movimentação registrada ainda
          </div>
        ) : (
          movements.map((m: any, i: number) => {
            const meta = TYPE_MAP[m.type] ?? { label: m.type, icon: "◦", color: "var(--muted)" };
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderBottom: i < movements.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: meta.color + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                  {meta.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dark)", marginBottom: 2 }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {new Date(m.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {m.platform && ` · ${m.platform.toUpperCase()}`}
                    {m.campaignName && ` · ${m.campaignName}`}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: m.direction === "credit" ? "#16a34a" : "var(--red)" }}>
                    {m.direction === "credit" ? "+" : "−"}{R(m.amount)}
                  </div>
                  <div style={{ fontSize: 10, marginTop: 2 }}>
                    <span style={{ padding: "1px 7px", borderRadius: 99, fontWeight: 700,
                      background: m.direction === "credit" ? "rgba(22,163,74,.1)" : "rgba(239,68,68,.08)",
                      color:      m.direction === "credit" ? "#16a34a"           : "#dc2626" }}>
                      ✅ Compensado
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Depósitos pendentes no MecBank */}
      {(asaas?.pendingCount ?? 0) > 0 && (
        <div style={{ marginTop: 16, background: "rgba(255,159,10,.05)", border: "1.5px solid rgba(255,159,10,.25)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#d97706", marginBottom: 12 }}>
            ⏳ Pix aguardando pagamento ({asaas.pendingCount})
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
            Você tem <strong>{asaas.pendingCount} Pix</strong> gerado(s) ainda não pago(s).
            O saldo total é de <strong style={{ color: "#ff9f0a" }}>{R(asaas.balance)}</strong>.
            {(asaas.confirmedBalance ?? 0) > 0
              ? <> <strong style={{ color: "#16a34a" }}>{R(asaas.confirmedBalance)}</strong> já foi confirmado e pode ser transferido para a Wallet.</>
              : " Pague o Pix para que o saldo seja creditado automaticamente em até 15 minutos."
            }
          </div>
        </div>
      )}
    </div>
  );
}

export default function Financeiro() {
  const [tab, setTab] = useState(0);

  const { data: balance } = (trpc as any).mediaBudget?.getBalance?.useQuery?.()       ?? {};
  const { data: ps, isLoading: psLoading } = (trpc as any).mediaBudget?.getSettings?.useQuery?.() ?? { data: null, isLoading: false };
  const { data: asaas }   = (trpc as any).mediaBudget?.asaasBalance?.useQuery?.()     ?? {};
  const { data: platBal } = (trpc as any).mediaBudget?.platformBalances?.useQuery?.() ?? {};
  const { data: summary } = (trpc as any).mediaBudget?.financialSummary?.useQuery?.() ?? {};

  const feePercent = (ps as any)?.feePercent ?? 10;
  const isFirst = tab === 0;
  const isLast  = tab === TABS.length - 1;

  // ── MecCoins: 1 MecCoin = R$ 19 ──────────────────────────────────────────
  const MECCOIN_VALUE = 19; // R$ por MecCoin
  const walletBalance = (balance as any)?.balance ?? 0;
  const mecCoins = Math.floor(walletBalance / MECCOIN_VALUE);
  const mecCoinsValue = mecCoins * MECCOIN_VALUE;

  const KPIS = [
    { label: "Saldo wallet",  value: R((balance as any)?.balance),         icon: "◈", color: "#30d158" },
    { label: "Saldo MecBank", value: (asaas as any)?.confirmedBalance > 0 ? R((asaas as any).confirmedBalance) : R((asaas as any)?.balance ?? 0), icon: "🏦", color: (asaas as any)?.confirmedBalance > 0 ? "#30d158" : "#0071e3" },
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

        {/* ── MecCoins ── */}
        {walletBalance > 0 && (
          <div style={{ marginBottom: 22, background: "linear-gradient(135deg,#0a1a0e,#0d2212)", border: "1.5px solid rgba(48,209,88,.3)", borderRadius: 16, padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
            {/* Ícone + título */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(48,209,88,.12)", border: "1.5px solid rgba(48,209,88,.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <img src="/logo-512.png" alt="MecCoin" style={{ width: 34, height: 34, borderRadius: 8 }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginBottom: 2 }}>
                  Seu saldo equivale a{" "}
                  <span style={{ color: "#30d158", fontSize: 18, fontWeight: 900 }}>{mecCoins} MecCoins</span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", lineHeight: 1.5 }}>
                  1 MecCoin = R$ {MECCOIN_VALUE},00 · {mecCoins} moedas × R$ {MECCOIN_VALUE} = {R(mecCoinsValue)} em campanhas
                </div>
              </div>
            </div>

            {/* Legenda de valor */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { coins: 10,  label: "Campanha pequena",  val: 10  * MECCOIN_VALUE },
                { coins: 50,  label: "Campanha média",    val: 50  * MECCOIN_VALUE },
                { coins: 100, label: "Campanha completa", val: 100 * MECCOIN_VALUE },
              ].map(tier => (
                <div key={tier.coins} style={{
                  background: mecCoins >= tier.coins ? "rgba(48,209,88,.15)" : "rgba(255,255,255,.04)",
                  border: `1px solid ${mecCoins >= tier.coins ? "rgba(48,209,88,.4)" : "rgba(255,255,255,.08)"}`,
                  borderRadius: 10, padding: "8px 12px", textAlign: "center", minWidth: 90,
                }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: mecCoins >= tier.coins ? "#30d158" : "#4b5563" }}>
                    {tier.coins} 🪙
                  </div>
                  <div style={{ fontSize: 10, color: mecCoins >= tier.coins ? "#86efac" : "#4b5563", marginTop: 2 }}>
                    {tier.label}
                  </div>
                  <div style={{ fontSize: 10, color: mecCoins >= tier.coins ? "#4ade80" : "#374151", fontWeight: 700, marginTop: 1 }}>
                    {R(tier.val)}
                  </div>
                </div>
              ))}
            </div>

            {/* Barra de progresso até próximo marco */}
            {mecCoins < 100 && (
              <div style={{ width: "100%", marginTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,.35)", marginBottom: 5 }}>
                  <span>{mecCoins} MecCoins</span>
                  <span>Meta: 100 MecCoins ({R(100 * MECCOIN_VALUE)})</span>
                </div>
                <div style={{ background: "rgba(255,255,255,.06)", borderRadius: 99, height: 6, overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.min(100, Math.round(mecCoins / 100 * 100))}%`,
                    height: "100%", borderRadius: 99,
                    background: "linear-gradient(90deg,#30d158,#4ade80)",
                    transition: "width .8s ease",
                  }} />
                </div>
              </div>
            )}
          </div>
        )}

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
                <SectionHeader icon="▣" color="#0071e3" title="Visão Geral" sub="Seu painel financeiro completo — compensado e pendente" />

                {/* ── CARDS DE STATUS ───────────────────────────────────────── */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:12, marginBottom:20 }}>

                  {/* Wallet — compensado */}
                  <div style={{ background:"rgba(48,209,88,.06)", border:"1.5px solid rgba(48,209,88,.25)", borderRadius:14, padding:"16px 18px" }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:".06em", marginBottom:6 }}>💳 Wallet</div>
                    <div style={{ fontSize:26, fontWeight:900, color:"#16a34a", letterSpacing:"-.04em" }}>{R((balance as any)?.balance ?? 0)}</div>
                    <div style={{ fontSize:11, color:"var(--muted)", marginTop:4, lineHeight:1.4 }}>✅ <strong>Compensado</strong> · disponível para campanhas</div>
                    {((balance as any)?.balance ?? 0) >= 19 && (
                      <div style={{ marginTop:6, fontSize:11, color:"#16a34a", fontWeight:700 }}>
                        🪙 {Math.floor(((balance as any)?.balance ?? 0) / 19)} MecCoins disponíveis
                      </div>
                    )}
                  </div>

                  {/* MecBank confirmado */}
                  <div style={{ background:(asaas as any)?.confirmedBalance > 0 ? "rgba(0,113,227,.06)" : "var(--off)", border:`1.5px solid ${(asaas as any)?.confirmedBalance > 0 ? "rgba(0,113,227,.3)" : "var(--border)"}`, borderRadius:14, padding:"16px 18px" }}>
                    <div style={{ fontSize:10, fontWeight:700, color:(asaas as any)?.confirmedBalance > 0 ? "#0071e3" : "var(--muted)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:6 }}>🏦 MecBank — Confirmado</div>
                    <div style={{ fontSize:26, fontWeight:900, color:(asaas as any)?.confirmedBalance > 0 ? "#0071e3" : "var(--muted)", letterSpacing:"-.04em" }}>{R((asaas as any)?.confirmedBalance ?? 0)}</div>
                    <div style={{ fontSize:11, color:"var(--muted)", marginTop:4, lineHeight:1.4 }}>
                      {(asaas as any)?.confirmedBalance > 0
                        ? <><strong style={{color:"#0071e3"}}>✅ Pago</strong> · transfira para a Wallet</>
                        : "Nenhum Pix confirmado ainda"}
                    </div>
                    {(asaas as any)?.confirmedBalance > 0 && (
                      <button onClick={() => setTab(2)} style={{ marginTop:8, width:"100%", background:"#0071e3", color:"#fff", fontWeight:800, fontSize:11, padding:"7px 10px", borderRadius:7, border:"none", cursor:"pointer", fontFamily:"var(--font)" }}>
                        Transferir para Wallet →
                      </button>
                    )}
                  </div>

                  {/* MecBank pendente */}
                  {(((asaas as any)?.balance ?? 0) - ((asaas as any)?.confirmedBalance ?? 0)) > 0 && (
                    <div style={{ background:"rgba(255,159,10,.05)", border:"1.5px solid rgba(255,159,10,.25)", borderRadius:14, padding:"16px 18px" }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"#d97706", textTransform:"uppercase", letterSpacing:".06em", marginBottom:6 }}>⏳ MecBank — Pendente</div>
                      <div style={{ fontSize:26, fontWeight:900, color:"#d97706", letterSpacing:"-.04em" }}>{R(((asaas as any)?.balance ?? 0) - ((asaas as any)?.confirmedBalance ?? 0))}</div>
                      <div style={{ fontSize:11, color:"var(--muted)", marginTop:4, lineHeight:1.4 }}>⏳ <strong>Aguardando</strong> pagamento do Pix</div>
                    </div>
                  )}

                  {/* Gasto hoje */}
                  <div style={{ ...glass, padding:"16px 18px" }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"#ff9f0a", textTransform:"uppercase", letterSpacing:".06em", marginBottom:6 }}>▣ Gasto hoje</div>
                    <div style={{ fontSize:26, fontWeight:900, color:"var(--dark)", letterSpacing:"-.04em" }}>{R((summary as any)?.totalSpendToday ?? 0)}</div>
                    <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>Mês: {R((summary as any)?.totalSpendMonth ?? 0)}</div>
                  </div>
                </div>

                {/* ── MOVIMENTAÇÕES + PLATAFORMAS ──────────────────────────── */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:14, marginBottom:20 }}>

                  {/* Últimas movimentações */}
                  <div style={{ background:"var(--off)", borderRadius:12, overflow:"hidden" }}>
                    <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:12, fontWeight:700 }}>Últimas movimentações</span>
                      <button onClick={() => setTab(6)} style={{ fontSize:10, color:"#0071e3", fontWeight:700, background:"none", border:"none", cursor:"pointer", fontFamily:"var(--font)" }}>Ver tudo →</button>
                    </div>
                    {(summary as any)?.recentMovements?.slice(0, 5).map((m: any, i: number) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 16px", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
                        <span style={{ fontSize:16 }}>{m.type==="promo_credit"?"🎁":m.type==="deposit"?"📥":m.type==="fee"?"🏷️":m.type==="transfer"?"🔄":"📢"}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {m.type==="promo_credit"?"Crédito Plano Anual":m.type==="deposit"?"Depósito Pix":m.type==="fee"?"Taxa":m.type==="transfer"?"Transferência":m.platform||"Gasto"}
                          </div>
                          <div style={{ fontSize:10, color:"var(--muted)" }}>{new Date(m.createdAt).toLocaleDateString("pt-BR")}</div>
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div style={{ fontSize:13, fontWeight:800, color:m.direction==="credit"?"#30d158":"var(--red)" }}>
                            {m.direction==="credit"?"+":"−"}{R(m.amount)}
                          </div>
                          <div style={{ fontSize:9, fontWeight:700, color:"#16a34a" }}>✅ compensado</div>
                        </div>
                      </div>
                    ))}
                    {!(summary as any)?.recentMovements?.length && (
                      <div style={{ padding:24, textAlign:"center", color:"var(--muted)", fontSize:13 }}>Nenhuma movimentação ainda</div>
                    )}
                  </div>

                  {/* Gasto por plataforma */}
                  <div style={{ background:"var(--off)", borderRadius:12, padding:16 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"var(--dark)", marginBottom:12 }}>Gasto por plataforma</div>
                    {PLATS.map((p, i) => (
                      <div key={p.key} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom: i < PLATS.length-1 ? "1px solid var(--border)" : "none" }}>
                        <span style={{ fontSize:18 }}>{p.icon}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:p.color }}>{p.label}</div>
                          <div style={{ fontSize:10, color:"var(--muted)" }}>{R((summary as any)?.spendMonth?.[p.key])} no mês</div>
                        </div>
                        <div style={{ fontSize:14, fontWeight:900, color:"var(--dark)" }}>{R((summary as any)?.spendToday?.[p.key])}</div>
                      </div>
                    ))}
                  </div>

                  {/* Créditos de Plano Anual */}
                  {(summary as any)?.annualStats?.totalAprovados > 0 && (
                    <div style={{ background:"linear-gradient(135deg,#052e16,#14532d)", borderRadius:12, padding:"16px 20px", border:"1px solid #16a34a" }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#86efac", textTransform:"uppercase", letterSpacing:".07em", marginBottom:12 }}>🎁 Créditos Plano Anual</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                        {[
                          { v:(summary as any).annualStats.totalAprovados, l:"ativos" },
                          { v:R((summary as any).annualStats.totalCreditado), l:"creditado" },
                          { v:(summary as any).annualStats.totalPendentes, l:"aguardando", warn:(summary as any).annualStats.totalPendentes > 0 },
                        ].map((x,i) => (
                          <div key={i} style={{ textAlign:"center" }}>
                            <div style={{ fontSize:18, fontWeight:900, color: x.warn ? "#fbbf24" : "#4ade80" }}>{x.v}</div>
                            <div style={{ fontSize:10, color:"#86efac", marginTop:2 }}>{x.l}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── SALDO NAS PLATAFORMAS ─────────────────────────────────── */}
                {platBal && (
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>
                      Saldo nas plataformas de anúncios
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10 }}>
                      {[
                        { key:"meta",   label:"Meta Ads",   icon:"📘", color:"#1877f2", d:(platBal as any).meta   },
                        { key:"tiktok", label:"TikTok Ads", icon:"◼",  color:"#111",    d:(platBal as any).tiktok },
                        { key:"google", label:"Google Ads", icon:"🔵", color:"#1a73e8", d:(platBal as any).google },
                      ].map(({ key, label, icon, color, d }) => (
                        <div key={key} style={{ background:"var(--off)", borderRadius:12, padding:"12px 14px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                            <span style={{ fontSize:16 }}>{icon}</span>
                            <span style={{ fontSize:11, fontWeight:700, color }}>{label}</span>
                            {d?.alert==="critical" && <span style={{ marginLeft:"auto", fontSize:9, fontWeight:700, background:"rgba(255,59,48,0.1)", color:"var(--red)", padding:"2px 6px", borderRadius:4 }}>CRÍTICO</span>}
                            {d?.alert==="warning"  && <span style={{ marginLeft:"auto", fontSize:9, fontWeight:700, background:"rgba(255,159,10,0.1)", color:"var(--orange)", padding:"2px 6px", borderRadius:4 }}>BAIXO</span>}
                          </div>
                          {!d?.connected ? (
                            <div style={{ fontSize:11, color:"var(--muted)" }}>Conta não conectada</div>
                          ) : d?.error ? (
                            <div style={{ fontSize:11, color:"var(--red)" }}>Erro ao buscar</div>
                          ) : key==="google" ? (
                            <div>
                              <div style={{ fontSize:18, fontWeight:900, color:"var(--dark)" }}>{R(d?.spentThisMonth)}</div>
                              <div style={{ fontSize:10, color:"var(--muted)", marginTop:2 }}>gasto no mês · pós-pago</div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ fontSize:18, fontWeight:900, color:(d?.displayBalance??d?.balance)>0?"var(--dark)":"var(--red)" }}>{R(d?.displayBalance??d?.balance)}</div>
                              {d?.hasDebt && d?.debtAmount>0 && <div style={{ fontSize:10, color:"var(--orange)", marginTop:2, fontWeight:600 }}>◬ Débito: {R(d.debtAmount)}</div>}
                              {!d?.hasDebt && <div style={{ fontSize:10, color:"var(--muted)", marginTop:2 }}>{d?.daysLeft!=null?`≈ ${d.daysLeft} dias`:"disponível"}</div>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── ATALHOS ───────────────────────────────────────────────── */}
                <div style={{ fontSize:10, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>Acesso rápido</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:8 }}>
                  {TABS.slice(1).map((t, i) => (
                    <button key={t.id} onClick={() => setTab(i+1)}
                      style={{ padding:"14px 12px", borderRadius:12, border:"1.5px solid var(--border)", background:"white", cursor:"pointer", textAlign:"center", transition:"all .2s", fontFamily:"var(--font)" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor=t.color; e.currentTarget.style.boxShadow=`0 4px 14px ${t.color}28`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.boxShadow="none"; }}>
                      <div style={{ width:36, height:36, borderRadius:10, margin:"0 auto 8px", background:t.color+"14", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:t.color }}>
                        {t.icon}
                      </div>
                      <div style={{ fontSize:11, fontWeight:800, color:"var(--dark)", marginBottom:3 }}>{t.label}</div>
                      <div style={{ fontSize:10, color:"var(--muted)", lineHeight:1.4 }}>{(t as any).desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 1 && <TabDeposit balance={balance} ps={ps} psLoading={psLoading} onBack={() => setTab(0)} />}

            {tab === 2 && <TabTransfer asaas={asaas} onBack={() => setTab(0)} />}
            {tab === 3 && <TabBuyCredits balance={balance} platBal={platBal} onBack={() => setTab(0)} />}
            {tab === 4 && <TabPayCode balance={balance} onBack={() => setTab(0)} />}
            {tab === 5 && <TabCredits summary={summary} onBack={() => setTab(0)} />}
            {tab === 6 && <TabHistory balance={balance} summary={summary} asaas={asaas} onBack={() => setTab(0)} />}
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
