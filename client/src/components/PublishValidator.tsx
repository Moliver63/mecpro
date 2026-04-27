/**
 * PublishValidator.tsx
 * Valida todos os campos necessários para publicar no Meta Ads
 * antes de o usuário clicar em "Publicar" — evita erros da API
 */
import { useState } from "react";
import { useLocation } from "wouter";

export interface ValidationItem {
  id: string;
  label: string;
  status: "ok" | "warning" | "error" | "missing";
  message: string;
  fix?: string;       // ação para corrigir
  fixPath?: string;   // rota para corrigir
  value?: string;     // valor atual (para mostrar)
}

export interface PublishValidation {
  canPublish: boolean;
  score: number;       // 0-100
  items: ValidationItem[];
  blockingCount: number;
  warningCount: number;
}

// Valida todos os campos necessários para publicar
export function validateForPublish(params: {
  campaign: any;
  clientProfile: any;
  pageId: string;
  linkUrl: string;
  hasImage: boolean;
  hasVideo: boolean;
  destination: string;
  placements: string[];
  ageMin: number;
  ageMax: number;
}): PublishValidation {
  const { campaign, clientProfile, pageId, linkUrl, hasImage, hasVideo, destination, placements, ageMin, ageMax } = params;
  const items: ValidationItem[] = [];

  let creatives: any[] = [];
  let adSets: any[] = [];
  try { creatives = JSON.parse(campaign?.creatives || "[]"); } catch {}
  try { adSets = JSON.parse(campaign?.adSets || "[]"); } catch {}

  const p = clientProfile || {};
  const c = campaign || {};

  // ── 1. CRIATIVO — copy e headline ─────────────────────────────────
  const bestCreative = creatives[0];
  const hasCopy = bestCreative?.copy || bestCreative?.bodyText || bestCreative?.description;
  const hasHeadline = bestCreative?.headline || bestCreative?.title;
  const hasHook = bestCreative?.hook;

  items.push({
    id: "copy",
    label: "Texto do anúncio (copy)",
    status: hasCopy ? "ok" : "error",
    message: hasCopy
      ? `"${String(hasCopy).slice(0, 60)}..."`
      : "Sem copy gerado — o anúncio ficará sem texto",
    fix: !hasCopy ? "Regenerar criativos" : undefined,
    value: hasCopy ? String(hasCopy).slice(0, 80) : undefined,
  });

  items.push({
    id: "headline",
    label: "Headline do anúncio",
    status: hasHeadline ? "ok" : "warning",
    message: hasHeadline
      ? `"${String(hasHeadline).slice(0, 50)}"`
      : "Sem headline — será usado o nome da campanha como fallback",
    value: hasHeadline ? String(hasHeadline).slice(0, 60) : undefined,
  });

  items.push({
    id: "hook",
    label: "Hook (abertura do anúncio)",
    status: hasHook ? "ok" : "warning",
    message: hasHook
      ? `"${String(hasHook).slice(0, 50)}"`
      : "Sem hook — anúncio começa sem abertura chamativa",
  });

  // ── 2. MÍDIA ──────────────────────────────────────────────────────
  items.push({
    id: "media",
    label: "Imagem ou vídeo",
    status: (hasImage || hasVideo) ? "ok" : "error",
    message: hasVideo
      ? "✓ Vídeo enviado"
      : hasImage
        ? "✓ Imagem enviada"
        : "Sem mídia — Meta exige pelo menos 1 imagem para criar o anúncio",
    fix: (!hasImage && !hasVideo) ? "Faça upload de uma imagem ou vídeo acima" : undefined,
  });

  // ── 3. PÁGINA META ────────────────────────────────────────────────
  items.push({
    id: "pageId",
    label: "Página do Facebook",
    status: pageId?.trim() ? "ok" : "error",
    message: pageId?.trim()
      ? `ID: ${pageId}`
      : "Página não selecionada — obrigatório para criar anúncios no Meta",
    fix: !pageId?.trim() ? "Selecione a página Meta acima" : undefined,
  });

  // ── 4. DESTINO (URL / WhatsApp) ───────────────────────────────────
  const hasDestination = destination === "lead_form" || !!linkUrl?.trim() ||
    !!p.websiteUrl || !!p.socialLinks;
  items.push({
    id: "destination",
    label: "Destino do clique (URL / WhatsApp)",
    status: hasDestination ? "ok" : "warning",
    message: destination === "lead_form"
      ? "✓ Formulário de lead"
      : linkUrl?.trim()
        ? `✓ ${linkUrl.slice(0, 60)}`
        : p.websiteUrl
          ? `✓ Site do perfil: ${String(p.websiteUrl).slice(0, 50)}`
          : p.socialLinks?.includes("wa.me")
            ? "✓ WhatsApp do perfil"
            : "Sem URL — Meta vai usar a página do Facebook como destino",
    fix: !hasDestination ? "Adicione o site ou WhatsApp no Perfil do Cliente" : undefined,
    fixPath: !hasDestination ? `/projects/${c.projectId}/briefing` : undefined,
  });

  // ── 5. PERFIL DO CLIENTE ──────────────────────────────────────────
  items.push({
    id: "company",
    label: "Nome da empresa no perfil",
    status: p.companyName ? "ok" : "warning",
    message: p.companyName
      ? `✓ ${p.companyName}`
      : "Empresa sem nome — o nome da campanha será usado",
    fixPath: !p.companyName ? `/projects/${c.projectId}/briefing` : undefined,
  });

  items.push({
    id: "niche",
    label: "Nicho / segmento",
    status: p.niche ? "ok" : "warning",
    message: p.niche
      ? `✓ ${p.niche}`
      : "Sem nicho — copy genérico, menor taxa de conversão",
    fixPath: !p.niche ? `/projects/${c.projectId}/briefing` : undefined,
  });

  // ── 6. ORÇAMENTO ──────────────────────────────────────────────────
  const budget = c.suggestedBudgetDaily || Math.round((c.suggestedBudgetMonthly || 1000) / 30);
  const budgetOk = budget >= 5; // Meta exige mínimo ~R$5/dia
  items.push({
    id: "budget",
    label: "Orçamento diário",
    status: budgetOk ? "ok" : "error",
    message: budgetOk
      ? `✓ R$ ${budget}/dia (R$ ${budget * 30}/mês)`
      : `R$ ${budget}/dia — Meta exige mínimo de R$ 5/dia por conjunto de anúncios`,
  });

  // ── 7. PÚBLICO ────────────────────────────────────────────────────
  const ageOk = ageMin >= 13 && ageMax <= 65 && ageMin < ageMax;
  items.push({
    id: "audience",
    label: "Segmentação de público",
    status: ageOk ? "ok" : "warning",
    message: ageOk
      ? `✓ ${ageMin}–${ageMax} anos · ${placements.length > 0 ? `${placements.length} posicionamentos` : "posicionamentos automáticos"}`
      : `Faixa etária inválida: ${ageMin}–${ageMax}`,
  });

  // ── 8. CRIATIVOS MOCK ─────────────────────────────────────────────
  const mockHeadlines = ["Descubra por que centenas escolhem", "Veja o que nossos clientes dizem", "Oferta especial — vagas limitadas", "Resultados reais em 30 dias"];
  const hasMockCreatives = creatives.some((cr: any) =>
    mockHeadlines.some(m => (cr.headline || "").startsWith(m))
  );
  if (hasMockCreatives) {
    items.push({
      id: "mock",
      label: "Criativos genéricos detectados",
      status: "warning",
      message: "Criativos de template detectados — podem ter menor performance. Considere regenerar.",
      fix: "Regenerar criativos na aba Criativos",
    });
  }

  // ── 9. COMPLIANCE ─────────────────────────────────────────────────
  const allText = creatives.map(cr => `${cr.headline||""} ${cr.copy||""} ${cr.bodyText||""}`).join(" ").toLowerCase();
  const bannedFound = ["garantido","milagre","renda garantida","cure","100% eficaz"].filter(w => allText.includes(w));
  if (bannedFound.length > 0) {
    items.push({
      id: "compliance",
      label: "Termos proibidos Meta",
      status: "error",
      message: `Termos proibidos encontrados: ${bannedFound.join(", ")} — o anúncio será reprovado`,
      fix: "Edite o copy removendo esses termos",
    });
  }

  const blockingCount = items.filter(i => i.status === "error").length;
  const warningCount  = items.filter(i => i.status === "warning").length;
  const okCount       = items.filter(i => i.status === "ok").length;
  const score         = Math.round((okCount / items.length) * 100);
  const canPublish    = blockingCount === 0;

  return { canPublish, score, items, blockingCount, warningCount };
}

