import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
type Reservation = { kind: "proceed"; recordId: number } | { kind: "duplicate_in_progress" } | { kind: "cached_result"; result: unknown };
export interface DraftTaskStore {
  reserveMcpIdempotencyKey(userId: number, tool: string, key: string): Promise<Reservation>;
  completeMcpIdempotencyKey(recordId: number, result: unknown): Promise<void>;
}

export const chatTaskContext = new AsyncLocalStorage<{ key: string }>();
export function chatTaskKey(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function runChatDraftTask<T>(userId: number, execute: () => Promise<T>, timeoutMs: number, store?: DraftTaskStore): Promise<T> {
  const context = chatTaskContext.getStore();
  if (!context) throw new Error("Contexto da tarefa ausente.");
  const db = store ?? await import("./db");
  const reservation = await db.reserveMcpIdempotencyKey(userId, "chat_draft", context.key);
  if (reservation.kind === "cached_result") return reservation.result as T;
  if (reservation.kind === "duplicate_in_progress") {
    throw new Error("Esta tarefa ainda esta em processamento. Confira a lista de campanhas antes de iniciar outra.");
  }
  // Never reopen a timed-out task: generation may still commit a campaign.
  const work = execute().then(async result => {
    await db.completeMcpIdempotencyKey(reservation.recordId, result);
    return result;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("A tarefa continua em processamento. Confira a lista de campanhas; nao e necessario gerar novamente.")), timeoutMs);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
