/**
 * fineTuningService.ts
 *
 * Infraestrutura de COLETA, VALIDAÇÃO e PREPARAÇÃO de dataset de
 * fine-tuning. Não dispara treinamento (isso fica para um futuro
 * TrainingJobService, fora do escopo deste arquivo).
 *
 * MITIGAÇÃO DE IMPACTO — decisões de design deste arquivo:
 *
 *  1. NÃO É CHAMADO AUTOMATICAMENTE por nenhum fluxo existente
 *     (server/ai.ts, campaignFactGuard, campaignQualityGate, router.ts).
 *     Nada muda no comportamento atual do MecProAI só por este arquivo
 *     existir. A integração com o fluxo de geração é um passo futuro,
 *     deliberadamente separado, para não arriscar os módulos que já
 *     rodam em produção com clientes reais.
 *
 *  2. Toda escrita usa a tabela nova `fine_tuning_examples`
 *     (server/schema.ts), puramente aditiva — nenhuma tabela existente
 *     é lida ou alterada por este serviço.
 *
 *  3. Nenhuma geração da IA vira exemplo de dataset sozinha. Uma
 *     geração entra sempre com status "generated" (capturada, não
 *     avaliada) e só migra para approved/corrected/high_performer por
 *     ação humana explícita ou por métrica de performance real já
 *     coletada em campaign_metrics — nunca porque a IA "achou" que
 *     estava certa.
 *
 *  4. Antes de qualquer exemplo ser elegível para exportação, ele passa
 *     pelo Fact Guard existente (campaignFactGuard.ts) — reaproveitado,
 *     não duplicado.
 *
 *  5. A tabela ainda não existe no banco de produção até a migration
 *     manual (migration_fine_tuning_examples.sql) ser executada. Todas
 *     as funções aqui assumem que a migration já rodou; se a tabela não
 *     existir, as queries falham com erro claro do Postgres (nunca
 *     falham silenciosamente).
 */

import { eq, and, desc, sql as drizzleSql } from "drizzle-orm";
import { getDb } from "./db";
import {
  fineTuningExamples,
  type FineTuningExample,
  type InsertFineTuningExample,
} from "./schema";
import {
  validateCampaignFactIntegrity,
  type CampaignFacts,
} from "./campaignFactGuard";
import { log } from "./logger";
import type { FineTuningProvider } from "./fineTuningProvider";
import { genericChatProvider } from "./fineTuningProvider";

const CTX = "fine-tuning";

// ── Tipos auxiliares ────────────────────────────────────────────────────

export interface CaptureExampleInput {
  projectId: number;
  campaignId?: number;
  segment?: string;
  taskType: string; // "copy" | "headline" | "hook" | "briefing_question" | ...
  inputContext: unknown; // briefing/contexto usado na geração
  originalOutput: string;
  modelSource?: string;
}

export interface PerformanceMetricsInput {
  ctr?: number;
  cpc?: number;
  cpm?: number;
  cpl?: number;
  cpa?: number;
  roas?: number;
  conversions?: number;
  leads?: number;
}

export interface BuildDatasetFilter {
  segment?: string;
  taskType?: string;
  minTrainingQualityScore?: number;
  limit?: number;
}

// ── 1. Captura ──────────────────────────────────────────────────────────

/**
 * Registra uma geração da IA como candidata (status "generated").
 * Isso sozinho NUNCA torna o exemplo elegível para dataset — só o
 * fluxo de aprovação/correção humana ou promoção por performance faz isso.
 */
export async function captureExample(
  input: CaptureExampleInput,
): Promise<FineTuningExample | null> {
  const db = await getDb();
  if (!db) {
    log.warn(CTX, "captureExample: DB indisponível");
    return null;
  }

  const row: InsertFineTuningExample = {
    projectId: input.projectId,
    campaignId: input.campaignId ?? null,
    segment: input.segment ?? null,
    taskType: input.taskType,
    inputContext: input.inputContext as any,
    originalOutput: input.originalOutput,
    status: "generated",
    modelSource: input.modelSource ?? null,
  } as InsertFineTuningExample;

  const [saved] = await db.insert(fineTuningExamples).values(row).returning();
  log.info(CTX, "exemplo capturado", { id: saved?.id, taskType: input.taskType });
  return saved ?? null;
}

// ── 2. Validação factual (reaproveita o Fact Guard existente) ───────────

/**
 * Roda o Fact Guard já usado na publicação de campanhas contra o texto
 * do exemplo. Não duplica lógica — chama validateCampaignFactIntegrity
 * diretamente. Se houver conflito factual, marca dataset_rejected_fact_guard
 * e o exemplo NUNCA entra no dataset, independente de aprovação humana.
 */
