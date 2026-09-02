-- MECPro: Tabela fine_tuning_examples
-- Infraestrutura de coleta/validação de dataset de fine-tuning.
-- NÃO dispara treinamento — apenas armazena exemplos candidatos.
--
-- Execute UMA VEZ manualmente no banco (psql / console do Render)
-- antes de usar server/fineTuningService.ts. Mesmo padrão de
-- migration_consultas.sql: script pontual, não roda no boot,
-- não usa drizzle-kit push (schema.ts real ainda tem tabelas de
-- produção não declaradas — ver server/schema.ts e pendência
-- registrada em SYSTEM_MEMORY.md, item 18).

CREATE TYPE fine_tuning_status AS ENUM (
  'generated',
  'corrected',
  'approved',
  'rejected',
  'high_performer',
  'dataset_rejected_fact_guard'
);

CREATE TABLE IF NOT EXISTS fine_tuning_examples (
  id                      SERIAL PRIMARY KEY,
  project_id              INTEGER NOT NULL,
  campaign_id             INTEGER,
  segment                 VARCHAR(50),
  task_type               VARCHAR(50) NOT NULL,

  input_context           JSONB NOT NULL,
  original_output         TEXT NOT NULL,
  corrected_output        TEXT,
  approved_output         TEXT,

  status                  fine_tuning_status NOT NULL DEFAULT 'generated',
  error_type              VARCHAR(60),

  fact_guard_passed       BOOLEAN,
  quality_gate_passed     BOOLEAN,

  performance_metrics     JSONB,
  training_quality_score  REAL DEFAULT 0,

  model_source            VARCHAR(50),

  created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fine_tuning_examples_project_id
  ON fine_tuning_examples(project_id);
CREATE INDEX IF NOT EXISTS idx_fine_tuning_examples_status
  ON fine_tuning_examples(status);
CREATE INDEX IF NOT EXISTS idx_fine_tuning_examples_segment
  ON fine_tuning_examples(segment);
CREATE INDEX IF NOT EXISTS idx_fine_tuning_examples_quality_score
  ON fine_tuning_examples(training_quality_score DESC);
