/**
 * check-learning-base.ts
 *
 * Diagnóstico SOMENTE LEITURA do pipeline learning_base — não altera nada.
 * Existe pra responder uma pergunta específica: o cron autoSyncMLMetrics /
 * runAnalysisInternal está de fato escrevendo dados recentes, ou a tabela
 * parou de novo depois do fix confirmado na sessão 22 (23/07)?
 *
 * USO:
 *   npx tsx server/scripts/check-learning-base.ts
 *
 * (No Render, DATABASE_URL já está no ambiente — não precisa passar nada.)
 */

import * as dotenv from "dotenv";
import { Pool } from "pg";
import { isValidLearningNiche, normalizeLearningNiche } from "../campaignIntelligenceEngine";

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
    // ── Visão geral: total, última escrita, distribuição de idade ─────────
    const overview = await client.query(`
      SELECT
        COUNT(*) AS total,
        MAX(last_updated) AS most_recent_write,
        MIN(last_updated) AS oldest_write,
        COUNT(*) FILTER (WHERE last_updated > NOW() - INTERVAL '24 hours')  AS updated_24h,
        COUNT(*) FILTER (WHERE last_updated > NOW() - INTERVAL '48 hours')  AS updated_48h,
        COUNT(*) FILTER (WHERE last_updated > NOW() - INTERVAL '7 days')    AS updated_7d,
        COUNT(*) FILTER (WHERE avg_score = 100)                            AS stuck_at_100,
        ROUND(AVG(avg_score)::numeric, 2)                                  AS avg_score_geral,
        COUNT(*) FILTER (WHERE avg_ctr = 0 AND avg_roas = 0 AND sample_count > 5) AS zerado_com_amostras
      FROM learning_base
    `);
    const o = overview.rows[0];

    console.log("📊 learning_base — visão geral");
    console.log(`   Total de linhas:            ${o.total}`);
    console.log(`   Escrita mais recente:       ${o.most_recent_write ?? "NUNCA"}`);
    console.log(`   Escrita mais antiga:        ${o.oldest_write ?? "—"}`);
    console.log(`   Atualizadas nas últimas 24h: ${o.updated_24h}`);
    console.log(`   Atualizadas nas últimas 48h: ${o.updated_48h}`);
    console.log(`   Atualizadas nos últimos 7d:  ${o.updated_7d}`);
    console.log(`   avg_score médio geral:       ${o.avg_score_geral}`);
    console.log(`   Linhas com avg_score=100 fixo (sinal do bug antigo): ${o.stuck_at_100}`);
    console.log(`   Linhas com ctr=roas=0 apesar de sample_count>5:      ${o.zerado_com_amostras}`);

    const invalid = await client.query(`
      SELECT niche, COUNT(*) AS n
      FROM learning_base
      GROUP BY niche
      ORDER BY n DESC
    `);
    const invalidNiches = invalid.rows.filter((row) => !isValidLearningNiche(row.niche));
    const fragmentedGroups = new Map<string, Set<string>>();
    for (const row of invalid.rows) {
      const canonical = normalizeLearningNiche(row.niche);
      if (canonical !== row.niche) {
        if (!fragmentedGroups.has(canonical)) fragmentedGroups.set(canonical, new Set());
        fragmentedGroups.get(canonical)!.add(row.niche);
      }
    }

    console.log(`   Nichos inválidos/suspeitos:  ${invalidNiches.reduce((sum, row) => sum + Number(row.n), 0)} linhas em ${invalidNiches.length} chaves`);
    console.log(`   Chaves que seriam normalizadas: ${[...fragmentedGroups.values()].filter((s) => s.size > 0).length}`);

    // ── Distribuição por nicho — a pendência conhecida é niche='geral' sempre ──
    const niches = await client.query(`
      SELECT niche, COUNT(*) AS n, MAX(last_updated) AS mais_recente
      FROM learning_base
      GROUP BY niche
      ORDER BY n DESC
      LIMIT 15
    `);
    console.log("\n📂 Distribuição por nicho:");
    for (const row of niches.rows) {
      console.log(`   ${row.niche ?? "(null)"}: ${row.n} linhas, mais recente em ${row.mais_recente}`);
    }

    // ── Últimas 10 linhas escritas — prova concreta de atividade recente ──
    const recent = await client.query(`
      SELECT platform, objective, niche, avg_score, avg_ctr, avg_roas, sample_count, last_updated
      FROM learning_base
      ORDER BY last_updated DESC
      LIMIT 10
    `);
    console.log("\n🕒 10 linhas mais recentes:");
    for (const row of recent.rows) {
      console.log(
        `   [${row.last_updated}] ${row.platform}/${row.objective}/${row.niche} ` +
        `score=${row.avg_score} ctr=${row.avg_ctr} roas=${row.avg_roas} n=${row.sample_count}`
      );
    }

    // ── Checagem extra: existe ALGUM metric_roas real no banco? ────────────
    // Distingue "o fix não pegou" de "não tem dado de ROAS pra pegar ainda"
    // (ROAS depende de conversão/compra rastreada via Pixel, que pode nunca
    // ter chegado a existir pra boa parte das campanhas).
    const roasCheck = await client.query(`
      SELECT
        COUNT(*) AS total_campaign_scores,
        COUNT(*) FILTER (WHERE metric_roas > 0) AS com_roas_real,
        MAX(metric_roas) AS maior_roas_visto
      FROM campaign_scores
    `);
    const rc = roasCheck.rows[0];
    console.log("\n💰 campaign_scores — existe ROAS real no banco?");
    console.log(`   Total de linhas em campaign_scores: ${rc.total_campaign_scores}`);
    console.log(`   Linhas com metric_roas > 0:         ${rc.com_roas_real}`);
    console.log(`   Maior metric_roas já visto:         ${rc.maior_roas_visto ?? "—"}`);

    // ── Veredito automático ─────────────────────────────────────────────
    console.log("\n🎯 Veredito:");
    if (Number(o.updated_48h) > 0) {
      console.log("   ✅ ATIVO — houve escrita nas últimas 48h. O pipeline está rodando.");
    } else if (Number(o.updated_7d) > 0) {
      console.log("   ⚠️  MORNO — última escrita foi entre 48h e 7 dias atrás. Cron pode estar falhando silenciosamente de novo.");
    } else {
      console.log("   🔴 PARADO — nenhuma escrita nos últimos 7 dias. O item 2 do prompt de correções estava certo, algo quebrou de novo depois da sessão 22.");
    }
    if (Number(o.stuck_at_100) > 0 || Number(o.zerado_com_amostras) > 0) {
      console.log("   ⚠️  Sinais do bug antigo (score=100 fixo ou ctr/roas=0 com amostras) ainda presentes em parte dos dados — não necessariamente ativo agora, pode ser resíduo histórico não limpo.");
    }
    if (invalidNiches.length > 0) {
      console.log("   ⚠️  Existem nichos inválidos/suspeitos. Rode: npx tsx server/scripts/repair-learning-base.ts para simular a limpeza.");
    }

  } catch (err) {
    console.error("❌ Erro ao consultar:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
