/**
 * repair-learning-base.ts
 *
 * Reparo seguro da base de aprendizado.
 *
 * Uso:
 *   npx tsx server/scripts/repair-learning-base.ts
 *   npx tsx server/scripts/repair-learning-base.ts --apply
 *   npx tsx server/scripts/repair-learning-base.ts --apply --prune-polluted
 *
 * Sem --apply, roda em dry-run e nao altera o banco.
 * Sem --prune-polluted, preserva linhas ja normalizadas mesmo que antigas.
 */

import * as dotenv from "dotenv";
import { Pool } from "pg";
import { isValidLearningNiche, normalizeLearningNiche } from "../campaignIntelligenceEngine";

dotenv.config({ path: ".env" });

const DB_URL = process.env.DATABASE_URL;
const APPLY = process.argv.includes("--apply");
const PRUNE_POLLUTED = process.argv.includes("--prune-polluted");

if (!DB_URL) {
  console.error("DATABASE_URL nao definida no ambiente");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

const TOP_FIELDS = [
  "top_ad_formats",
  "top_cta_types",
  "top_placements",
  "top_triggers",
  "top_budget_ranges",
  "top_durations",
  "top_copy_structures",
  "top_media_types",
];

function n(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeTopJson(rows: any[], field: string): string {
  const merged: Record<string, number> = {};
  for (const row of rows) {
    try {
      const obj = JSON.parse(row[field] || "{}");
      for (const [key, count] of Object.entries(obj)) {
        const cleanKey = String(key || "").trim();
        if (!cleanKey) continue;
        merged[cleanKey] = (merged[cleanKey] || 0) + n(count);
      }
    } catch {}
  }
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(merged)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
    ),
  );
}

function weightedAvg(rows: any[], field: string): number {
  let totalSamples = 0;
  let total = 0;
  for (const row of rows) {
    const samples = Math.max(n(row.sample_count), 1);
    totalSamples += samples;
    total += n(row[field]) * samples;
  }
  return totalSamples > 0 ? Number((total / totalSamples).toFixed(4)) : 0;
}

function isPollutedLearningRow(row: any): boolean {
  const score = n(row.avg_score);
  const samples = n(row.sample_count);
  const ctr = n(row.avg_ctr);
  const cpc = n(row.avg_cpc);
  const roas = n(row.avg_roas);

  if (score >= 95 && ctr <= 0 && roas <= 0) return true;
  if (samples > 5 && ctr <= 0 && roas <= 0 && cpc <= 0) return true;
  return false;
}