// ── Componente visual ────────────────────────────────────────────────────────
interface PublishValidatorProps {
  validation: PublishValidation;
  onClose?: () => void;
}

export default function PublishValidator({ validation, onClose }: PublishValidatorProps) {
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(true);

  const { canPublish, score, items, blockingCount, warningCount } = validation;

  const statusConfig = {
    ok:      { color: "#16a34a", bg: "#f0fdf4", icon: "✓",  border: "#86efac" },
    warning: { color: "#d97706", bg: "#fefce8", icon: "⚠",  border: "#fde047" },
    error:   { color: "#dc2626", bg: "#fef2f2", icon: "✕",  border: "#fca5a5" },
    missing: { color: "#64748b", bg: "#f8fafc", icon: "◌",  border: "#cbd5e1" },
  };

  return (
    <div style={{
      background: canPublish ? "#f0fdf4" : "#fef2f2",
      border: `1px solid ${canPublish ? "#86efac" : "#fca5a5"}`,
      borderRadius: 14, overflow: "hidden", marginBottom: 12,
      fontFamily: "var(--font)",
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: "10px 14px", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: canPublish ? "#dcfce7" : "#fee2e2",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{canPublish ? "✅" : "🚫"}</span>
          <div>
            <span style={{ fontSize: 13, fontWeight: 800, color: canPublish ? "#166534" : "#991b1b" }}>
              {canPublish
                ? `Pronto para publicar — ${score}% OK`
                : `${blockingCount} erro${blockingCount > 1 ? "s" : ""} bloqueante${blockingCount > 1 ? "s" : ""} — corrija antes de publicar`}
            </span>
            {warningCount > 0 && (
              <span style={{ fontSize: 11, color: "#92400e", marginLeft: 8 }}>
                · {warningCount} aviso{warningCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Items */}
      {expanded && (
        <div style={{ padding: "8px 14px 12px" }}>
          {items.map(item => {
            const sc = statusConfig[item.status];
            return (
              <div key={item.id} style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                padding: "6px 8px", borderRadius: 8, marginBottom: 4,
                background: sc.bg, border: `1px solid ${sc.border}`,
              }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: sc.color, flexShrink: 0, marginTop: 1 }}>
                  {sc.icon}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--black)" }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{item.message}</div>
                  {item.fix && (
                    <div
                      onClick={() => item.fixPath && setLocation(item.fixPath)}
                      style={{
                        marginTop: 3, fontSize: 10, fontWeight: 700, color: sc.color,
                        cursor: item.fixPath ? "pointer" : "default",
                        textDecoration: item.fixPath ? "underline" : "none",
                      }}
                    >
                      → {item.fix}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
