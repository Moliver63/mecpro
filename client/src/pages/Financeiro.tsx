/**
 * Financeiro.tsx — Hub financeiro centralizado
 * Visão geral + acesso rápido para cada módulo
 */
import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

const R = (v?: number | null) =>
  v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

export default function Financeiro() {
  const { data: balance } = (trpc as any).mediaBudget?.getBalance?.useQuery?.()       ?? { data: null };
  const { data: ps }      = (trpc as any).admin?.getPaymentSettings?.useQuery?.()     ?? { data: null };
  const { data: asaas }   = (trpc as any).mediaBudget?.asaasBalance?.useQuery?.()     ?? { data: null };
  const { data: summary } = (trpc as any).mediaBudget?.financialSummary?.useQuery?.() ?? { data: null };
  const feePercent = ps?.feePercent ?? 10;

  const modeWallet = ps?.modeWallet !== false;
  const modeGuide  = ps?.modeGuide  !== false;

  const platforms = [
    { key: "meta",   label: "Meta Ads",   icon: "📘", color: "#1877f2" },
    { key: "google", label: "Google Ads",  icon: "🔵", color: "#1a73e8" },
    { key: "tiktok", label: "TikTok Ads",  icon: "⬛", color: "#010101" },
  ];

  const MODULES = [
    {
      icon: "💳", label: "Depositar via Pix",
      sub:  "Adicione saldo à sua wallet via Pix ou Cartão",
      href: "/media-budget",   color: "#0071e3", bg: "#eff6ff", border: "#bfdbfe",
      active: modeWallet, badge: modeWallet ? null : "Desabilitado",
    },
    {
      icon: "🛒", label: "Comprar créditos",
      sub:  "Guia para comprar direto em cada plataforma",
      href: "/recharge-guide", color: "#059669", bg: "#f0fdf4", border: "#bbf7d0",
      active: modeGuide, badge: modeGuide ? null : "Desabilitado",
    },
    {
      icon: "🎯", label: "Rateio de verba",
      sub:  "Distribui o orçamento por performance",
      href: "/budget-distribution", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe",
      active: true, badge: null,
    },
    {
      icon: "💸", label: "Transferir Asaas",
      sub:  "Envie saldo do Asaas para sua conta bancária",
      href: "/platform-payment", color: "#d97706", bg: "#fffbeb", border: "#fde68a",
      active: true, badge: null,
    },
  ];

  return (
    <Layout>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px" }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
            💰 Financeiro
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            Gerencie saldo, compre créditos e distribua verba entre as plataformas
          </p>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 24 }}>
          {[
            { label: "Saldo wallet",   value: R(balance?.balance),          color: "#059669", bg: "#f0fdf4", border: "#bbf7d0" },
            { label: "Saldo Asaas",    value: R(asaas?.balance),             color: "#0071e3", bg: "#eff6ff", border: "#bfdbfe" },
            { label: "Gasto hoje",     value: R(summary?.totalSpendToday),   color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
            { label: "Taxa de gestão", value: `${feePercent}%`,              color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
          ].map(k => (
            <div key={k.label} style={{ background: k.bg, border: `1.5px solid ${k.border}`, borderRadius: 12, padding: "13px 16px" }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: k.color, letterSpacing: "-0.03em" }}>{k.value || "—"}</div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 3 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Módulos */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 24 }}>
          {MODULES.map(m => (
            <a key={m.href} href={m.active ? m.href : undefined}
              style={{
                padding: "20px", borderRadius: 16, textDecoration: "none",
                border: `2px solid ${m.active ? m.border : "#e2e8f0"}`,
                background: m.active ? m.bg : "#f8fafc",
                cursor: m.active ? "pointer" : "not-allowed",
                display: "block", transition: "all 0.2s",
                opacity: m.active ? 1 : 0.6,
              }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>{m.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: m.active ? m.color : "#94a3b8", marginBottom: 4 }}>
                {m.label}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, marginBottom: 10 }}>{m.sub}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: m.active ? m.color : "#94a3b8" }}>
                {m.active ? "Acessar →" : `🔒 ${m.badge}`}
              </div>
            </a>
          ))}
        </div>

        {/* Gasto por plataforma */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 14 }}>
              Gasto por plataforma
            </div>
            {platforms.map((p, i) => {
              const today = summary?.spendToday?.[p.key] || 0;
              const month = summary?.spendMonth?.[p.key] || 0;
              return (
                <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
                  borderBottom: i < platforms.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                  <span style={{ fontSize: 18 }}>{p.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: p.color }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{R(month)} no mês</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 900 }}>{R(today)}</div>
                </div>
              );
            })}
          </div>

          {/* Últimas movimentações */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #f1f5f9", fontSize: 13, fontWeight: 800 }}>
              Últimas movimentações
            </div>
            {summary?.recentMovements?.slice(0, 5).map((m: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px",
                borderBottom: i < 4 ? "1px solid #f1f5f9" : "none" }}>
                <span style={{ fontSize: 16 }}>
                  {m.type==="deposit"?"📥":m.type==="fee"?"🏷️":m.type==="transfer"?"💸":"📢"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.type==="deposit"?"Depósito":m.type==="fee"?"Taxa":m.type==="transfer"?"Transferência":`${m.platform||"Gasto"}`}
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>
                    {new Date(m.createdAt).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: m.direction==="credit"?"#059669":"#dc2626", flexShrink: 0 }}>
                  {m.direction==="credit"?"+":"−"}{R(m.amount)}
                </div>
              </div>
            ))}
            {(!summary?.recentMovements?.length) && (
              <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                Nenhuma movimentação ainda
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
