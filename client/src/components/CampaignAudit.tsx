/**
 * CampaignAudit.tsx
 * Sistema de auditoria inteligente para avaliar a qualidade de campanhas
 * geradas pelo MecProAI — cobre tanto o Builder quanto o Result
 *
 * Avalia 7 dimensões:
 *  1. Briefing    — completude dos dados de entrada (Builder)
 *  2. Estratégia  — coerência e profundidade da estratégia gerada
 *  3. Criativos   — qualidade de hooks, copies e CTAs
 *  4. Públicos    — segmentação por funil e distribuição de budget
 *  5. Compliance  — conformidade com políticas Meta Ads 2026
 *  6. Métricas    — realismo e completude das estimativas
 *  7. Execução    — clareza do plano de ação
 */
import { useState, useEffect } from "react";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface AuditDimension {
  id: string;
  label: string;
  icon: string;
  score: number;         // 0–100
  status: "ok" | "warning" | "danger" | "missing";
  issues: string[];
  suggestions: string[];
  weight: number;        // peso no score final
}

interface AuditResult {
  overallScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  dimensions: AuditDimension[];
  criticalIssues: string[];
  topSuggestions: string[];
  isMockData: boolean;
  generatedAt: string;
}

interface CampaignAuditProps {
  campaign: any;
  clientProfile?: any;
  onClose?: () => void;
  mode?: "panel" | "modal" | "inline";
}

// ── Funções de avaliação local (sem LLM — rápido) ────────────────────────────

function scoreBriefing(clientProfile: any): AuditDimension {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  const p = clientProfile || {};
  if (!p.companyName)             { issues.push("Nome da empresa não preenchido");          score -= 10; suggestions.push("Preencha o nome da empresa no perfil do cliente"); }
  if (!p.niche)                   { issues.push("Nicho não definido");                       score -= 20; suggestions.push("Defina o nicho para a IA gerar copies mais precisas"); }
  if (!p.productService)          { issues.push("Produto/serviço não descrito");             score -= 15; suggestions.push("Descreva o produto ou serviço principal oferecido"); }
  if (!p.targetAudience)          { issues.push("Público-alvo não especificado");            score -= 15; suggestions.push("Defina idade, interesses e perfil do público-alvo"); }
  if (!p.mainPain)                { issues.push("Dor principal do cliente não informada");   score -= 10; suggestions.push("A dor é o motor do copy — preencha obrigatoriamente"); }
  if (!p.uniqueValueProposition)  { issues.push("Proposta de valor única não definida");    score -= 10; suggestions.push("Diferencial é o que separa sua oferta da concorrência"); }
  if (!p.monthlyBudget)           { issues.push("Budget mensal não informado");              score -= 10; suggestions.push("Informe o budget para métricas mais realistas"); }
  if (!p.mainObjections)          { issues.push("Objeções dos clientes não mapeadas");       score -= 5;  suggestions.push("Objeções mapeadas geram criativos que quebram resistências"); }
  if (!p.desiredTransformation)   { issues.push("Transformação desejada não descrita");      score -= 5;  suggestions.push("A transformação é o CTA emocional da campanha"); }

  return {
    id: "briefing", label: "Briefing & Perfil", icon: "📋",
    score: Math.max(0, score),
    status: score >= 80 ? "ok" : score >= 60 ? "warning" : score >= 40 ? "danger" : "missing",
    issues, suggestions, weight: 15,
  };
}

