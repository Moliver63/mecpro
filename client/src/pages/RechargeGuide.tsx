/**
 * RechargeGuide.tsx
 *
 * Guia de compra de créditos por plataforma.
 * 
 * Fluxo:
 *   1. Cliente deposita R$ X no MECPro (Pix/Cartão)
 *   2. MECPro desconta 10% de taxa de gestão
 *   3. Sistema calcula rateio por performance
 *   4. Esta página mostra EXATAMENTE quanto comprar em cada plataforma
 *   5. Cliente clica no link → vai direto para recarga da plataforma
 *   6. Confirma que comprou → MECPro debita da wallet e libera campanhas
 */

import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const R = (v?: number | null) =>
  v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PLATFORM_META = {
  label: "Meta Ads", icon: "📘", color: "#1877f2", bg: "#eff6ff",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Meta_Platforms_Inc._logo.svg/240px-Meta_Platforms_Inc._logo.svg.png",
};
const PLATFORM_GOOGLE = {
  label: "Google Ads", icon: "🔵", color: "#1a73e8", bg: "#f0f9ff",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_2015_logo.svg/240px-Google_2015_logo.svg.png",
};
const PLATFORM_TIKTOK = {
  label: "TikTok Ads", icon: "⬛", color: "#010101", bg: "#f8f8f8",
  logo: "https://upload.wikimedia.org/wikipedia/en/thumb/a/a9/TikTok_logo.svg/240px-TikTok_logo.svg.png",
};

const PLATFORMS: Record<string, typeof PLATFORM_META> = {
  meta: PLATFORM_META, google: PLATFORM_GOOGLE, tiktok: PLATFORM_TIKTOK,
};

type Platform = "meta" | "google" | "tiktok";

interface GuideItem {
  platform:    Platform;
  amount:      number;
  amountFmt:   string;
  rechargeUrl: string;
  steps:       string[];
  notes:       string;
  completed:   boolean;
}

