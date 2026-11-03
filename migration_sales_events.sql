-- MECPro: tabelas de vendas reais (Kiwify / Hotmart)
-- sales_integrations: uma URL secreta de webhook por projeto e plataforma.
-- sales_events: cada pedido recebido, com status atualizado a cada evento e a
-- campanha MecProAI atribuida pelas UTMs (utm_campaign=mp{id}).
--
-- Esta migracao JA RODA SOZINHA no boot (runMigrations -> SALES_MIGRATION em
-- server/salesAttribution.ts). Este arquivo e copia para rodar manualmente
-- se preferir (psql / console do Render). Aditiva: so CREATE ... IF NOT EXISTS.
-- Nunca usar drizzle-kit push (ver incidente das 20 tabelas apagadas).
  CREATE TABLE IF NOT EXISTS sales_integrations (
    id              SERIAL PRIMARY KEY,
    "userId"        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "projectId"     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    provider        VARCHAR(20) NOT NULL,
    "webhookToken"  VARCHAR(64) NOT NULL UNIQUE,
    "verifySecret"  TEXT,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    "lastEventAt"   TIMESTAMPTZ,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_sales_integrations_project ON sales_integrations("projectId");

  CREATE TABLE IF NOT EXISTS sales_events (
    id                   SERIAL PRIMARY KEY,
    "integrationId"      INTEGER NOT NULL REFERENCES sales_integrations(id) ON DELETE CASCADE,
    "userId"             INTEGER NOT NULL,
    "projectId"          INTEGER NOT NULL,
    provider             VARCHAR(20) NOT NULL,
    "externalOrderId"    VARCHAR(200) NOT NULL,
    status               VARCHAR(20) NOT NULL,
    "amountCents"        BIGINT,
    currency             VARCHAR(8) NOT NULL DEFAULT 'BRL',
    "productId"          VARCHAR(200),
    "productName"        VARCHAR(200),
    "customerEmailHash"  VARCHAR(64),
    "utmSource"          VARCHAR(200),
    "utmMedium"          VARCHAR(200),
    "utmCampaign"        VARCHAR(200),
    "utmContent"         VARCHAR(200),
    "utmTerm"            VARCHAR(200),
    "trackingSrc"        VARCHAR(200),
    "trackingSck"        VARCHAR(200),
    "campaignId"         INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
    "attributionMethod"  VARCHAR(30),
    "occurredAt"         TIMESTAMPTZ NOT NULL,
    raw                  JSONB,
    "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("integrationId", "externalOrderId")
  );
  CREATE INDEX IF NOT EXISTS idx_sales_events_project ON sales_events("projectId", "occurredAt");
  CREATE INDEX IF NOT EXISTS idx_sales_events_campaign ON sales_events("campaignId");