function scoreStrategy(campaign: any): AuditDimension {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  const strategy = campaign?.strategy || "";
  const stratLen = strategy.length;

  if (!strategy)                  { issues.push("Estratégia não gerada");                    score -= 40; suggestions.push("Regenere a campanha para obter a estratégia"); }
  else if (stratLen < 100)        { issues.push("Estratégia muito curta (< 100 chars)");     score -= 25; suggestions.push("Estratégia genérica — regenere com dados de concorrentes"); }
  else if (stratLen < 300)        { issues.push("Estratégia superficial");                   score -= 15; suggestions.push("Adicione concorrentes ao Módulo 2 para estratégia mais profunda"); }

  const hasFases = /fase|semana|mês|etapa|tof|mof|bof/i.test(strategy);
  const hasKPIs  = /cpc|cpm|ctr|roas|cpl|conversão|lead/i.test(strategy);
  const hasDiff  = /diferencia|posicion|concorr|mercado/i.test(strategy);

  if (!hasFases) { issues.push("Sem faseamento temporal da campanha");  score -= 15; suggestions.push("Estratégia deve incluir fases TOF/MOF/BOF ou semanas"); }
  if (!hasKPIs)  { issues.push("Sem KPIs mencionados na estratégia");   score -= 10; suggestions.push("Inclua métricas de sucesso (CPC, CPL, ROAS) na estratégia"); }
  if (!hasDiff)  { issues.push("Sem diferenciação competitiva clara");  score -= 10; suggestions.push("Analise concorrentes no Módulo 2 para posicionamento único"); }

  // Detecta mock
  if (strategy.includes("3 fases:") && strategy.includes("awareness (sem 1-2)")) {
    issues.push("⚠️ Dados de mock detectados — IA não gerou estratégia real");
    score -= 30;
    suggestions.push("Aguarde o deploy e regenere a campanha");
  }

  return {
    id: "strategy", label: "Estratégia", icon: "🎯",
    score: Math.max(0, score),
    status: score >= 80 ? "ok" : score >= 60 ? "warning" : score >= 40 ? "danger" : "missing",
    issues, suggestions, weight: 20,
  };
}

function scoreCreatives(campaign: any): AuditDimension {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  let creatives: any[] = [];
  try { creatives = JSON.parse(campaign?.creatives || "[]"); } catch { creatives = []; }

  if (!creatives.length) {
    return { id: "creatives", label: "Criativos", icon: "✏️", score: 0, status: "missing",
      issues: ["Nenhum criativo gerado"], suggestions: ["Regenere a campanha para obter os criativos"], weight: 25 };
  }

  if (creatives.length < 2) { issues.push("Apenas 1 criativo — ideal mínimo 3");  score -= 20; suggestions.push("Clique em 'Regenerar criativos' para obter mais variações"); }
  if (creatives.length < 3) { score -= 10; }

  // Verifica cobertura de funil
  const stages = creatives.map((c: any) => (c.funnelStage || "").toUpperCase());
  const hasTOF = stages.some((s: string) => s.includes("TOF"));
  const hasMOF = stages.some((s: string) => s.includes("MOF"));
  const hasBOF = stages.some((s: string) => s.includes("BOF"));
  if (!hasTOF) { issues.push("Sem criativo para TOF (topo do funil)");  score -= 10; suggestions.push("Crie um criativo de awareness para público frio"); }
  if (!hasMOF) { issues.push("Sem criativo para MOF (meio do funil)");  score -= 8; }
  if (!hasBOF) { issues.push("Sem criativo para BOF (fundo do funil)"); score -= 8; }

  // Verifica qualidade de cada criativo
  let noHook = 0, noPain = 0, noCopy = 0, noCompliance = 0, shortHeadlines = 0;
  creatives.forEach((c: any) => {
    if (!c.hook && !c.headline)   noHook++;
    if (!c.pain)                  noPain++;
    if (!c.copy && !c.bodyText)   noCopy++;
    if (!c.complianceScore)       noCompliance++;
    if ((c.headline || "").length < 10) shortHeadlines++;
  });

  if (noHook > 0)       { issues.push(`${noHook} criativo(s) sem hook/abertura`);       score -= noHook * 5; suggestions.push("Hook é o elemento mais crítico para parar o scroll"); }
  if (noPain > 0)       { issues.push(`${noPain} criativo(s) sem dor mapeada`);          score -= noPain * 4; }
  if (noCopy > 0)       { issues.push(`${noCopy} criativo(s) sem copy/texto do anúncio`);score -= noCopy * 8; suggestions.push("Copy vazio significa anúncio vazio — regenere"); }
  if (noCompliance > 0) { issues.push(`${noCompliance} criativo(s) sem avaliação de compliance`); score -= 5; }
  if (shortHeadlines > 0) { issues.push(`${shortHeadlines} headline(s) muito curta(s)`); score -= shortHeadlines * 3; suggestions.push("Headlines < 10 chars são pouco persuasivas"); }

  // Verifica diversidade de formatos
  const formats = [...new Set(creatives.map((c: any) => c.format || c.orientation || ""))];
  if (formats.length < 2) { issues.push("Todos os criativos no mesmo formato");  score -= 8; suggestions.push("Diversifique formatos: Feed 4:5, Stories 9:16, Square 1:1"); }

  // Detecta mock
  const mockHeadlines = ["Resultados reais em 30 dias", "Veja o que nossos clientes dizem", "Oferta especial — vagas limitadas"];
  const isMock = creatives.some((c: any) => mockHeadlines.includes(c.headline));
  if (isMock) { issues.push("⚠️ Criativos de mock — não foram gerados pela IA"); score -= 25; suggestions.push("Regenere a campanha para criativos personalizados"); }

  return {
    id: "creatives", label: "Criativos", icon: "✏️",
    score: Math.max(0, score),
    status: score >= 80 ? "ok" : score >= 60 ? "warning" : score >= 40 ? "danger" : "missing",
    issues, suggestions, weight: 25,
  };
}