export default function RechargeGuide() {
  // Verifica se Modo B está habilitado pelo admin
  const { data: ps } = (trpc as any).admin?.getPaymentSettings?.useQuery?.() ?? { data: null };
  const [amount,    setAmount]    = useState("");
  const [guide,     setGuide]     = useState<any>(null);
  const [completed, setCompleted] = useState<Set<Platform>>(new Set());
  const [loading,   setLoading]   = useState(false);
  const [step,      setStep]      = useState<"input"|"guide"|"done">("input");

  const parsedAmount = parseFloat(amount.replace(",", ".")) || 0;

  if (ps && !ps.modeGuide) {
    return (
      <Layout>
        <div style={{ maxWidth: 600, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Modo indisponível</h2>
          <p style={{ color: "#64748b", fontSize: 14 }}>
            O guia de compra está temporariamente desativado pelo administrador.<br />
            Use a <a href="/media-budget" style={{ color: "#0071e3" }}>Wallet de Mídia</a> para investir.
          </p>
        </div>
      </Layout>
    );
  }
  const feeAmount    = parsedAmount * 0.1;
  const netAmount    = parsedAmount - feeAmount;

  // Saldo disponível
  const { data: balance, refetch: refetchBalance } =
    (trpc as any).mediaBudget?.getBalance?.useQuery?.() ?? { data: null };

  // Rateio calculado
  const { data: recharge } =
    (trpc as any).mediaBudget?.rechargeNeeded?.useQuery?.() ?? { data: null };

  const guideMut = (trpc as any).mediaBudget?.generateRechargeGuide?.useMutation?.({
    onSuccess: (data: any) => {
      setGuide(data);
      setStep("guide");
      setLoading(false);
      toast.success("Guia gerado! Siga as instruções de cada plataforma.");
    },
    onError: (e: any) => { setLoading(false); toast.error(e.message); },
  }) ?? { mutate: () => {} };

  const confirmMut = (trpc as any).mediaBudget?.confirmRecharge?.useMutation?.({
    onSuccess: (data: any) => {
      setCompleted(prev => new Set([...prev, data.platform as Platform]));
      refetchBalance?.();
      toast.success(`◎ ${PLATFORMS[data.platform].label} — R$ ${data.amount.toFixed(2)} confirmado!`);
    },
    onError: (e: any) => toast.error(e.message),
  }) ?? { mutate: () => {} };

  // Rateio baseado na configuração do admin (padrão 50/30/20)
  const adminDist = ps?.defaultDist ?? { meta: 50, google: 30, tiktok: 20 };
  const defaultDistribution = [
    { platform: "meta"   as Platform, amount: +(netAmount * adminDist.meta   / 100).toFixed(2) },
    { platform: "google" as Platform, amount: +(netAmount * adminDist.google / 100).toFixed(2) },
    { platform: "tiktok" as Platform, amount: +(netAmount * adminDist.tiktok / 100).toFixed(2) },
  ].filter(d => d.amount > 0);

  function handleGenerate() {
    if (parsedAmount < 50) { toast.error("Valor mínimo: R$ 50,00"); return; }
    setLoading(true);
    setCompleted(new Set());
    (guideMut as any).mutate({ totalAmount: parsedAmount, distribution: defaultDistribution });
  }

  const [receipts, setReceipts] = useState<Record<string, string>>({});

  function handleConfirm(item: GuideItem) {
    (confirmMut as any).mutate({
      platform:        item.platform,
      amount:          item.amount,
      externalReceipt: receipts[item.platform] || undefined,
    });
  }

  const allDone = guide && guide.guide.length > 0 && 
    guide.guide.every((item: GuideItem) => completed.has(item.platform));

  return (
    <Layout>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "clamp(14px, 2.5vw, 28px) clamp(14px, 2vw, 20px)" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
            🛒 Comprar Créditos de Mídia
          </h1>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: "#64748b" }}>
            Deposite o valor, o MECPro calcula o rateio e guia você a comprar em cada plataforma
          </p>
        </div>

        {/* Step 1 — Valor */}
        {step === "input" && (
          <div style={{ display: "grid", gap: 16 }}>

            {/* Saldo atual */}
            {balance?.balance > 0 && (
              <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 14, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>SALDO DISPONÍVEL</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#059669" }}>{R(balance.balance)}</div>
                </div>
                <button onClick={() => setAmount(balance.balance.toFixed(2))}
                  style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #059669", background: "#fff", color: "#059669", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Usar saldo
                </button>
              </div>
            )}

            {/* Input de valor */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px" }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
                Quanto você quer investir em anúncios?
              </label>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, fontWeight: 700, color: "#64748b" }}>R$</span>
                    <input
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0,00"
                      style={{ width: "100%", padding: "14px 14px 14px 42px", borderRadius: 12, border: "2px solid #e2e8f0", fontSize: 22, fontWeight: 800, outline: "none", transition: "border-color 0.2s" }}
                      onFocus={e => e.target.style.borderColor = "#0071e3"}
                      onBlur={e => e.target.style.borderColor = "#e2e8f0"}
                    />
                  </div>
                  {/* Valores rápidos */}
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {[100, 250, 500, 1000, 2000].map(v => (
                      <button key={v} onClick={() => setAmount(String(v))}
                        style={{ padding: "5px 12px", borderRadius: 999, border: "1.5px solid #e2e8f0", background: parsedAmount === v ? "#0071e3" : "#fff", color: parsedAmount === v ? "#fff" : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                        {R(v)}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handleGenerate} disabled={loading || parsedAmount < 50}
                  style={{ padding: "14px 28px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: parsedAmount < 50 ? "not-allowed" : "pointer", whiteSpace: "nowrap", flexShrink: 0,
                    background: parsedAmount < 50 ? "#e2e8f0" : "linear-gradient(135deg,#0071e3,#5856d6)",
                    color: parsedAmount < 50 ? "#94a3b8" : "#fff",
                    boxShadow: parsedAmount >= 50 ? "0 4px 20px rgba(0,113,227,0.3)" : "none",
                  }}>
                  {loading ? "⏳ Gerando..." : "Gerar guia →"}
                </button>
              </div>

              {/* Preview do cálculo */}
              {parsedAmount >= 50 && (
                <div style={{ marginTop: 20, padding: "16px", background: "#f8fafc", borderRadius: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  {[
                    { label: "Valor total",     value: R(parsedAmount), color: "#0f172a" },
                    { label: `Taxa MECPro ${ps?.feePercent ?? 10}%`, value: `− ${R(feeAmount)}`, color: "#dc2626" },
                    { label: "Para anúncios",   value: R(netAmount), color: "#059669" },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: m.color }}>{m.value}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginTop: 2 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Preview do rateio */}
              {parsedAmount >= 50 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 10 }}>Distribuição automática por performance:</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {defaultDistribution.map(d => {
                      const plt = PLATFORMS[d.platform];
                      const pct = netAmount > 0 ? (d.amount / netAmount * 100).toFixed(0) : 0;
                      return (
                        <div key={d.platform} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: plt.bg, borderRadius: 10, border: `1px solid ${plt.color}20` }}>
                          <span style={{ fontSize: 18 }}>{plt.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: plt.color, flex: 1 }}>{plt.label}</span>
                          <span style={{ fontSize: 11, color: "#64748b" }}>{pct}%</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: plt.color }}>{R(d.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
                    * Baseado em performance média. Ajuste no Rateio de Verba se quiser personalizar.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2 — Guia por plataforma */}
        {step === "guide" && guide && (
          <div>
            {/* Resumo */}
            <div style={{ background: "linear-gradient(135deg,#0071e3,#5856d6)", borderRadius: 16, padding: "20px 24px", marginBottom: 24, color: "#fff", display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, opacity: .75 }}>VALOR TOTAL</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{R(guide.totalAmount)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: .75 }}>TAXA MECPRO (10%)</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>− {R(guide.feeAmount)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: .75 }}>PARA COMPRAR EM ANÚNCIOS</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{R(guide.netAmount)}</div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 12, opacity: .75 }}>
                {guide.guide.filter((_: any, i: number) => completed.has(guide.guide[i]?.platform)).length}/{guide.guide.length} plataformas concluídas
              </div>
            </div>

            {/* Cards por plataforma */}
            <div style={{ display: "grid", gap: 16, marginBottom: 24 }}>
              {(guide.guide as GuideItem[]).map((item, idx) => {
                const plt = PLATFORMS[item.platform];
                const done = completed.has(item.platform);

                return (
                  <div key={item.platform} style={{
                    background: "#fff",
                    borderRadius: 16,
                    border: `2px solid ${done ? "#bbf7d0" : plt.color + "30"}`,
                    borderLeft: `4px solid ${done ? "#059669" : plt.color}`,
                    overflow: "hidden",
                    transition: "all 0.25s",
                    boxShadow: done ? "0 2px 12px rgba(5,150,105,0.08)" : "0 2px 8px rgba(0,0,0,0.04)",
                  }}>
                    {/* Header da plataforma */}
                    <div style={{ padding: "18px 22px", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: plt.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, border: `1px solid ${plt.color}20` }}>
                        {plt.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: plt.color }}>{plt.label}</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          {done ? "◎ Crédito confirmado" : "Aguardando compra"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>COMPRAR</div>
                        <div style={{ fontSize: 26, fontWeight: 900, color: done ? "#059669" : "#0f172a" }}>
                          {R(item.amount)}
                        </div>
                      </div>
                    </div>

                    {/* Passos + ações */}
                    {!done && (
                      <div style={{ padding: "0 22px 20px", borderTop: `1px solid ${plt.color}15` }}>
                        {/* Passos */}
                        <div style={{ marginTop: 16, marginBottom: 16 }}>
                          {item.steps.map((step, i) => (
                            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                              <div style={{ width: 22, height: 22, borderRadius: "50%", background: plt.color, color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                                {i + 1}
                              </div>
                              <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{step}</span>
                            </div>
                          ))}
                        </div>

                        {/* Nota de tributos */}
                        {item.notes && (
                          <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: 10, fontSize: 12, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
                            {item.notes}
                          </div>
                        )}

                        {/* Botões */}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {/* Botão principal — abre plataforma */}
                          <a
                            href={item.rechargeUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                              padding: "12px 20px", borderRadius: 12, textDecoration: "none",
                              background: plt.color, color: "#fff", fontSize: 14, fontWeight: 700,
                              boxShadow: `0 4px 16px ${plt.color}40`,
                              minWidth: 180,
                            }}
                          >
                            Abrir {plt.label} →
                          </a>

                          {/* Copiar valor */}
                          <button
                            onClick={() => { navigator.clipboard.writeText(item.amountFmt); toast.success(`R$ ${item.amountFmt} copiado!`); }}
                            style={{ padding: "12px 16px", borderRadius: 12, border: `1.5px solid ${plt.color}40`, background: plt.bg, color: plt.color, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                          >
                            📋 Copiar valor
                          </button>

                          {/* Comprovante opcional */}
                          <div style={{ gridColumn: "1 / -1" }}>
                            <input
                              type="text"
                              placeholder={`Nº do pedido ou ID da transação ${plt.label} (opcional)`}
                              value={receipts[item.platform] || ""}
                              onChange={e => setReceipts(v => ({ ...v, [item.platform]: e.target.value }))}
                              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 12, fontFamily: "var(--font)", boxSizing: "border-box", color: "#374151" }}
                            />
                          </div>

                          {/* Confirmar compra */}
                          <button
                            onClick={() => handleConfirm(item)}
                            style={{ padding: "12px 16px", borderRadius: 12, border: "1.5px solid #bbf7d0", background: "#f0fdf4", color: "#059669", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                          >
                            ◎ Confirmei a compra
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Concluído */}
                    {done && (
                      <div style={{ padding: "12px 22px 16px", borderTop: "1px solid #bbf7d0", background: "#f0fdf4", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 20 }}>◈</div>
                        <div style={{ fontSize: 13, color: "#059669", fontWeight: 600 }}>
                          R$ {item.amountFmt} em créditos confirmados — campanhas liberadas!
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Todos concluídos */}
            {allDone && (
              <div style={{ background: "linear-gradient(135deg,#059669,#10b981)", borderRadius: 16, padding: "24px", textAlign: "center", color: "#fff" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>◈</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Tudo pronto!</div>
                <div style={{ fontSize: 14, opacity: .9, marginBottom: 20 }}>
                  {R(guide.netAmount)} em créditos comprados. Suas campanhas estão rodando.
                </div>
                <button
                  onClick={() => { setStep("input"); setGuide(null); setAmount(""); setCompleted(new Set()); }}
                  style={{ padding: "10px 24px", borderRadius: 10, border: "2px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  Nova compra
                </button>
              </div>
            )}

            {/* Voltar */}
            {!allDone && (
              <button onClick={() => setStep("input")}
                style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                ← Alterar valor
              </button>
            )}
          </div>
        )}

        {/* Info box */}
        {step === "input" && (
          <div style={{ marginTop: 20, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 20px", fontSize: 13, color: "#64748b", lineHeight: 1.8 }}>
            <strong style={{ color: "#0f172a" }}>Como funciona:</strong><br />
            1. Informe o valor total que quer investir<br />
            2. MECPro desconta 10% de taxa de gestão<br />
            3. O sistema calcula o rateio por performance de cada plataforma<br />
            4. Você recebe um guia com o valor exato a comprar em cada uma<br />
            5. Clica no botão → vai direto para a página de recarga<br />
            6. Compra com Pix, Boleto ou Cartão direto na plataforma<br />
            7. Confirma aqui → MECPro registra e libera as campanhas
          </div>
        )}
      </div>
    </Layout>
  );
}
