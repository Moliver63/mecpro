/**
 * systemMemory.ts — Memória técnica operacional do MecProAI
 *
 * Propósito:
 *  - Registrar bugs e soluções em runtime
 *  - Armazenar decisões de arquitetura no banco
 *  - Evitar análise repetida de problemas conhecidos
 *  - Exportar contexto resumido para prompts de IA
 *
 * Uso:
 *  import { logBug, getSystemStatus, buildAIContext } from "./systemMemory";
 */

import { getPool } from "./db";
import { log } from "./logger";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface BugRecord {
  id:        string;       // slug único, ex: "websiteUrl-const-bug"
  module:    string;       // "M2" | "auth" | "meta" | "google" | etc
  descricao: string;
  causa:     string;
  solucao:   string;
  arquivo?:  string;
  resolvido: boolean;
  data:      string;       // ISO date
}

export interface DecisionRecord {
  id:      string;
  modulo:  string;
  decisao: string;
  motivo:  string;
  data:    string;
}

export interface SystemStatus {
  metaAds:      "ok" | "sem_permissao" | "token_expirado" | "desconhecido";
  gemini:       "ok" | "quota_limitada" | "esgotado";
  groq:         "ok" | "fallback" | "indisponivel";
  googleAds:    "ok" | "erro" | "desconhecido";
  asaas:        "ok" | "erro" | "nao_configurado";
  metaCBOpen:   boolean;
  updatedAt:    string;
}

// ── Banco de dados (tabela app_settings) ──────────────────────────────────────

const KEYS = {
  bugs:     "system_memory_bugs",
  decisions:"system_memory_decisions",
  status:   "system_memory_status",
} as const;

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const pool = await getPool();
    if (!pool) return fallback;
    const row = await pool.query(
      `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`, [key]
    );
    if (!row.rows[0]?.value) return fallback;
    return JSON.parse(row.rows[0].value) as T;
  } catch { return fallback; }
}

async function writeSetting(key: string, value: unknown): Promise<void> {
  try {
    const pool = await getPool();
    if (!pool) return;
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      [key, JSON.stringify(value)]
    );
  } catch (e: any) {
    log.warn("memory", "writeSetting falhou", { key, error: e.message?.slice(0, 60) });
  }
}

// ── API de Bugs ───────────────────────────────────────────────────────────────

/** Registra um bug conhecido no banco */
export async function logBug(bug: Omit<BugRecord, "data">): Promise<void> {
  const bugs = await readSetting<BugRecord[]>(KEYS.bugs, []);
  const existing = bugs.findIndex(b => b.id === bug.id);
  const record: BugRecord = { ...bug, data: new Date().toISOString().split("T")[0] };

  if (existing >= 0) {
    bugs[existing] = record; // atualiza se já existe
  } else {
    bugs.push(record);
  }
  // Limite de 100 bugs — remove os mais antigos resolvidos
  const trimmed = bugs.length > 100
    ? [...bugs.filter(b => !b.resolvido).slice(-50), ...bugs.filter(b => b.resolvido).slice(-50)]
    : bugs;

  await writeSetting(KEYS.bugs, trimmed);
  log.info("memory", `Bug ${bug.resolvido ? "resolvido" : "registrado"}: ${bug.id}`, { module: bug.module });
}

/** Busca bug por ID — retorna null se não encontrado */
export async function getBug(id: string): Promise<BugRecord | null> {
  const bugs = await readSetting<BugRecord[]>(KEYS.bugs, []);
  return bugs.find(b => b.id === id) ?? null;
}

/** Verifica se um bug já foi resolvido */
export async function isBugResolved(id: string): Promise<boolean> {
  const bug = await getBug(id);
  return bug?.resolvido ?? false;
}

/** Lista todos os bugs */
export async function getBugHistory(): Promise<BugRecord[]> {
  return readSetting<BugRecord[]>(KEYS.bugs, []);
}

