/**
 * reset-ml-pollution.ts
 *
 * Limpa os dados poluídos pela escala antiga de calculateScore (fator 100 → 10x inflado).
 * Efeito: todos os scores históricos eram ~100, todos viravam winner_patterns
 * (threshold 60 sempre satisfeito) e learning_base.avg_score estava saturado em 100.
 *
 * Tabelas afetadas:
 *   - campaign_scores    → TRUNCATE completo (serão re-populados pelo syncMetaCampaignMetrics)
 *   - winner_patterns    → TRUNCATE completo (serão re-extraídos após novo sync)
 *   - learning_base      → TRUNCATE completo (reconstrói via auto-análise de 48h)
 *
 * USO:
 *   DATABASE_URL="postgres://..." npx tsx server/scripts/reset-ml-pollution.ts
 *
 * SEGURANÇA:
 *   Só afeta dados derivados/calculados — NUNCA apaga campaigns, projects, users,
 *   ml_dataset (dados brutos) ou qualquer tabela transacional.
 */

import * as dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: ".env" });

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌  DATABASE_URL não definida no ambiente");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

async function main() {
  const client = await pool.connect();
  try {
    // ── Pré-check: quantos registros poluídos existem? ──────────────────────────
    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM campaign_scores)   AS scores,
        (SELECT COUNT(*) FROM winner_patterns)   AS winners,
        (SELECT COUNT(*) FROM learning_base)     AS learning,
        -- mostra distribuição do score para confirmar a poluição
        (SELECT ROUND(AVG(score_total)::numeric,1) FROM campaign_scores) AS avg_score,
        (SELECT COUNT(*) FROM campaign_scores WHERE score_total >= 99)   AS saturated
    `);
    const c = counts.rows[0];
    console.log("📊 Antes do reset:");
    console.log(`   campaign_scores : ${c.scores} registros | avg_score=${c.avg_score} | saturados(≥99)=${c.saturated}`);
    console.log(`   winner_patterns : ${c.winners} registros`);
    console.log(`   learning_base   : ${c.learning} registros`);

    if (Number(c.scores) === 0 && Number(c.winners) === 0 && Number(c.learning) === 0) {
      console.log("✅ Tabelas já estão vazias. Nada a fazer.");
      return;
    }

    // ── Reset em transação ────────────────────────────────────────────────────────
    await client.query("BEGIN");

    await client.query("TRUNCATE TABLE campaign_scores RESTART IDENTITY CASCADE");
    console.log("   ✓ campaign_scores limpa");

    await client.query("TRUNCATE TABLE winner_patterns RESTART IDENTITY CASCADE");
    console.log("   ✓ winner_patterns limpa");

    await client.query("TRUNCATE TABLE learning_base RESTART IDENTITY CASCADE");
    console.log("   ✓ learning_base limpa");

    await client.query("COMMIT");

    // ── Pós-check ────────────────────────────────────────────────────────────────
    const after = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM campaign_scores) AS scores,
        (SELECT COUNT(*) FROM winner_patterns) AS winners,
        (SELECT COUNT(*) FROM learning_base)   AS learning
    `);
    const a = after.rows[0];
    console.log("\n✅ Reset concluído:");
    console.log(`   campaign_scores : ${a.scores}`);
    console.log(`   winner_patterns : ${a.winners}`);
    console.log(`   learning_base   : ${a.learning}`);
    console.log("\n⚡ Próximos passos:");
    console.log("   1. Rode syncMetaCampaignMetrics para repopular campaign_scores com scores reais");
    console.log("   2. O cron autoSyncMLMetrics (48h) reconstrói learning_base automaticamente");
    console.log("   3. winner_patterns são re-extraídos pelo admin ou pelo próximo ciclo de análise");

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("❌ Erro — ROLLBACK executado:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
