-- MECPro: Tabela consultas CPF/CNPJ
-- Execute uma vez no banco antes de subir o servidor

CREATE TABLE IF NOT EXISTS consultas (
  id               SERIAL PRIMARY KEY,
  "userId"         INTEGER NOT NULL,
  documento        VARCHAR(18) NOT NULL,
  tipo             VARCHAR(4) NOT NULL,
  "razaoSocial"    TEXT,
  "nomeFantasia"   TEXT,
  situacao         VARCHAR(100),
  porte            VARCHAR(100),
  "capitalSocial"  INTEGER,
  "dataAbertura"   VARCHAR(20),
  cnae             TEXT,
  email            VARCHAR(320),
  telefone         VARCHAR(50),
  endereco         TEXT,
  socios           TEXT,
  "totalProcessos" INTEGER DEFAULT 0,
  processos        TEXT,
  "fonteUsada"     VARCHAR(100),
  fontes           TEXT,
  "createdAt"      TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consultas_userId    ON consultas("userId");
CREATE INDEX IF NOT EXISTS idx_consultas_documento ON consultas(documento);
CREATE INDEX IF NOT EXISTS idx_consultas_createdAt ON consultas("createdAt" DESC);