// ── API de Decisões ───────────────────────────────────────────────────────────

export async function logDecision(decision: Omit<DecisionRecord, "data">): Promise<void> {
  const decisions = await readSetting<DecisionRecord[]>(KEYS.decisions, []);
  const existing  = decisions.findIndex(d => d.id === decision.id);
  const record: DecisionRecord = { ...decision, data: new Date().toISOString().split("T")[0] };

  if (existing >= 0) {
    decisions[existing] = record;
  } else {
    decisions.push(record);
  }
  await writeSetting(KEYS.decisions, decisions);
}

// ── API de Status ─────────────────────────────────────────────────────────────

export async function getSystemStatus(): Promise<SystemStatus> {
  return readSetting<SystemStatus>(KEYS.status, {
    metaAds:    "desconhecido",
    gemini:     "ok",
    groq:       "ok",
    googleAds:  "desconhecido",
    asaas:      "nao_configurado",
    metaCBOpen: false,
    updatedAt:  new Date().toISOString(),
  });
}

export async function updateSystemStatus(patch: Partial<SystemStatus>): Promise<void> {
  const current = await getSystemStatus();
  const updated: SystemStatus = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await writeSetting(KEYS.status, updated);
  log.info("memory", "Status do sistema atualizado", patch);
}

// ── Integração com Meta Circuit Breaker ──────────────────────────────────────

/** Chamado pelo ai.ts quando Meta CB abre */
export async function onMetaCBOpen(reason: "code_10" | "code_190" | "timeout"): Promise<void> {
  await updateSystemStatus({ metaAds: reason === "code_190" ? "token_expirado" : "sem_permissao", metaCBOpen: true });
}

export async function onMetaCBClose(): Promise<void> {
  await updateSystemStatus({ metaCBOpen: false });
}

// ── Contexto para IA (economiza tokens) ───────────────────────────────────────

/**
 * Retorna um resumo compacto do estado do sistema para incluir em prompts de IA.
 * Uso: const ctx = await buildAIContext(); prompt = `${ctx}\n\n${userPrompt}`;
 */
export async function buildAIContext(modules?: string[]): Promise<string> {
  const [bugs, decisions, status] = await Promise.all([
    getBugHistory(),
    readSetting<DecisionRecord[]>(KEYS.decisions, []),
    getSystemStatus(),
  ]);

  const openBugs     = bugs.filter(b => !b.resolvido && (!modules || modules.includes(b.module)));
  const relevantDecs = decisions.filter(d => !modules || modules.includes(d.modulo));

  let ctx = `[CONTEXTO MECPROAI]\n`;
  ctx += `Status: Meta=${status.metaAds} Gemini=${status.gemini} Groq=${status.groq}\n`;
  ctx += `Meta CB: ${status.metaCBOpen ? "ABERTO — usar scraping" : "fechado"}\n`;

  if (openBugs.length > 0) {
    ctx += `Bugs abertos: ${openBugs.map(b => `${b.id}(${b.module})`).join(", ")}\n`;
  }
  if (relevantDecs.length > 0) {
    ctx += `Decisões: ${relevantDecs.map(d => `${d.id}:${d.decisao.slice(0,40)}`).join(" | ")}\n`;
  }

  return ctx;
}

// ── Seed inicial (bugs conhecidos já corrigidos) ──────────────────────────────

/**
 * Popula o banco com o histórico de bugs desta sessão de desenvolvimento.
 * Chamar uma vez em bootstrap ou via endpoint admin.
 */
