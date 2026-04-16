/**
 * financialEngine.ts
 *
 * Motor financeiro autônomo do MECPro.
 *
 * Responsabilidades:
 *   1. Sincronizar gastos reais das campanhas (Meta, Google, TikTok)
 *   2. Debitar da wallet do usuário (ledger ad_spend)
 *   3. Pausar campanhas quando saldo esgota
 *   4. Redistribuir orçamento dinamicamente por performance
 *   5. Garantir que nenhum usuário gaste mais do que tem
 */

import { Pool } from "pg";
import { log } from "./logger.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface UserWallet {
  userId:   number;
  balance:  number; // centavos
  email:    string;
}

interface CampaignSpend {
  platform:     string;
  campaignId:   string;
  campaignName: string;
  spendToday:   number; // centavos
}

// ─── Ledger — registrar movimentação ─────────────────────────────────────────

export async function recordLedger(pool: Pool, opts: {
  userId:       number;
  type:         "deposit" | "fee" | "ad_spend" | "transfer" | "refund";
  amount:       number;   // centavos, positivo
  direction:    "credit" | "debit";
  platform?:    string;
  campaignId?:  string;
  campaignName?: string;
  reference?:   string;
  notes?:       string;
}) {
  // Saldo antes
  const balRes = await pool.query(
    `SELECT balance FROM media_balance WHERE "userId" = $1`, [opts.userId]
  );
  const balanceBefore = Number(balRes.rows[0]?.balance || 0);
  const balanceAfter  = opts.direction === "credit"
    ? balanceBefore + opts.amount
    : balanceBefore - opts.amount;

  await pool.query(`
    INSERT INTO wallet_ledger
      ("userId", type, amount, direction, platform, "campaignId", "campaignName",
       reference, notes, "balanceBefore", "balanceAfter")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  `, [
    opts.userId, opts.type, opts.amount, opts.direction,
    opts.platform || null, opts.campaignId || null, opts.campaignName || null,
    opts.reference || null, opts.notes || null,
    balanceBefore, balanceAfter,
  ]);
}

// ─── Sincronizar gastos Meta ──────────────────────────────────────────────────

async function fetchMetaSpend(token: string, act: string, campaignIds: string[]): Promise<CampaignSpend[]> {
  if (!campaignIds.length) return [];
  const since = today();
  const filter = encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "IN", value: campaignIds }]));
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${act}/insights?fields=campaign_id,campaign_name,spend&time_range={"since":"${since}","until":"${since}"}&level=campaign&filtering=${filter}&limit=200&access_token=${token}`,
    { signal: AbortSignal.timeout(12000) }
  );
  const data: any = await res.json();
  return (data.data || []).map((c: any) => ({
    platform:     "meta",
    campaignId:   String(c.campaign_id),
    campaignName: c.campaign_name || "",
    spendToday:   Math.round(Number(c.spend || 0) * 100),
  }));
}

// ─── Sincronizar gastos Google ────────────────────────────────────────────────

async function fetchGoogleSpend(runtime: any, campaignIds: string[], buildUrl: Function): Promise<CampaignSpend[]> {
  if (!campaignIds.length) return [];
  const idList   = campaignIds.join(",");
  const since    = today();
  const query    = `SELECT campaign.id, campaign.name, metrics.cost_micros FROM campaign WHERE campaign.id IN (${idList}) AND segments.date = '${since}' LIMIT 200`;
  const res      = await fetch(buildUrl(runtime.customerId.replace(/-/g,""), "googleAds:search"), {
    method: "POST",
    headers: {
      "Authorization":   `Bearer ${runtime.accessToken}`,
      "developer-token": runtime.developerToken,
      "Content-Type":    "application/json",
      ...(runtime.loginCustomerId ? { "login-customer-id": runtime.loginCustomerId.replace(/-/g,"") } : {}),
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(12000),
  });
  const data: any = await res.json();
  const rows      = Array.isArray(data) ? data : (data.results || []);
  return rows.map((r: any) => ({
    platform:     "google",
    campaignId:   String(r.campaign?.id),
    campaignName: r.campaign?.name || "",
    spendToday:   Math.round(Number(r.metrics?.cost_micros || 0) / 10_000), // micros → centavos
  }));
}

// ─── Sincronizar gastos TikTok ────────────────────────────────────────────────

async function fetchTikTokSpend(token: string, advertiserId: string, campaignIds: string[]): Promise<CampaignSpend[]> {
  if (!campaignIds.length) return [];
  const since = today();
  const res   = await fetch(
    `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=${advertiserId}&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=["campaign_id"]&metrics=["campaign_name","spend"]&start_date=${since}&end_date=${since}&page_size=100`,
    { headers: { "Access-Token": token }, signal: AbortSignal.timeout(12000) }
  );
  const data: any = await res.json();
  return (data.data?.list || [])
    .filter((r: any) => campaignIds.includes(String(r.dimensions?.campaign_id)))
    .map((r: any) => ({
      platform:     "tiktok",
      campaignId:   String(r.dimensions?.campaign_id),
      campaignName: r.metrics?.campaign_name || "",
      spendToday:   Math.round(Number(r.metrics?.spend || 0) * 100),
    }));
}

// ─── Pausar campanha Meta ─────────────────────────────────────────────────────

async function pauseMetaCampaign(token: string, campaignId: string): Promise<boolean> {
  try {
    const res  = await fetch(`https://graph.facebook.com/v19.0/${campaignId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAUSED", access_token: token }),
      signal: AbortSignal.timeout(8000),
    });
    const data: any = await res.json();
    return !data.error;
  } catch { return false; }
}