function scoreAdSets(campaign: any): AuditDimension {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  let adSets: any[] = [];
  try { adSets = JSON.parse(campaign?.adSets || "[]"); } catch { adSets = []; }

  if (!adSets.length) {
    return { id: "adsets", label: "Públicos & AdSets", icon: "👥", score: 0, status: "missing",
      issues: ["Nenhum conjunto de anúncios gerado"], suggestions: ["Regenere a campanha para obter os públicos"], weight: 15 };
  }

  if (adSets.length < 2) { issues.push("Menos de 2 conjuntos — ideal mínimo 3"); score -= 15; suggestions.push("Separe em pelo menos TOF / MOF / BOF"); }

  const hasFunnel = adSets.some((a: any) => /TOF|MOF|BOF|frio|morno|quente/i.test(JSON.stringify(a)));
  if (!hasFunnel) { issues.push("Públicos não segmentados por funil");  score -= 20; suggestions.push("Crie públicos distintos: Lookalike (TOF), Engajados (MOF), Remarketing (BOF)"); }

  const hasLookalike = adSets.some((a: any) => /lookalike|semelhante|1-3%|1%|frio|cold|TOF|topo/i.test(JSON.stringify(a)));
  const hasRemark    = adSets.some((a: any) => /remarketing|visitante|7 dias|retarget|BOF|fundo|quente|hot/i.test(JSON.stringify(a)));
  if (!hasLookalike)  { issues.push("Sem público Lookalike/frio para escala"); score -= 8; suggestions.push("Adicione público frio (Lookalike 1-3%) para escala"); }
  if (!hasRemark)     { issues.push("Sem remarketing/BOF configurado");         score -= 8; suggestions.push("Remarketing de 7 dias tem CPL 3-5x menor"); }

  const budgets = adSets.map((a: any) => a.budget || "").filter(Boolean);
  if (budgets.length < adSets.length) { issues.push("Budget não distribuído em todos os conjuntos"); score -= 10; }

  return {
    id: "adsets", label: "Públicos & AdSets", icon: "👥",
    score: Math.max(0, score),
    status: score >= 80 ? "ok" : score >= 60 ? "warning" : score >= 40 ? "danger" : "missing",
    issues, suggestions, weight: 15,
  };
}

