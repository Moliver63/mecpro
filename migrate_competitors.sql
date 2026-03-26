-- Migração segura: adiciona colunas novas sem perder dados existentes
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS "aiInsights"    TEXT,
  ADD COLUMN IF NOT EXISTS "aiGeneratedAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "aiAdsAnalyzed" INTEGER;

-- Migra insights que estavam em notes para aiInsights (se houver)
UPDATE competitors
SET "aiInsights" = notes
WHERE notes IS NOT NULL
  AND notes LIKE '%Formato%'   -- padrão do formato de insights da IA
  AND "aiInsights" IS NULL;

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_scraped_competitor ON scraped_ads("competitorId");
CREATE INDEX IF NOT EXISTS idx_scraped_project    ON scraped_ads("projectId");
CREATE INDEX IF NOT EXISTS idx_scraped_active     ON scraped_ads("isActive");
CREATE INDEX IF NOT EXISTS idx_scraped_adid       ON scraped_ads("adId") WHERE "adId" IS NOT NULL;

-- Coluna source em scraped_ads (para distinguir real vs estimado)
ALTER TABLE scraped_ads
  ADD COLUMN IF NOT EXISTS "source" VARCHAR(30) DEFAULT 'meta_api';

-- Marca anúncios estimados já existentes
UPDATE scraped_ads SET source = 'estimated' WHERE "adId" LIKE 'estimated_%' AND source = 'meta_api';
UPDATE scraped_ads SET source = 'scraping'  WHERE "adId" LIKE 'scraped_%'   AND source = 'meta_api';
UPDATE scraped_ads SET source = 'scraping'  WHERE "adId" LIKE 'regex_%'     AND source = 'meta_api';

SELECT 'Migração concluída com sucesso ✅' AS status;