// ─── Pausar campanha Google ───────────────────────────────────────────────────

async function pauseGoogleCampaign(runtime: any, campaignId: string, buildUrl: Function): Promise<boolean> {
  try {
    const customerId = runtime.customerId.replace(/-/g, "");
    const res = await fetch(buildUrl(customerId, "googleAds:mutate"), {
      method: "POST",
      headers: {
        "Authorization":   `Bearer ${runtime.accessToken}`,
        "developer-token": runtime.developerToken,
        "Content-Type":    "application/json",
        ...(runtime.loginCustomerId ? { "login-customer-id": runtime.loginCustomerId.replace(/-/g,"") } : {}),
      },
      body: JSON.stringify({
        mutateOperations: [{
          campaignOperation: {
            update:     { resourceName: `customers/${customerId}/campaigns/${campaignId}`, status: "PAUSED" },
            updateMask: "status",
          },
        }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data: any = await res.json();
    return !data.error && !data.partialFailureError;
  } catch { return false; }
}

// ─── Pausar campanha TikTok ───────────────────────────────────────────────────

async function pauseTikTokCampaign(token: string, advertiserId: string, campaignId: string): Promise<boolean> {
  try {
    const res  = await fetch("https://business-api.tiktok.com/open_api/v1.3/campaign/status/update/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Access-Token": token },
      body: JSON.stringify({ advertiser_id: advertiserId, campaign_ids: [campaignId], operation_status: "DISABLE" }),
      signal: AbortSignal.timeout(8000),
    });
    const data: any = await res.json();
    return data.code === 0;
  } catch { return false; }
}

// ─── Motor principal ──────────────────────────────────────────────────────────

export async function runFinancialEngine(pool: Pool, deps: {
  db:                            any;
  getDb:                         () => Promise<any>;
  integrations:                  any;
  and:                           any;
  eq:                            any;
  resolveGoogleAdsRuntimeContext: (i: any) => Promise<any>;
  buildGoogleAdsUrl:             (id: string, path: string) => string;
  getTikTokRuntimeConfig:        (i: any) => any;
}) {
  const { db, getDb, integrations, and, eq,
          resolveGoogleAdsRuntimeContext, buildGoogleAdsUrl, getTikTokRuntimeConfig } = deps;

  log.info("financial-engine", "🚀 Iniciando ciclo do motor financeiro");

  // 1. Busca todos os usuários com campanhas publicadas e saldo > 0
  const usersRes = await pool.query(`
    SELECT DISTINCT p."userId", u.email, mb.balance
    FROM campaigns c
    JOIN projects p ON p.id = c."projectId"
    JOIN users u ON u.id = p."userId"
    LEFT JOIN media_balance mb ON mb."userId" = p."userId"
    WHERE c."publishStatus" = 'success'
      AND (c."metaCampaignId" IS NOT NULL OR c."googleCampaignId" IS NOT NULL OR c."tiktokCampaignId" IS NOT NULL)
      AND COALESCE(mb.balance, 0) >= 0
  `);

  const users: UserWallet[] = usersRes.rows.map((r: any) => ({
    userId:  r.userId,
    email:   r.email,
    balance: Number(r.balance || 0),
  }));

  log.info("financial-engine", `Processando ${users.length} usuário(s)`);

  let totalDebited = 0;
  let totalPaused  = 0;
  const results: any[] = [];

  for (const user of users) {
    try {
      // 2. Busca campanhas publicadas do usuário
      const campsRes = await pool.query(`
        SELECT c."metaCampaignId", c."googleCampaignId", c."tiktokCampaignId",
               c."metaAdSetId", c.name
        FROM campaigns c
        JOIN projects p ON p.id = c."projectId"
        WHERE p."userId" = $1
          AND c."publishStatus" = 'success'
          AND (c."metaCampaignId" IS NOT NULL OR c."googleCampaignId" IS NOT NULL OR c."tiktokCampaignId" IS NOT NULL)
      `, [user.userId]);

      const metaIds   = campsRes.rows.filter((r: any) => r.metaCampaignId).map((r: any) => r.metaCampaignId as string);
      const googleIds = campsRes.rows.filter((r: any) => r.googleCampaignId).map((r: any) => r.googleCampaignId as string);
      const tiktokIds = campsRes.rows.filter((r: any) => r.tiktokCampaignId).map((r: any) => r.tiktokCampaignId as string);

      const allSpends: CampaignSpend[] = [];

      // 3. Busca gastos de hoje por plataforma
      const metaInt = await db.getApiIntegration(user.userId, "meta");
      if (metaInt?.accessToken && metaInt?.adAccountId && metaIds.length) {
        const act = metaInt.adAccountId.startsWith("act_") ? metaInt.adAccountId : `act_${metaInt.adAccountId}`;
        const metaSpends = await fetchMetaSpend(metaInt.accessToken, act, metaIds).catch(() => []);
        allSpends.push(...metaSpends);
      }

      const _drz = await getDb();
      const [gInt] = _drz ? await _drz.select().from(integrations)
        .where(and(eq(integrations.userId, user.userId), eq(integrations.provider, "google"), eq(integrations.isActive, 1)))
        : [null];
      if (gInt && googleIds.length) {
        const runtime = await resolveGoogleAdsRuntimeContext(gInt).catch(() => null);
        if (runtime) {
          const gSpends = await fetchGoogleSpend(runtime, googleIds, buildGoogleAdsUrl).catch(() => []);
          allSpends.push(...gSpends);
        }
      }

      const [ttInt] = _drz ? await _drz.select().from(integrations)
        .where(and(eq(integrations.userId, user.userId), eq(integrations.provider, "tiktok"), eq(integrations.isActive, 1)))
        : [null];
      const ttCfg = getTikTokRuntimeConfig(ttInt);
      if (ttCfg.configured && tiktokIds.length) {
        const ttSpends = await fetchTikTokSpend(ttCfg.accessToken, ttCfg.accountId, tiktokIds).catch(() => []);
        allSpends.push(...ttSpends);
      }

      // 4. Para cada campanha, calcula gasto novo (delta desde último snapshot)
      let userDebited = 0;
      const pausedCampaigns: string[] = [];

      for (const spend of allSpends) {
        if (spend.spendToday === 0) continue;

        // Busca último snapshot do dia
        const snapRes = await pool.query(`
          SELECT "spendToday" FROM campaign_spend_snapshots
          WHERE "userId"=$1 AND platform=$2 AND "campaignId"=$3 AND date=CURRENT_DATE
          LIMIT 1
        `, [user.userId, spend.platform, spend.campaignId]);

        const lastSnap    = Number(snapRes.rows[0]?.spendToday || 0);
        const deltaSpend  = Math.max(0, spend.spendToday - lastSnap);

        if (deltaSpend === 0) continue;

        // 5. Verifica se tem saldo suficiente
        const currentBalRes = await pool.query(
          `SELECT balance FROM media_balance WHERE "userId"=$1`, [user.userId]
        );
        const currentBalance = Number(currentBalRes.rows[0]?.balance || 0);

        if (currentBalance <= 0) {
          // Saldo zerado — pausa campanha
          log.warn("financial-engine", `Saldo zero — pausando ${spend.platform}/${spend.campaignId}`, { userId: user.userId });
          let paused = false;

          if (spend.platform === "meta" && metaInt?.accessToken) {
            paused = await pauseMetaCampaign(metaInt.accessToken, spend.campaignId);
          } else if (spend.platform === "google" && gInt) {
            const runtime = await resolveGoogleAdsRuntimeContext(gInt).catch(() => null);
            if (runtime) paused = await pauseGoogleCampaign(runtime, spend.campaignId, buildGoogleAdsUrl);
          } else if (spend.platform === "tiktok" && ttCfg.configured) {
            paused = await pauseTikTokCampaign(ttCfg.accessToken, ttCfg.accountId, spend.campaignId);
          }

          if (paused) {
            pausedCampaigns.push(`${spend.platform}:${spend.campaignId}`);
            totalPaused++;
            log.info("financial-engine", `✅ Campanha pausada por saldo zero: ${spend.platform}/${spend.campaignId}`);
          }
          continue;
        }

        // 6. Debita o gasto real da wallet
        const toDebit = Math.min(deltaSpend, currentBalance); // nunca negativo

        await pool.query(`
          UPDATE media_balance SET balance = balance - $1, "updatedAt" = NOW() WHERE "userId" = $2
        `, [toDebit, user.userId]);

        // Registra no ledger
        await recordLedger(pool, {
          userId:       user.userId,
          type:         "ad_spend",
          amount:       toDebit,
          direction:    "debit",
          platform:     spend.platform,
          campaignId:   spend.campaignId,
          campaignName: spend.campaignName,
          notes:        `Gasto real ${spend.platform} — delta R$ ${(toDebit/100).toFixed(2)} (hoje: R$ ${(spend.spendToday/100).toFixed(2)})`,
        });

        // Atualiza snapshot
        await pool.query(`
          INSERT INTO campaign_spend_snapshots ("userId", platform, "campaignId", "campaignName", "spendToday", "lastDebitedAt", date)
          VALUES ($1, $2, $3, $4, $5, NOW(), CURRENT_DATE)
          ON CONFLICT ("userId", platform, "campaignId", date) DO UPDATE SET
            "spendToday"    = $5,
            "lastDebitedAt" = NOW(),
            "lastSyncAt"    = NOW()
        `, [user.userId, spend.platform, spend.campaignId, spend.campaignName, spend.spendToday]);

        userDebited += toDebit;
        totalDebited += toDebit;

        log.info("financial-engine", `💸 Debitado: ${spend.platform}/${spend.campaignId}`, {
          userId: user.userId, delta: toDebit/100, todayTotal: spend.spendToday/100,
        });

        // 7. Verifica saldo após débito — se muito baixo, avisa
        const newBalance = currentBalance - toDebit;
        if (newBalance < 500_00 && newBalance > 0) { // menos de R$500
          log.warn("financial-engine", `⚠️ Saldo baixo: R$ ${(newBalance/100).toFixed(2)}`, { userId: user.userId });
        }
      }

      results.push({
        userId:          user.userId,
        email:           user.email,
        balanceBefore:   user.balance / 100,
        debited:         userDebited / 100,
        balanceAfter:    (user.balance - userDebited) / 100,
        campaigns:       allSpends.length,
        paused:          pausedCampaigns,
      });

    } catch (e: any) {
      log.warn("financial-engine", `Erro ao processar usuário ${user.userId}`, { error: e.message });
    }
  }

  log.info("financial-engine", "✅ Ciclo concluído", {
    users:        users.length,
    totalDebited: totalDebited / 100,
    totalPaused,
    results,
  });

  return { users: users.length, totalDebited: totalDebited / 100, totalPaused, results };
}