function scoreCompliance(campaign: any): AuditDimension {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  let creatives: any[] = [];
  try { creatives = JSON.parse(campaign?.creatives || "[]"); } catch { creatives = []; }

  const BANNED = ["garantido","milagre","100% eficaz","renda garantida","ganhe dinheiro fácil","cure","cura","definitivo","sem risco","médicos odeiam"];
  const WARNING_WORDS = ["grátis","gratis","resultado","antes e depois","emagrecimento","perda de peso","renda extra"];

  const allText = creatives.map((c: any) => `${c.headline || ""} ${c.copy || ""} ${c.bodyText || ""} ${c.cta || ""}`).join(" ").toLowerCase();

  const bannedFound = BANNED.filter(w => allText.includes(w.toLowerCase()));
  const warningFound = WARNING_WORDS.filter(w => allText.includes(w.toLowerCase()));

  if (bannedFound.length > 0) {
    issues.push(`Termos proibidos: ${bannedFound.join(", ")}`);
    score -= bannedFound.length * 20;
    suggestions.push("Remova ou substitua termos proibidos para evitar reprovação Meta");
  }
  if (warningFound.length > 0) {
    issues.push(`Termos sensíveis (revisar): ${warningFound.join(", ")}`);
    score -= warningFound.length * 5;
    suggestions.push("Termos sensíveis precisam de qualificação (ex: 'até X kg em Y semanas comprovado')");
  }

  const dangerCount = creatives.filter((c: any) => c.complianceScore === "danger").length;
  const warnCount   = creatives.filter((c: any) => c.complianceScore === "warning").length;
  if (dangerCount > 0) { issues.push(`${dangerCount} criativo(s) com compliance DANGER`); score -= dangerCount * 25; }
  if (warnCount > 0)   { issues.push(`${warnCount} criativo(s) com compliance WARNING`);  score -= warnCount * 10; }

  if (!issues.length) suggestions.push("Todos os criativos dentro das políticas Meta Ads 2026");

  return {
    id: "compliance", label: "Compliance Meta", icon: "🛡️",
    score: Math.max(0, score),
    status: score >= 80 ? "ok" : score >= 60 ? "warning" : score >= 40 ? "danger" : "missing",
    issues, suggestions, weight: 15,
  };
}

function scoreMetrics(campaign: any): AuditDimension {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  // Lê aiResponse — pode ter metrics direto ou aninhado
  let extra: any = null;
  try {
    const raw = campaign?.aiResponse ? JSON.parse(campaign.aiResponse) : null;
    // Normaliza: metrics pode estar em raw.metrics ou raw direto
    extra = raw?.metrics ? raw : (raw?.estimatedCPC ? { metrics: raw } : raw);
  } catch { extra = null; }

  const metrics = extra?.metrics || null;
  const isHybrid = extra?.generatedBy === "hybrid_engine";

  // Lê funil: coluna direta OU aiResponse (motor híbrido, campanhas novas)
  let funnel: any[] = [];
  try { funnel = JSON.parse(campaign?.conversionFunnel || "[]"); } catch {}
  if (!funnel.length) {
    try {
      const raw2 = campaign?.aiResponse ? JSON.parse(campaign.aiResponse) : null;
      const f = raw2?.conversionFunnel;
      if (Array.isArray(f)) funnel = f;
      else if (typeof f === "string") funnel = JSON.parse(f);
    } catch {}
  }

  // Lê plano: coluna direta OU aiResponse
  let plan: any[] = [];
  try { plan = JSON.parse(campaign?.executionPlan || "[]"); } catch {}
  if (!plan.length) {
    try {
      const raw3 = campaign?.aiResponse ? JSON.parse(campaign.aiResponse) : null;
      const p = raw3?.executionPlan;
      if (Array.isArray(p)) plan = p;
      else if (typeof p === "string") plan = JSON.parse(p);
    } catch {}
  }

  // Campanha antiga: colunas não existiam no banco
  const isOldCampaign = !campaign?.conversionFunnel && !campaign?.executionPlan && !campaign?.aiResponse;

  if (!metrics) {
    issues.push("Métricas estimadas não geradas");
    score -= 30;
    suggestions.push(isOldCampaign ? "Campanha anterior ao fix — regenere para obter dados completos" : "Regenere a campanha — métricas são essenciais para aprovação do cliente");
  } else {
    if (!metrics.estimatedCPC) { issues.push("CPC estimado ausente"); score -= 10; }
    if (!metrics.estimatedCTR) { issues.push("CTR estimado ausente"); score -= 8; }
    if (!metrics.insight)      { issues.push("Sem insight sobre as métricas"); score -= 5; }
    if (isHybrid) suggestions.push("Métricas geradas pelo motor híbrido — baseadas em benchmark do nicho e dados de concorrentes");
  }

  if (!funnel.length) {
    issues.push("Funil de conversão não gerado");
    score -= 20;
    suggestions.push(isOldCampaign ? "Gere uma nova campanha — novas campanhas têm funil TOF→MOF→BOF automático" : "O funil mapeia o caminho do cliente de awareness à conversão");
  } else {
    const hasKPI = funnel.every((f: any) => f.kpi);
    if (!hasKPI) { issues.push("KPIs ausentes em etapas do funil"); score -= 10; }
  }

  if (!plan.length) {
    issues.push("Plano de execução não gerado");
    score -= 15;
    suggestions.push(isOldCampaign ? "Gere uma nova campanha — novas campanhas têm plano semanal automático" : "O plano de execução define ações semanais com budget e KPIs");
  }

  return {
    id: "metrics", label: "Métricas & Funil", icon: "📊",
    score: Math.max(0, score),
    status: score >= 80 ? "ok" : score >= 60 ? "warning" : score >= 40 ? "danger" : "missing",
    issues, suggestions, weight: 10,
  };
}