export async function validateExample(
  id: number,
  facts: CampaignFacts,
): Promise<FineTuningExample | null> {
  const db = await getDb();
  if (!db) return null;

  const [example] = await db
    .select()
    .from(fineTuningExamples)
    .where(eq(fineTuningExamples.id, id))
    .limit(1);
  if (!example) {
    log.warn(CTX, "validateExample: exemplo não encontrado", { id });
    return null;
  }

  const textToCheck = example.approvedOutput ?? example.correctedOutput ?? example.originalOutput;
  const validation = validateCampaignFactIntegrity([{ copy: textToCheck }], facts);
  const passed = validation.status === "passed";

  const [updated] = await db
    .update(fineTuningExamples)
    .set({
      factGuardPassed: passed,
      status: passed ? example.status : "dataset_rejected_fact_guard",
      errorType: passed ? example.errorType : "factual_hallucination",
      updatedAt: new Date(),
    })
    .where(eq(fineTuningExamples.id, id))
    .returning();

  if (!passed) {
    log.warn(CTX, "exemplo bloqueado pelo fact guard", {
      id,
      conflicts: validation.conflicts,
    });
  }

  return updated ?? null;
}

// ── 3. Feedback humano ────────────────────────────────────────────────

/** 👍 Aprovado sem alteração. */
export async function approveExample(id: number): Promise<FineTuningExample | null> {
  return setFeedback(id, { status: "approved", approvedOutput: undefined, useOriginalAsApproved: true });
}

/** ✏️ Corrigido pelo usuário — registra original + correção. */
export async function correctExample(
  id: number,
  correctedOutput: string,
  errorType?: string,
): Promise<FineTuningExample | null> {
  return setFeedback(id, {
    status: "corrected",
    correctedOutput,
    approvedOutput: correctedOutput,
    errorType,
  });
}

/** 👎 Rejeitado — nunca entra no dataset. */
export async function rejectExample(
  id: number,
  errorType?: string,
): Promise<FineTuningExample | null> {
  return setFeedback(id, { status: "rejected", errorType });
}

/** Promove um exemplo já aprovado com base em performance real comprovada. */
export async function promoteToHighPerformer(
  id: number,
  metrics: PerformanceMetricsInput,
): Promise<FineTuningExample | null> {
  const db = await getDb();
  if (!db) return null;

  const [updated] = await db
    .update(fineTuningExamples)
    .set({
      status: "high_performer",
      performanceMetrics: metrics as any,
      updatedAt: new Date(),
    })
    .where(eq(fineTuningExamples.id, id))
    .returning();

  return updated ?? null;
}

async function setFeedback(
  id: number,
  patch: {
    status: "approved" | "corrected" | "rejected";
    correctedOutput?: string;
    approvedOutput?: string;
    useOriginalAsApproved?: boolean;
    errorType?: string;
  },
): Promise<FineTuningExample | null> {
  const db = await getDb();
  if (!db) return null;

  const [example] = await db
    .select()
    .from(fineTuningExamples)
    .where(eq(fineTuningExamples.id, id))
    .limit(1);
  if (!example) return null;

  const approvedOutput = patch.useOriginalAsApproved
    ? example.originalOutput
    : patch.approvedOutput ?? example.approvedOutput ?? undefined;

  const [updated] = await db
    .update(fineTuningExamples)
    .set({
      status: patch.status,
      correctedOutput: patch.correctedOutput ?? example.correctedOutput,
      approvedOutput,
      errorType: patch.errorType ?? example.errorType,
      updatedAt: new Date(),
    })
    .where(eq(fineTuningExamples.id, id))
    .returning();

  log.info(CTX, "feedback registrado", { id, status: patch.status });
  return updated ?? null;
}

// ── 4. Score de qualidade de treino ──────────────────────────────────────

/**
 * Combina: aprovação humana, integridade factual, completude do
 * contexto, performance real (quando disponível) e ausência de
 * correção posterior. Puramente determinístico — sem chamada de IA.
 */
