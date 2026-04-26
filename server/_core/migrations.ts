import { getPool } from '../db.js';

export async function runMigrations(): Promise<void> {
  const pool = await getPool();
  if (!pool) {
    console.warn('[migrations] Pool not available — skipping migrations');
    return;
  }

  console.log('[migrations] Running migrations...');

  // Step 1 – enums
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE user_profile AS ENUM ('superadmin','admin','marketing','financeiro','rh','cliente');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE plan_change_status AS ENUM ('pending','approved','rejected');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Step 2 – users: add profile column
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS profile user_profile DEFAULT 'cliente';
  `);

  // Step 3 – plan_change_requests table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plan_change_requests (
      id                   SERIAL PRIMARY KEY,
      "userId"             INTEGER NOT NULL REFERENCES users(id),
      "requestedByUserId"  INTEGER NOT NULL REFERENCES users(id),
      "fromPlan"           TEXT,
      "toPlan"             TEXT NOT NULL,
      status               plan_change_status DEFAULT 'pending',
      reason               TEXT,
      "reviewedAt"         TIMESTAMPTZ,
      "reviewedBy"         INTEGER REFERENCES users(id),
      "createdAt"          TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Step 4 – api_integrations: cada coluna em query separada (PG requer isso para IF NOT EXISTS)
  const apiIntCols = [
    `ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS "adAccountId"    TEXT`,
    `ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS "appId"          TEXT`,
    `ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS "appSecret"      TEXT`,
    `ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS "accountId"      TEXT`,
    `ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS "developerToken" TEXT`,
    `ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS "tokenExpiry"    TIMESTAMPTZ`,
    `ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS "tokenExpiresAt" TIMESTAMPTZ`,
    `ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS "isActive"       INTEGER DEFAULT 1`,
    `ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS "updatedAt"      TIMESTAMPTZ DEFAULT NOW()`,
  ];
  for (const q of apiIntCols) {
    await pool.query(q);
  }

  // Step 5 – user_alert_configs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_alert_configs (
      id                    SERIAL PRIMARY KEY,
      "userId"              INTEGER NOT NULL REFERENCES users(id),
      "projectId"           INTEGER REFERENCES projects(id),
      "cpcMax"              REAL,
      "cplMax"              REAL,
      "cpmMax"              REAL,
      "ctrMin"              REAL,
      "spendDailyMax"       REAL,
      "weeklyReportEnabled" BOOLEAN DEFAULT false,
      "weeklyReportDay"     INTEGER DEFAULT 1,
      "weeklyReportHour"    INTEGER DEFAULT 8,
      "alertEmail"          TEXT,
      platforms             TEXT[] DEFAULT '{}',
      "emailAlert"          BOOLEAN DEFAULT true,
      "createdAt"           TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt"           TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Step 6 – lesson_progress table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lesson_progress (
      id           SERIAL PRIMARY KEY,
      "userId"     INTEGER NOT NULL REFERENCES users(id),
      "courseSlug" VARCHAR(100) NOT NULL,
      "lessonId"   VARCHAR(50) NOT NULL,
      completed    INTEGER NOT NULL DEFAULT 0,
      "completedAt" TIMESTAMPTZ,
      "createdAt"  TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Step 7 – campaigns: adicionar campos de status de publicação
  const campaignCols = [
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS "publishStatus"  VARCHAR(20) DEFAULT 'draft'`,
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS "publishedAt"    TIMESTAMPTZ`,
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS "publishError"   TEXT`,
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS "metaCampaignId" VARCHAR(100)`,
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS "metaAdSetId"    VARCHAR(100)`,
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS "metaAdId"       VARCHAR(100)`,
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS "metaCreativeId" VARCHAR(100)`,
  ];
  for (const q of campaignCols) { await pool.query(q); }

  // Step 8 – app_settings: tabela de configurações globais do sistema
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Seed padrão: Pix habilitado
  await pool.query(`
    INSERT INTO app_settings (key, value) VALUES ('pix_enabled', 'true')
    ON CONFLICT (key) DO NOTHING;
  `);

  // Step 9 – competitors: colunas TikTok, Google Ads e notas (adicionadas após criação inicial)
  const competitorCols = [
    `ALTER TABLE competitors ADD COLUMN IF NOT EXISTS "tiktokUrl"      VARCHAR(500)`,
    `ALTER TABLE competitors ADD COLUMN IF NOT EXISTS "googleAdsUrl"   VARCHAR(500)`,
    `ALTER TABLE competitors ADD COLUMN IF NOT EXISTS "googleAdsQuery" VARCHAR(255)`,
    `ALTER TABLE competitors ADD COLUMN IF NOT EXISTS "notes"          TEXT`,
    `ALTER TABLE competitors ADD COLUMN IF NOT EXISTS "aiInsights"     TEXT`,
    `ALTER TABLE competitors ADD COLUMN IF NOT EXISTS "aiGeneratedAt"  TIMESTAMPTZ`,
    `ALTER TABLE competitors ADD COLUMN IF NOT EXISTS "aiAdsAnalyzed"  INTEGER`,
  ];
  for (const q of competitorCols) { await pool.query(q); }

  // Step 10 – scraped_ads: colunas de mídia e landing page
  const scrapedAdsCols = [
    `ALTER TABLE scraped_ads ADD COLUMN IF NOT EXISTS "source"         VARCHAR(30) DEFAULT 'meta_api'`,
    `ALTER TABLE scraped_ads ADD COLUMN IF NOT EXISTS "imageUrl"       TEXT`,
    `ALTER TABLE scraped_ads ADD COLUMN IF NOT EXISTS "videoUrl"       TEXT`,
    `ALTER TABLE scraped_ads ADD COLUMN IF NOT EXISTS "landingPageUrl" TEXT`,
    `ALTER TABLE scraped_ads ADD COLUMN IF NOT EXISTS "rawData"        TEXT`,
    // WhatsApp vinculado à conta Meta
    `ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS "whatsappPhone" VARCHAR(50)`,
  ];
  for (const q of scrapedAdsCols) { await pool.query(q); }

  // Step 11 – market_analyses: garantir existência da tabela e colunas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_analyses (
      id                       SERIAL PRIMARY KEY,
      "projectId"              INTEGER NOT NULL UNIQUE,
      "competitiveGaps"        TEXT,
      "unexploredOpportunities" TEXT,
      "suggestedPositioning"   TEXT,
      "competitiveMap"         TEXT,
      threats                  TEXT,
      "aiModel"                VARCHAR(100),
      "generatedAt"            TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt"              TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Verba de Mídia — gestão financeira da agência ───────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_budget (
      id              SERIAL PRIMARY KEY,
      "userId"        INTEGER NOT NULL REFERENCES users(id),
      "projectId"     INTEGER REFERENCES projects(id),
      amount          INTEGER NOT NULL,
      "feePercent"    INTEGER NOT NULL DEFAULT 10,
      "feeAmount"     INTEGER NOT NULL,
      "netAmount"     INTEGER NOT NULL,
      type            VARCHAR(20) NOT NULL DEFAULT 'deposit',
      status          VARCHAR(20) NOT NULL DEFAULT 'pending',
      method          VARCHAR(20) NOT NULL DEFAULT 'pix',
      "stripeId"      VARCHAR(255),
      "pixPayload"    TEXT,
      "pixExpiry"     TIMESTAMPTZ,
      notes           TEXT,
      "approvedAt"    TIMESTAMPTZ,
      "approvedBy"    INTEGER REFERENCES users(id),
      "createdAt"     TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt"     TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_balance (
      id              SERIAL PRIMARY KEY,
      "userId"        INTEGER NOT NULL UNIQUE REFERENCES users(id),
      balance         INTEGER NOT NULL DEFAULT 0,
      "totalDeposited" INTEGER NOT NULL DEFAULT 0,
      "totalFees"     INTEGER NOT NULL DEFAULT 0,
      "updatedAt"     TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Colunas Google e TikTok nas campanhas ───────────────────────────────────
  await pool.query(`
    ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS "googleCampaignId" VARCHAR(100),
      ADD COLUMN IF NOT EXISTS "googleAdGroupId"  VARCHAR(100),
      ADD COLUMN IF NOT EXISTS "tiktokCampaignId" VARCHAR(100),
      ADD COLUMN IF NOT EXISTS "tiktokAdGroupId"  VARCHAR(100);
  `);

  // ── Rateios aprovados — rastreamento de distribuição por plataforma ─────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_distributions (
      id              SERIAL PRIMARY KEY,
      "userId"        INTEGER NOT NULL REFERENCES users(id),
      "totalAmount"   INTEGER NOT NULL,
      status          VARCHAR(20) NOT NULL DEFAULT 'pending_recharge',
      "appliedAt"     TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt"     TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_distribution_items (
      id                  SERIAL PRIMARY KEY,
      "distributionId"    INTEGER NOT NULL REFERENCES media_distributions(id),
      platform            VARCHAR(20) NOT NULL,
      "campaignId"        VARCHAR(100) NOT NULL,
      "campaignName"      VARCHAR(255),
      "allocatedAmount"   INTEGER NOT NULL,
      "rechargeNeeded"    INTEGER NOT NULL DEFAULT 0,
      "rechargeStatus"    VARCHAR(20) NOT NULL DEFAULT 'pending',
      "rechargedAt"       TIMESTAMPTZ,
      "createdAt"         TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Ledger unificado de movimentações financeiras ───────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_ledger (
      id              SERIAL PRIMARY KEY,
      "userId"        INTEGER NOT NULL REFERENCES users(id),
      type            VARCHAR(20) NOT NULL, -- deposit | fee | ad_spend | transfer | refund
      amount          INTEGER NOT NULL,     -- centavos, sempre positivo
      direction       VARCHAR(10) NOT NULL, -- credit | debit
      platform        VARCHAR(20),          -- meta | google | tiktok | null
      "campaignId"    VARCHAR(100),
      "campaignName"  VARCHAR(255),
      reference       VARCHAR(255),         -- ID externo (asaasId, paymentIntentId, etc)
      notes           TEXT,
      "balanceBefore" INTEGER NOT NULL DEFAULT 0,
      "balanceAfter"  INTEGER NOT NULL DEFAULT 0,
      "createdAt"     TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user ON wallet_ledger("userId");
    CREATE INDEX IF NOT EXISTS idx_wallet_ledger_type ON wallet_ledger(type);
    CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created ON wallet_ledger("createdAt");
  `);

  // ── Snapshots de gasto por campanha (sincronização periódica) ────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaign_spend_snapshots (
      id              SERIAL PRIMARY KEY,
      "userId"        INTEGER NOT NULL REFERENCES users(id),
      platform        VARCHAR(20) NOT NULL,
      "campaignId"    VARCHAR(100) NOT NULL,
      "campaignName"  VARCHAR(255),
      "spendToday"    INTEGER NOT NULL DEFAULT 0,   -- centavos gastos hoje
      "spendTotal"    INTEGER NOT NULL DEFAULT 0,   -- centavos gastos no período
      "lastDebitedAt" TIMESTAMPTZ,
      "lastSyncAt"    TIMESTAMPTZ DEFAULT NOW(),
      date            DATE NOT NULL DEFAULT CURRENT_DATE,
      UNIQUE("userId", platform, "campaignId", date)
    );
  `);


  // user_budget_dist — rateio de verba por plataforma
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_budget_dist (
      "userId"    INTEGER PRIMARY KEY,
      meta        INTEGER NOT NULL DEFAULT 50,
      google      INTEGER NOT NULL DEFAULT 30,
      tiktok      INTEGER NOT NULL DEFAULT 20,
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  
  // media_budget: adicionar colunas de controle de lembrete e cancelamento automático
  await pool.query(`
    ALTER TABLE media_budget ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMPTZ
  `);
  await pool.query(`
    ALTER TABLE media_budget ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMPTZ
  `);
  await pool.query(`
    ALTER TABLE media_budget ADD COLUMN IF NOT EXISTS "platform" VARCHAR(20)
  `);

  
  // Auditoria de recarga: colunas para trilha forte
  const auditCols = [
    `ALTER TABLE media_budget ADD COLUMN IF NOT EXISTS "externalId"      TEXT`,
    `ALTER TABLE media_budget ADD COLUMN IF NOT EXISTS "externalReceipt" TEXT`,
    `ALTER TABLE media_budget ADD COLUMN IF NOT EXISTS "verifiedAt"      TIMESTAMPTZ`,
    `ALTER TABLE media_budget ADD COLUMN IF NOT EXISTS "verifiedBy"      VARCHAR(20)`,
    `ALTER TABLE media_budget ADD COLUMN IF NOT EXISTS "reconciledAt"    TIMESTAMPTZ`,
    `ALTER TABLE media_budget ADD COLUMN IF NOT EXISTS "operationStatus" VARCHAR(30) DEFAULT 'pending'`,
    `ALTER TABLE media_budget ADD COLUMN IF NOT EXISTS "errorMsg"        TEXT`,
    // Gap 2: categoria para distinguir tipo de transação
    `ALTER TABLE media_budget ADD COLUMN IF NOT EXISTS "category" VARCHAR(30) DEFAULT 'media_deposit'`,
    // Segurança: hash do código para impedir reuso
    `ALTER TABLE media_budget ADD COLUMN IF NOT EXISTS "codeHash" VARCHAR(64)`,
    `CREATE INDEX IF NOT EXISTS idx_media_budget_codehash ON media_budget ("codeHash") WHERE "codeHash" IS NOT NULL`,
  ];
  for (const q of auditCols) { try { await pool.query(q); } catch {} }

  // Índice para reconciliação por externalId
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_media_budget_external
    ON media_budget ("externalId") WHERE "externalId" IS NOT NULL
  `).catch(() => {});

    // ── API Keys (external REST API) ─────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id           SERIAL PRIMARY KEY,
        "userId"     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key          TEXT NOT NULL UNIQUE,
        name         TEXT NOT NULL DEFAULT 'Default',
        "reqToday"   INTEGER NOT NULL DEFAULT 0,
        "reqMonth"   INTEGER NOT NULL DEFAULT 0,
        "lastUsedAt" TIMESTAMPTZ,
        "resetAt"    DATE NOT NULL DEFAULT CURRENT_DATE,
        active       BOOLEAN NOT NULL DEFAULT true,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(() => {});

    // ── Schema updates: competitors ──────────────────────────────────────────
    await pool.query(`ALTER TABLE competitors ADD COLUMN IF NOT EXISTS "aiInsights"    TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE competitors ADD COLUMN IF NOT EXISTS "aiGeneratedAt" TIMESTAMPTZ`).catch(()=>{});
    await pool.query(`ALTER TABLE competitors ADD COLUMN IF NOT EXISTS "aiAdsAnalyzed" INTEGER`).catch(()=>{});

    // ── Schema updates: scraped_ads ───────────────────────────────────────────
    await pool.query(`ALTER TABLE scraped_ads ADD COLUMN IF NOT EXISTS "pageName"           VARCHAR(255)`).catch(()=>{});
    await pool.query(`ALTER TABLE scraped_ads ADD COLUMN IF NOT EXISTS "pageId"             VARCHAR(100)`).catch(()=>{});
    await pool.query(`ALTER TABLE scraped_ads ADD COLUMN IF NOT EXISTS "publisherPlatforms" TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE scraped_ads ADD COLUMN IF NOT EXISTS "demographicData"    TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE scraped_ads ADD COLUMN IF NOT EXISTS "regionData"         TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE scraped_ads ADD COLUMN IF NOT EXISTS "spendRange"         VARCHAR(100)`).catch(()=>{});
    await pool.query(`ALTER TABLE scraped_ads ADD COLUMN IF NOT EXISTS "reachEstimate"      VARCHAR(100)`).catch(()=>{});

    // ── Marketplace ──────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS marketplace_listings (
        id              SERIAL PRIMARY KEY,
        "userId"        INTEGER NOT NULL,
        "campaignId"    INTEGER,
        "projectId"     INTEGER,
        title           VARCHAR(255) NOT NULL,
        slug            VARCHAR(300) NOT NULL UNIQUE,
        niche           VARCHAR(50)  NOT NULL,
        status          VARCHAR(30)  NOT NULL DEFAULT 'draft',
        price           NUMERIC(10,2),
        "priceType"     VARCHAR(30)  DEFAULT 'fixed',
        currency        VARCHAR(3)   DEFAULT 'BRL',
        "commissionRate" NUMERIC(5,2) DEFAULT 10.00,
        "landingPage"   JSONB,
        "landingPageHtml" TEXT,
        headline        TEXT,
        subheadline     TEXT,
        description     TEXT,
        benefits        JSONB,
        faq             JSONB,
        testimonials    JSONB,
        "ctaText"       VARCHAR(100),
        guarantee       TEXT,
        "imageUrl"      TEXT,
        "videoUrl"      TEXT,
        "thumbnailUrl"  TEXT,
        "checkoutUrl"   TEXT,
        "whatsappNumber" VARCHAR(20),
        "contactEmail"  VARCHAR(255),
        "checkoutType"  VARCHAR(30),
        region          VARCHAR(100),
        city            VARCHAR(100),
        state           VARCHAR(2),
        "isNational"    BOOLEAN DEFAULT true,
        views           INTEGER DEFAULT 0,
        clicks          INTEGER DEFAULT 0,
        conversions     INTEGER DEFAULT 0,
        revenue         NUMERIC(12,2) DEFAULT 0,
        "aiScore"       INTEGER,
        "aiSuggestions" JSONB,
        "lastOptimizedAt" TIMESTAMPTZ,
        "publishedAt"   TIMESTAMPTZ,
        "expiresAt"     TIMESTAMPTZ,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(() => {});

    await pool.query(`CREATE INDEX IF NOT EXISTS listings_niche_idx  ON marketplace_listings(niche)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS listings_status_idx ON marketplace_listings(status)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS listings_user_idx   ON marketplace_listings("userId")`).catch(()=>{});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS marketplace_boosts (
        id          SERIAL PRIMARY KEY,
        "listingId" INTEGER NOT NULL,
        "userId"    INTEGER NOT NULL,
        "boostType" VARCHAR(50) NOT NULL,
        "startDate" TIMESTAMPTZ NOT NULL,
        "endDate"   TIMESTAMPTZ NOT NULL,
        price       NUMERIC(8,2) NOT NULL,
        "isActive"  BOOLEAN DEFAULT true,
        "paymentId" VARCHAR(255),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS marketplace_orders (
        id              SERIAL PRIMARY KEY,
        "listingId"     INTEGER NOT NULL,
        "buyerEmail"    VARCHAR(255) NOT NULL,
        "buyerName"     VARCHAR(255),
        "buyerPhone"    VARCHAR(20),
        "sellerId"      INTEGER NOT NULL,
        status          VARCHAR(30) NOT NULL DEFAULT 'pending',
        amount          NUMERIC(10,2) NOT NULL,
        commission      NUMERIC(10,2),
        "netAmount"     NUMERIC(10,2),
        "paymentMethod" VARCHAR(30),
        "paymentId"     VARCHAR(255),
        "paidAt"        TIMESTAMPTZ,
        notes           TEXT,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS listing_analytics (
        id          SERIAL PRIMARY KEY,
        "listingId" INTEGER NOT NULL,
        date        VARCHAR(10) NOT NULL,
        views       INTEGER DEFAULT 0,
        clicks      INTEGER DEFAULT 0,
        ctr         NUMERIC(5,2),
        source      VARCHAR(50),
        UNIQUE("listingId", date)
      )
    `).catch(() => {});

    console.log('[migrations] ✅ Migrations applied successfully');
}