function scoreExecution(campaign: any): AuditDimension {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  let plan: any[] = [];
  try { plan = JSON.parse(campaign?.executionPlan || "[]"); } catch {}
  // Fallback: lê do aiResponse (motor híbrido)
  if (!plan.length) {
    try {
      const extra = JSON.parse(campaign?.aiResponse || "null");
      if (extra?.executionPlan) {
        plan = typeof extra.executionPlan === "string" ? JSON.parse(extra.executionPlan) : extra.executionPlan;
      }
    } catch {}
  }

  if (!plan.length) {
    const isOld = !campaign?.executionPlan && !campaign?.aiResponse;
    return {
      id: "execution", label: "Plano de Execução", icon: "🗓️", score: 0, status: "missing",
      issues: ["Plano de execução ausente"],
      suggestions: [isOld ? "Campanha anterior — regenere para obter plano semanal com KPIs e budget" : "Regenere a campanha para obter o plano de execução"],
      weight: 10,
    };
  }

  const hasWeekly = plan.some((p: any) => /semana|week|dia|título|title/i.test(JSON.stringify(p)));
  // Usa some() — basta a maioria ter budget/kpi para considerar válido
  const budgetCount  = plan.filter((p: any) => p.budget || p.Budget).length;
  const kpiCount     = plan.filter((p: any) => p.kpi || p.Kpi || p.meta || p.objetivo).length;
  const actionCount  = plan.filter((p: any) => p.action || p.description || p.title || p.ação).length;
  const hasBudget = budgetCount >= Math.ceil(plan.length / 2);
  const hasKPI    = kpiCount    >= Math.ceil(plan.length / 2);
  const hasAction = actionCount >= Math.ceil(plan.length / 2);

  if (!hasWeekly) { issues.push("Plano sem cronograma temporal"); score -= 10; suggestions.push("Detalhe as ações por semana para facilitar a execução"); }
  if (!hasBudget) { issues.push(`Budget ausente em ${plan.length - budgetCount} ações do plano`); score -= 10; suggestions.push("Aloque budget específico para cada semana/fase"); }
  if (!hasKPI)    { issues.push(`KPIs ausentes em ${plan.length - kpiCount} ações`);              score -= 10; suggestions.push("Defina KPIs mensuráveis por ação (ex: CPC < R$1,50)"); }
  if (!hasAction) { issues.push("Ações não descritas no plano"); score -= 15; }

  return {
    id: "execution", label: "Plano de Execução", icon: "🗓️",
    score: Math.max(0, score),
    status: score >= 80 ? "ok" : score >= 60 ? "warning" : score >= 40 ? "danger" : "missing",
    issues, suggestions, weight: 10,
  };
}

function runAudit(campaign: any, clientProfile: any): AuditResult {
  const dimensions = [
    scoreBriefing(clientProfile),
    scoreStrategy(campaign),
    scoreCreatives(campaign),
    scoreAdSets(campaign),
    scoreCompliance(campaign),
    scoreMetrics(campaign),
    scoreExecution(campaign),
  ];

  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
  const overallScore = Math.round(
    dimensions.reduce((s, d) => s + (d.score * d.weight), 0) / totalWeight
  );

  const grade: AuditResult["grade"] =
    overallScore >= 90 ? "A" :
    overallScore >= 75 ? "B" :
    overallScore >= 60 ? "C" :
    overallScore >= 45 ? "D" : "F";

  const criticalIssues = dimensions
    .filter(d => d.status === "danger" || d.status === "missing")
    .flatMap(d => d.issues.slice(0, 2));

  const topSuggestions = dimensions
    .sort((a, b) => a.score - b.score)
    .flatMap(d => d.suggestions.slice(0, 1))
    .slice(0, 5);

  const isMockData = dimensions.some(d => d.issues.some(i => i.includes("mock")));

  return {
    overallScore, grade, dimensions, criticalIssues, topSuggestions, isMockData,
    generatedAt: new Date().toLocaleString("pt-BR"),
  };
}