async function normalizeColumn(client: any, table: string, column: string) {
  const rows = (await client.query(`SELECT DISTINCT ${column} AS niche FROM ${table}`)).rows;
  let changed = 0;
  let invalid = 0;

  for (const row of rows) {
    const current = row.niche;
    const canonical = normalizeLearningNiche(current);
    if (!isValidLearningNiche(current)) invalid++;
    if (canonical !== current) {
      changed++;
      if (APPLY) {
        await client.query(`UPDATE ${table} SET ${column}=$1 WHERE ${column}=$2`, [canonical, current]);
      }
    }
  }

  console.log(`   ${table}.${column}: ${changed} chaves para normalizar, ${invalid} invalidas/suspeitas`);
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? "MODO APPLY: alterando banco" : "MODO DRY-RUN: nenhuma alteracao sera feita");
    console.log(PRUNE_POLLUTED ? "PODA ATIVA: removendo linhas sem metricas uteis e capando score antigo" : "PODA INATIVA: use --prune-polluted para limpar residuos de score/metricas");

    await client.query("BEGIN");

    const lbRows = (await client.query(`SELECT * FROM learning_base ORDER BY platform, objective, niche`)).rows;
    const invalid = lbRows.filter((row) => !isValidLearningNiche(row.niche));
    const valid = lbRows.filter((row) => isValidLearningNiche(row.niche));
    const groups = new Map<string, any[]>();

    for (const row of valid) {
      const key = `${row.platform}|||${row.objective}|||${normalizeLearningNiche(row.niche)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const mergeGroups = [...groups.entries()].filter(([key, rows]) => {
      const [, , canonical] = key.split("|||");
      return rows.length > 1 || rows[0]?.niche !== canonical;
    });

    console.log("\nlearning_base:");
    console.log(`   linhas invalidas/suspeitas para remover: ${invalid.length}`);
    console.log(`   grupos para mesclar/normalizar: ${mergeGroups.length}`);

    if (APPLY && invalid.length > 0) {
      await client.query(`DELETE FROM learning_base WHERE id = ANY($1::int[])`, [invalid.map((row) => row.id)]);
    }

    for (const [key, rows] of mergeGroups) {
      const [platform, objective, canonical] = key.split("|||");
      const sampleCount = rows.reduce((sum, row) => sum + n(row.sample_count), 0);
      const bestScore = Math.max(...rows.map((row) => n(row.best_score)));
      const version = Math.max(...rows.map((row) => n(row.version))) + 1;
      const newest = rows
        .map((row) => new Date(row.last_updated || 0))
        .sort((a, b) => b.getTime() - a.getTime())[0] || new Date();

      console.log(`   ${platform}/${objective}: ${rows.map((row) => row.niche).join(", ")} -> ${canonical}`);

      if (!APPLY) continue;

      await client.query(`DELETE FROM learning_base WHERE id = ANY($1::int[])`, [rows.map((row) => row.id)]);
      await client.query(
        `INSERT INTO learning_base (
          platform, objective, niche, sample_count, avg_score, best_score,
          avg_ctr, avg_cpc, avg_cpm, avg_roas,
          top_ad_formats, top_cta_types, top_placements, top_triggers,
          top_budget_ranges, top_durations, top_copy_structures, top_media_types,
          version, last_updated
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        ON CONFLICT (platform, objective, niche) DO UPDATE SET
          sample_count=EXCLUDED.sample_count,
          avg_score=EXCLUDED.avg_score,
          best_score=GREATEST(learning_base.best_score, EXCLUDED.best_score),
          avg_ctr=EXCLUDED.avg_ctr,
          avg_cpc=EXCLUDED.avg_cpc,
          avg_cpm=EXCLUDED.avg_cpm,
          avg_roas=EXCLUDED.avg_roas,
          top_ad_formats=EXCLUDED.top_ad_formats,
          top_cta_types=EXCLUDED.top_cta_types,
          top_placements=EXCLUDED.top_placements,
          top_triggers=EXCLUDED.top_triggers,
          top_budget_ranges=EXCLUDED.top_budget_ranges,
          top_durations=EXCLUDED.top_durations,
          top_copy_structures=EXCLUDED.top_copy_structures,
          top_media_types=EXCLUDED.top_media_types,
          version=GREATEST(learning_base.version, EXCLUDED.version),
          last_updated=GREATEST(learning_base.last_updated, EXCLUDED.last_updated)`,
        [
          platform, objective, canonical, sampleCount,
          weightedAvg(rows, "avg_score"), bestScore,
          weightedAvg(rows, "avg_ctr"), weightedAvg(rows, "avg_cpc"),
          weightedAvg(rows, "avg_cpm"), weightedAvg(rows, "avg_roas"),
          ...TOP_FIELDS.map((field) => mergeTopJson(rows, field)),
          version, newest,
        ],
      );
    }

    console.log("\nnormalizando outras tabelas:");
    await normalizeColumn(client, "campaign_scores", "niche").catch((e: any) => console.log(`   campaign_scores.niche: pulado (${e.message})`));
    await normalizeColumn(client, "winner_patterns", "niche").catch((e: any) => console.log(`   winner_patterns.niche: pulado (${e.message})`));
    await normalizeColumn(client, "ml_dataset", "feature_niche").catch((e: any) => console.log(`   ml_dataset.feature_niche: pulado (${e.message})`));

    const postRows = (await client.query(`SELECT * FROM learning_base ORDER BY platform, objective, niche`)).rows;
    const polluted = postRows.filter(isPollutedLearningRow);
    const capped = postRows.filter((row) => n(row.avg_score) >= 95 && !isPollutedLearningRow(row));

    console.log("\nresiduos historicos:");
    console.log(`   linhas sem metricas uteis para podar: ${polluted.length}`);
    console.log(`   linhas com score antigo alto, mas metricas uteis, para capar em 94.99: ${capped.length}`);

    if (APPLY && PRUNE_POLLUTED) {
      if (polluted.length > 0) {
        await client.query(`DELETE FROM learning_base WHERE id = ANY($1::int[])`, [polluted.map((row) => row.id)]);
      }
      if (capped.length > 0) {
        await client.query(`UPDATE learning_base SET avg_score = 94.99 WHERE id = ANY($1::int[])`, [capped.map((row) => row.id)]);
      }
    }

    if (APPLY) {
      await client.query("COMMIT");
      console.log("\nConcluido. Rode check-learning-base.ts novamente para conferir.");
      if (!PRUNE_POLLUTED && (polluted.length > 0 || capped.length > 0)) {
        console.log("Para limpar os residuos restantes: npx tsx server/scripts/repair-learning-base.ts --apply --prune-polluted");
      }
    } else {
      await client.query("ROLLBACK");
      console.log("\nDry-run concluido. Para aplicar: npx tsx server/scripts/repair-learning-base.ts --apply");
      if (polluted.length > 0 || capped.length > 0) {
        console.log("Para incluir poda dos residuos: npx tsx server/scripts/repair-learning-base.ts --apply --prune-polluted");
      }
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Falha no reparo:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
