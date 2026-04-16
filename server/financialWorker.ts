/**
 * financialWorker.ts
 *
 * Worker do motor financeiro autônomo.
 * Executado periodicamente via Cron Job no Render.
 *
 * Schedule recomendado: a cada 1 hora
 *   Command: npx tsx server/financialWorker.ts
 *   Schedule: 0 * * * *
 */

import pg from "pg";
import { runFinancialEngine } from "./financialEngine.js";
import { log } from "./logger.js";
import * as db from "./db.js";
import { getDb } from "./db.js";
import { apiIntegrations as integrations } from "./schema.js";
import { and, eq } from "drizzle-orm";

async function resolveGoogleAdsRuntimeContext(integration: any): Promise<any> {
  const { default: resolveCtx } = await import("./_core/router.js") as any;
  // Usa a função já exportada no router
  return resolveCtx?.resolveGoogleAdsRuntimeContext?.(integration);
}

function buildGoogleAdsUrl(customerId: string, path: string): string {
  const version = process.env.GOOGLE_ADS_API_VERSION || "v23";
  return `https://googleads.googleapis.com/${version}/customers/${customerId}/${path}`;
}

function getTikTokRuntimeConfig(integration: any) {
  const token = integration?.accessToken || process.env.TIKTOK_ACCESS_TOKEN;
  const id    = integration?.accountId   || process.env.TIKTOK_ADVERTISER_ID;
  return { configured: !!(token && id), accessToken: token, accountId: id };
}

async function main() {
  log.info("financial-worker", "=== Motor Financeiro iniciando ===");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    const result = await runFinancialEngine(pool, {
      db,
      getDb,
      integrations,
      and,
      eq,
      resolveGoogleAdsRuntimeContext,
      buildGoogleAdsUrl,
      getTikTokRuntimeConfig,
    });

    log.info("financial-worker", "=== Ciclo finalizado ===", result);
    process.exit(0);
  } catch (e: any) {
    log.warn("financial-worker", "Erro fatal no motor financeiro", { error: e.message });
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