export async function seedKnownBugs(): Promise<void> {
  const knownBugs: Omit<BugRecord, "data">[] = [
    {
      id: "rules-of-hooks-layout",
      module: "layout",
      descricao: "Hooks tRPC após return condicional em Layout.tsx",
      causa: "useQuery chamado depois de if(isPublic) return",
      solucao: "Todos hooks antes de qualquer return; Layout usa sessionStorage em vez de tRPC",
      arquivo: "client/src/components/layout/Layout.tsx",
      resolvido: true,
    },
    {
      id: "optional-chaining-hooks",
      module: "competitors",
      descricao: "?.useMutation?.() com optional chaining = hook condicional",
      causa: "React conta número diferente de hooks entre renders quando ? resolve null",
      solucao: "Sempre usar trpc.namespace.procedure.useMutation() tipado direto",
      resolvido: true,
    },
    {
      id: "websiteUrl-const-bug",
      module: "M2",
      descricao: "const websiteUrl não atualizava após descoberta automática",
      causa: "const é imutável; competitor.websiteUrl era atualizado mas a variável local não",
      solucao: "Alterado para let; atualiza variável + persiste no banco imediatamente",
      arquivo: "server/ai.ts — _analyzeCompetitorImpl()",
      resolvido: true,
    },
    {
      id: "google-ads-too-long",
      module: "google",
      descricao: "Headlines com emoji causavam TOO_LONG na API Google Ads",
      causa: "Emoji ⏰ tem .length=2 em JS; slice(0,30) não removia o emoji antes de cortar",
      solucao: "stripEmojis() antes do slice(0,30) em normalizeAssetTexts()",
      arquivo: "server/_core/router.ts — normalizeAssetTexts()",
      resolvido: true,
    },
    {
      id: "procedure-outside-router",
      module: "admin",
      descricao: "saveUIConfig e discoverCompetitors adicionados fora do router correto",
      causa: "adminRouter fecha L4299; procedures foram inseridos na L9981",
      solucao: "Usar script Python para verificar depth/boundaries antes de inserir procedure",
      resolvido: true,
    },
    {
      id: "meta-token-190",
      module: "meta",
      descricao: "Token Meta expirado (code=190) causava 40s de tentativas inúteis",
      causa: "Pipeline tentava 4 variantes × (API + proxy 10s) com token inválido",
      solucao: "Early exit: verifica token em 3s; se 190 → vai direto para scraping",
      arquivo: "server/ai.ts — _analyzeCompetitorImpl()",
      resolvido: true,
    },
    {
      id: "competitor-forms-corruption",
      module: "M2",
      descricao: "competitorForms.tsx com conteúdo duplicado — build Vite falhou",
      causa: "Substituição de string Python inseriu código sem remover o original",
      solucao: "Restaurar do git (git show HASH:path) e reaplicar só a mudança necessária",
      resolvido: true,
    },
  ];

  for (const bug of knownBugs) {
    await logBug(bug);
  }

  const knownDecisions: Omit<DecisionRecord, "data">[] = [
    {
      id: "layout-no-trpc",
      modulo: "layout",
      decisao: "Layout.tsx não faz chamadas tRPC — usa sessionStorage",
      motivo: "Componente mais crítico; qualquer hook problemático derruba todas as páginas",
    },
    {
      id: "m2-scraping-priority",
      modulo: "M2",
      decisao: "Web scraping é prioridade 1 quando Meta CB aberto",
      motivo: "Meta code=10 é permanente — scraping dá dados baseados em realidade",
    },
    {
      id: "payment-abstraction",
      modulo: "pagamentos",
      decisao: "PaymentProvider interface com StripeProvider e AsaasProvider",
      motivo: "Trocar gateway sem alterar código — apenas config no banco",
    },
    {
      id: "ml-learning-base",
      modulo: "ML",
      decisao: "buildCampaignFromAds consulta learning_base antes de usar benchmarks hardcoded",
      motivo: "Sistema fica progressivamente menos dependente de LLM com mais dados históricos",
    },
  ];

  for (const decision of knownDecisions) {
    await logDecision(decision);
  }

  log.info("memory", "Seed de memória técnica concluído", {
    bugs: knownBugs.length,
    decisions: knownDecisions.length,
  });
}