// ── Utilitários visuais ───────────────────────────────────────────────────────
const STATUS_COLORS = {
  ok:      { bg: "#f0fdf4", border: "#86efac", text: "#16a34a", label: "Aprovado" },
  warning: { bg: "#fefce8", border: "#fde047", text: "#ca8a04", label: "Atenção" },
  danger:  { bg: "#fef2f2", border: "#fca5a5", text: "#dc2626", label: "Crítico" },
  missing: { bg: "#f1f5f9", border: "#cbd5e1", text: "#64748b", label: "Ausente" },
};

const GRADE_CONFIG = {
  A: { color: "#16a34a", bg: "#f0fdf4", label: "Excelente" },
  B: { color: "#2563eb", bg: "#eff6ff", label: "Bom" },
  C: { color: "#ca8a04", bg: "#fefce8", label: "Regular" },
  D: { color: "#ea580c", bg: "#fff7ed", label: "Fraco" },
  F: { color: "#dc2626", bg: "#fef2f2", label: "Reprovado" },
};

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden", flex: 1 }}>
      <div style={{
        height: "100%", borderRadius: 3,
        width: `${score}%`,
        background: score >= 80 ? "#16a34a" : score >= 60 ? "#f59e0b" : "#ef4444",
        transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
      }} />
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CampaignAudit({ campaign, clientProfile, onClose, mode = "panel" }: CampaignAuditProps) {
  const [audit, setAudit]           = useState<AuditResult | null>(null);
  const [running, setRunning]       = useState(false);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"summary" | "detail" | "action">("summary");

  function runAuditNow() {
    setRunning(true);
    setTimeout(() => {
      try {
        const result = runAudit(campaign, clientProfile);
        setAudit(result);
      } catch (e) {
        toast.error("Erro ao executar auditoria");
      } finally {
        setRunning(false);
      }
    }, 800); // simula processamento
  }

  useEffect(() => {
    if (campaign) runAuditNow();
  }, [campaign?.id]);

  const gc = audit ? GRADE_CONFIG[audit.grade] : null;

  return (
    <div style={{
      background: "var(--card, white)",
      border: "1px solid var(--border, #e2e8f0)",
      borderRadius: 18,
      overflow: "hidden",
      fontFamily: "var(--font, -apple-system, sans-serif)",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a, #1e293b)",
        padding: "16px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 20 }}>🔍</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>Auditoria de Campanha</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              {audit ? `Gerada em ${audit.generatedAt}` : "Analisando qualidade da campanha..."}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={runAuditNow} disabled={running}
            style={{ background: "#1e40af", color: "white", border: "none", borderRadius: 8,
              padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: running ? "wait" : "pointer" }}>
            {running ? "⏳ Analisando..." : "↻ Re-auditar"}
          </button>
          {onClose && (
            <button onClick={onClose} style={{ background: "#334155", color: "#94a3b8",
              border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13 }}>✕</button>
          )}
        </div>
      </div>

      {/* Loading */}
      {running && (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: "spin 1s linear infinite" }}>⚙️</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>Auditando 7 dimensões...</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Briefing · Estratégia · Criativos · Públicos · Compliance · Métricas · Execução</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Conteúdo */}
      {audit && !running && (
        <div>
          {/* Score geral */}
          <div style={{ padding: "20px", background: gc!.bg, borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              {/* Grade */}
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: gc!.color, color: "white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 34, fontWeight: 900, boxShadow: `0 8px 24px ${gc!.color}44`,
                }}>{audit.grade}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: gc!.color, marginTop: 6 }}>{gc!.label}</div>
              </div>
              {/* Score breakdown */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 36, fontWeight: 900, color: gc!.color, lineHeight: 1 }}>{audit.overallScore}</span>
                  <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 600 }}>/100</span>
                  {audit.isMockData && (
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, background: "#fef3c7",
                      color: "#92400e", padding: "2px 8px", borderRadius: 20, border: "1px solid #fde68a" }}>
                      ⚠️ Dados de mock
                    </span>
                  )}
                </div>
                <ScoreBar score={audit.overallScore} color={gc!.color} />
                <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                  {[
                    { label: "Críticos", count: audit.dimensions.filter(d => d.status === "danger" || d.status === "missing").length, color: "#dc2626" },
                    { label: "Atenção",  count: audit.dimensions.filter(d => d.status === "warning").length, color: "#f59e0b" },
                    { label: "OK",       count: audit.dimensions.filter(d => d.status === "ok").length, color: "#16a34a" },
                  ].map(s => (
                    <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, display: "inline-block" }} />
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{s.count} {s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Alertas críticos */}
            {audit.criticalIssues.length > 0 && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", marginBottom: 6 }}>🚨 Problemas críticos</div>
                {audit.criticalIssues.slice(0, 3).map((issue, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#991b1b", marginBottom: 3 }}>• {issue}</div>
                ))}
              </div>
            )}
          </div>

          {/* Tabs de navegação */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--off, #f8fafc)" }}>
            {[
              { key: "summary", label: "📊 Resumo" },
              { key: "detail",  label: "🔬 Detalhado" },
              { key: "action",  label: "⚡ Ações" },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveView(tab.key as any)} style={{
                flex: 1, padding: "10px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                background: activeView === tab.key ? "white" : "transparent",
                color: activeView === tab.key ? "var(--black)" : "var(--muted)",
                borderBottom: activeView === tab.key ? "2px solid var(--blue)" : "2px solid transparent",
              }}>{tab.label}</button>
            ))}
          </div>

          {/* View: Resumo */}
          {activeView === "summary" && (
            <div style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {audit.dimensions.map(dim => {
                  const sc = STATUS_COLORS[dim.status];
                  return (
                    <div key={dim.id} onClick={() => setExpanded(expanded === dim.id ? null : dim.id)}
                      style={{ background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 10,
                        padding: "10px 14px", cursor: "pointer", transition: "all .15s" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>{dim.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--black)" }}>{dim.label}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 800, color: sc.text }}>{dim.score}/100</span>
                              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
                                background: sc.border, color: sc.text }}>{sc.label}</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <ScoreBar score={dim.score} color={sc.text} />
                            <span style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0 }}>
                              {dim.issues.length} {dim.issues.length === 1 ? "item" : "itens"}
                            </span>
                          </div>
                        </div>
                        <span style={{ color: "var(--muted)", fontSize: 12, flexShrink: 0 }}>
                          {expanded === dim.id ? "▲" : "▼"}
                        </span>
                      </div>

                      {/* Expandido */}
                      {expanded === dim.id && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${sc.border}` }}>
                          {dim.issues.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              {dim.issues.map((issue, i) => (
                                <div key={i} style={{ fontSize: 11, color: sc.text, marginBottom: 3, display: "flex", gap: 6 }}>
                                  <span>•</span><span>{issue}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {dim.suggestions.length > 0 && (
                            <div style={{ background: "white", borderRadius: 8, padding: "8px 10px" }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>💡 Sugestões</div>
                              {dim.suggestions.map((sug, i) => (
                                <div key={i} style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>→ {sug}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* View: Detalhado — tabela de notas */}
          {activeView === "detail" && (
            <div style={{ padding: "16px 18px" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--off)" }}>
                      {["Dimensão", "Score", "Peso", "Contribuição", "Status", "Problemas"].map(h => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700,
                          color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1,
                          borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {audit.dimensions.map((d, i) => {
                      const sc = STATUS_COLORS[d.status];
                      return (
                        <tr key={d.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "white" : "var(--off)" }}>
                          <td style={{ padding: "10px", fontWeight: 600 }}>{d.icon} {d.label}</td>
                          <td style={{ padding: "10px", fontWeight: 800, color: sc.text }}>{d.score}</td>
                          <td style={{ padding: "10px", color: "var(--muted)" }}>{d.weight}%</td>
                          <td style={{ padding: "10px", color: "var(--muted)" }}>{Math.round(d.score * d.weight / 100)} pts</td>
                          <td style={{ padding: "10px" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                              background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>{sc.label}</span>
                          </td>
                          <td style={{ padding: "10px", color: "var(--muted)", maxWidth: 200 }}>
                            {d.issues.slice(0, 2).join(" · ") || "—"}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: "#0f172a" }}>
                      <td style={{ padding: "10px", color: "white", fontWeight: 800 }}>TOTAL</td>
                      <td style={{ padding: "10px", color: gc!.color, fontWeight: 900, fontSize: 16 }}>{audit.overallScore}</td>
                      <td style={{ padding: "10px", color: "#94a3b8" }}>100%</td>
                      <td style={{ padding: "10px", color: gc!.color, fontWeight: 700 }}>{audit.overallScore} pts</td>
                      <td style={{ padding: "10px" }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: gc!.color }}>Grade {audit.grade} — {gc!.label}</span>
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* Distribuição de pesos */}
              <div style={{ marginTop: 16, background: "var(--off)", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Distribuição de pesos</div>
                {audit.dimensions.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, minWidth: 130, color: "var(--muted)" }}>{d.icon} {d.label}</span>
                    <div style={{ flex: 1, height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${d.weight * 5}%`, background: STATUS_COLORS[d.status].text, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 10, color: "var(--muted)", minWidth: 30, textAlign: "right" }}>{d.weight}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View: Ações prioritárias */}
          {activeView === "action" && (
            <div style={{ padding: "16px 18px" }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--black)", marginBottom: 12 }}>
                  ⚡ Ações prioritárias para melhorar o score
                </div>

                {/* Dimensões com pior score primeiro */}
                {audit.dimensions
                  .filter(d => d.status !== "ok")
                  .sort((a, b) => a.score - b.score)
                  .map((d, i) => {
                    const sc = STATUS_COLORS[d.status];
                    return (
                      <div key={d.id} style={{ display: "flex", gap: 12, marginBottom: 12,
                        background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 12, padding: "12px 14px" }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                          background: sc.text, color: "white",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 800,
                        }}>{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--black)" }}>{d.icon} {d.label}</span>
                            <span style={{ fontSize: 11, fontWeight: 800, color: sc.text }}>+{100 - d.score} pts potencial</span>
                          </div>
                          {d.suggestions.map((sug, si) => (
                            <div key={si} style={{ fontSize: 11, color: sc.text, marginBottom: 3 }}>→ {sug}</div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                {audit.dimensions.every(d => d.status === "ok") && (
                  <div style={{ textAlign: "center", padding: "30px 20px" }}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>🏆</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#16a34a" }}>Campanha em excelente estado!</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Todas as dimensões aprovadas.</div>
                  </div>
                )}
              </div>

              {/* Checklist de publicação */}
              <div style={{ background: "var(--off)", borderRadius: 12, padding: "14px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                  ✅ Checklist para publicar
                </div>
                {[
                  { check: audit.dimensions.find(d => d.id === "briefing")?.score! >= 60,  label: "Perfil do cliente preenchido" },
                  { check: audit.dimensions.find(d => d.id === "creatives")?.score! >= 60, label: "Criativos gerados e revisados" },
                  { check: audit.dimensions.find(d => d.id === "compliance")?.score! >= 70, label: "Compliance Meta aprovado" },
                  { check: audit.dimensions.find(d => d.id === "adsets")?.score! >= 60,    label: "Públicos segmentados por funil" },
                  { check: !audit.isMockData,                                               label: "Dados reais (não mock)" },
                  { check: audit.overallScore >= 65,                                        label: `Score mínimo 65 (atual: ${audit.overallScore})` },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      background: item.check ? "#16a34a" : "#e2e8f0",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: "white", fontSize: 11, fontWeight: 800 }}>{item.check ? "✓" : ""}</span>
                    </div>
                    <span style={{ fontSize: 12, color: item.check ? "var(--black)" : "var(--muted)",
                      textDecoration: !item.check ? "none" : "none", fontWeight: item.check ? 600 : 400 }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
