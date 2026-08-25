-- Migração: cache de uploads de imagem por SHA256
-- Aplicação: execute no PostgreSQL do MECProAI
-- Data: 2026-08-25

CREATE TABLE IF NOT EXISTS image_upload_cache (
  id            SERIAL PRIMARY KEY,
  sha256        VARCHAR(64) NOT NULL UNIQUE,
  cloud_url     TEXT NOT NULL,
  file_name     VARCHAR(255),
  bytes         INTEGER,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_upload_cache_sha256 
  ON image_upload_cache(sha256);

CREATE INDEX IF NOT EXISTS idx_image_upload_cache_created_at 
  ON image_upload_cache(created_at);

COMMENT ON TABLE image_upload_cache IS 
  'Cache de imagens já enviadas ao Cloudinary. Evita upload duplicado quando o mesmo arquivo é enviado múltiplas vezes via MCP.';