export async function calculateTrainingQualityScore(id: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const [example] = await db
    .select()
    .from(fineTuningExamples)
    .where(eq(fineTuningExamples.id, id))
    .limit(1);
  if (!example) return null;

  let score = 0;

  // Aprovação humana é a base — sem ela, o exemplo não deveria nem
  // estar sendo pontuado, mas o score fica 0 em vez de quebrar.
  if (example.status === "approved") score += 40;
  else if (example.status === "high_performer") score += 50;
  else if (example.status === "corrected") score += 25; // teve erro, pesa menos
  else return 0; // generated / rejected / dataset_rejected_fact_guard

  if (example.factGuardPassed) score += 25;
  else return 0; // nunca pontua sem passar no fact guard, mesmo aprovado

  if (example.qualityGatePassed) score += 10;

  const metrics = (example.performanceMetrics as PerformanceMetricsInput | null) ?? null;
  if (metrics) {
    if (typeof metrics.roas === "number" && metrics.roas > 1) score += 15;
    if (typeof metrics.ctr === "number" && metrics.ctr > 0) score += 10;
  }

  score = Math.min(100, score);

  await db
    .update(fineTuningExamples)
    .set({ trainingQualityScore: score, updatedAt: new Date() })
    .where(eq(fineTuningExamples.id, id));

  return score;
}

// ── 5. Dataset builder ────────────────────────────────────────────────

/**
 * Seleciona exemplos elegíveis: aprovados/corrigidos/high_performer,
 * com fact guard passado, ordenados por score. Nunca inclui
 * "generated" (não avaliado), "rejected" ou "dataset_rejected_fact_guard".
 */
export async function buildDataset(
  filter: BuildDatasetFilter = {},
): Promise<FineTuningExample[]> {
  const db = await getDb();
  if (!db) return [];

  const eligibleStatuses = ["approved", "corrected", "high_performer"] as const;

  const conditions = [
    drizzleSql`${fineTuningExamples.status} IN (${drizzleSql.join(
      eligibleStatuses.map((s) => drizzleSql`${s}`),
      drizzleSql`, `,
    )})`,
    eq(fineTuningExamples.factGuardPassed, true),
  ];
  if (filter.segment) conditions.push(eq(fineTuningExamples.segment, filter.segment));
  if (filter.taskType) conditions.push(eq(fineTuningExamples.taskType, filter.taskType));

  let rows = await db
    .select()
    .from(fineTuningExamples)
    .where(and(...conditions))
    .orderBy(desc(fineTuningExamples.trainingQualityScore))
    .limit(filter.limit ?? 1000);

  if (typeof filter.minTrainingQualityScore === "number") {
    rows = rows.filter(
      (r) => (r.trainingQualityScore ?? 0) >= filter.minTrainingQualityScore!,
    );
  }

  return rows;
}

// ── 6. Export ────────────────────────────────────────────────────────

/**
 * Serializa o dataset em JSONL usando o provider informado (default:
 * formato genérico chat-style, sem enviar nada para fora do MecProAI).
 * Retorna a string pronta — quem chama decide se salva em arquivo,
 * mostra no admin ou faz upload manual para um provedor externo.
 */
export function exportDataset(
  examples: FineTuningExample[],
  provider: FineTuningProvider = genericChatProvider,
) {
  const lines = examples.map((example) => {
    const output = example.approvedOutput ?? example.correctedOutput ?? example.originalOutput;
    const formatted = provider.formatExample({
      taskType: example.taskType,
      inputContext: example.inputContext,
      output,
    });
    return JSON.stringify(formatted);
  });

  return {
    format: "jsonl" as const,
    content: lines.join("\n"),
    exampleCount: lines.length,
  };
}

// ── 7. Inspector (dados para a área administrativa) ────────────────────

export async function getDatasetInspectorSummary() {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select().from(fineTuningExamples);

  const bySegment: Record<string, number> = {};
  const byTaskType: Record<string, number> = {};
  let approved = 0, rejected = 0, corrected = 0, blockedByFactGuard = 0, scoreSum = 0, scored = 0;

  for (const r of rows) {
    if (r.segment) bySegment[r.segment] = (bySegment[r.segment] ?? 0) + 1;
    byTaskType[r.taskType] = (byTaskType[r.taskType] ?? 0) + 1;
    if (r.status === "approved" || r.status === "high_performer") approved++;
    if (r.status === "rejected") rejected++;
    if (r.status === "corrected") corrected++;
    if (r.status === "dataset_rejected_fact_guard") blockedByFactGuard++;
    if (typeof r.trainingQualityScore === "number" && r.trainingQualityScore > 0) {
      scoreSum += r.trainingQualityScore;
      scored++;
    }
  }

  return {
    total: rows.length,
    approved,
    rejected,
    corrected,
    blockedByFactGuard,
    averageScore: scored ? Math.round((scoreSum / scored) * 100) / 100 : 0,
    bySegment,
    byTaskType,
    availableForTraining: rows.filter(
      (r) =>
        ["approved", "corrected", "high_performer"].includes(r.status) &&
        r.factGuardPassed === true,
    ).length,
  };
}
