/**
 * adminIntelligenceSchema.ts
 * Novas tabelas para o módulo de Inteligência de Campanhas do MECProAI.
 * Adicione estas definições ao seu schema.ts existente e rode as migrations.
 *
 * ARQUITETURA DE DADOS:
 *  campaignScores       — score calculado por campanha (imutável por cálculo)
 *  winnerPatterns       — parâmetros extraídos das campanhas vencedoras
 *  learningBase         — base de aprendizado por nicho/plataforma/objetivo
 *  mlDataset            — dataset limpo preparado para ML futuro
 *  intelligenceLog      — auditoria de toda ação de aprendizado
 */

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ─────────────────────────────────────────────────────────────────────────────
// 1. SCORES DE CAMPANHAS
// Score calculado para cada campanha. Imutável após cálculo — novo cálculo
// gera novo registro (histórico preservado).
// ─────────────────────────────────────────────────────────────────────────────
export const campaignScores = sqliteTable("campaign_scores", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  campaignId:   integer("campaign_id").notNull(),       // FK → campaigns.id
  userId:       integer("user_id").notNull(),            // FK → users.id
  projectId:    integer("project_id").notNull(),

  // Score final (0–100)
  scoreTotal:   real("score_total").notNull().default(0),

  // Sub-scores por dimensão (0–10 cada)
  scoreCtr:         real("score_ctr").default(0),
  scoreCpc:         real("score_cpc").default(0),
  scoreCpm:         real("score_cpm").default(0),
  scoreRoas:        real("score_roas").default(0),
  scoreConversion:  real("score_conversion").default(0),
  scoreCreative:    real("score_creative").default(0),    // avaliação criativo
  scoreConsistency: real("score_consistency").default(0), // consistência ao longo do tempo
  scoreScalability: real("score_scalability").default(0), // potencial de escala

  // Contexto da campanha no momento do cálculo
  platform:    text("platform"),    // meta | google | tiktok
  objective:   text("objective"),   // leads | sales | traffic | ...
  niche:       text("niche"),       // imobiliario | juridico | saude | ...
  budgetTotal: real("budget_total"),
  durationDays: integer("duration_days"),

  // Métricas brutas snapshot (para não depender do registro original)
  metricImpressions: real("metric_impressions").default(0),
  metricClicks:      real("metric_clicks").default(0),
  metricCtr:         real("metric_ctr").default(0),
  metricCpc:         real("metric_cpc").default(0),
  metricCpm:         real("metric_cpm").default(0),
  metricSpend:       real("metric_spend").default(0),
  metricRoas:        real("metric_roas").default(0),
  metricConversions: real("metric_conversions").default(0),
  metricLeads:       real("metric_leads").default(0),

  // Pesos usados no cálculo (JSON — permite rastrear qual versão do motor gerou)
  weightsUsed: text("weights_used"),  // JSON: { ctr: 0.25, cpc: 0.20, ... }
  engineVersion: text("engine_version").default("1.0"),

  // Ranking no momento do cálculo
  rankGlobal:    integer("rank_global"),
  rankByNiche:   integer("rank_by_niche"),
  rankByPlatform: integer("rank_by_platform"),
  isWinner:      integer("is_winner").default(0),  // 0|1 bool

  // Metadados
  calculatedAt: integer("calculated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  notes:        text("notes"),
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PADRÕES VENCEDORES (WINNER PATTERNS)
// Parâmetros extraídos das campanhas campeãs.
// Cada registro = um conjunto de parâmetros de uma campanha que venceu.
// ─────────────────────────────────────────────────────────────────────────────
export const winnerPatterns = sqliteTable("winner_patterns", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  campaignId:   integer("campaign_id").notNull(),
  scoreId:      integer("score_id").notNull(),   // FK → campaignScores.id
  userId:       integer("user_id").notNull(),
  projectId:    integer("project_id").notNull(),

  // Classificação do padrão
  platform:    text("platform").notNull(),
  objective:   text("objective").notNull(),
  niche:       text("niche"),
  segment:     text("segment"),      // B2B | B2C | local | nacional
  status:      text("status").default("active"),  // active | deprecated | archived

  // Parâmetros do criativo
  adFormat:        text("ad_format"),       // image | video | carousel | reel
  headlinePattern: text("headline_pattern"), // ex: "Problema → Solução"
  copyStructure:   text("copy_structure"),   // ex: "hook + benefício + CTA"
  ctaType:         text("cta_type"),         // LEARN_MORE | SHOP_NOW | ...
  mainPromise:     text("main_promise"),     // ex: "economia", "resultado rápido"
  triggerTypes:    text("trigger_types"),    // JSON: ["urgência","prova social",...]
  mediaTypes:      text("media_types"),      // JSON: ["video_curto","imagem_produto"]
  numVariations:   integer("num_variations"),

  // Parâmetros de público
  ageMin:      integer("age_min"),
  ageMax:      integer("age_max"),
  genders:     text("genders"),           // JSON: ["all"]|["male"]|["female"]
  interests:   text("interests"),         // JSON array
  locations:   text("locations"),         // JSON: ["BR"]|["SP","RJ"]
  audienceSize: text("audience_size"),    // broad | narrow | custom

  // Parâmetros de veiculação
  placements:      text("placements"),    // JSON: ["fb_feed","ig_reels",...]
  biddingStrategy: text("bidding_strategy"),
  optimizationGoal: text("optimization_goal"),
  budgetType:      text("budget_type"),   // daily | lifetime
  budgetRange:     text("budget_range"),  // low(<100) | mid(100-500) | high(500+)
  durationRange:   text("duration_range"), // short(<7d) | mid(7-30d) | long(30d+)
  scheduleType:    text("schedule_type"),  // always | scheduled

  // Score e peso do padrão
  patternScore:    real("pattern_score").default(0),  // 0–100
  confidenceLevel: real("confidence_level").default(0), // 0–1 (baseado em # de amostras)
  timesValidated:  integer("times_validated").default(1), // vezes que esse padrão apareceu como vencedor

  // Explicação gerada por IA
  whyItWon:     text("why_it_won"),       // texto explicativo
  keyFactors:   text("key_factors"),      // JSON: ["ctr alto","CPC baixo",...]
  recommendations: text("recommendations"), // JSON: sugestões para próximas campanhas

  // Metadados
  extractedAt: integer("extracted_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt:   integer("updated_at",   { mode: "timestamp" }).$defaultFn(() => new Date()),
  approvedByAdmin: integer("approved_by_admin").default(0), // 0|1 — admin confirma o padrão
  approvedAt:  integer("approved_at",  { mode: "timestamp" }),
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. BASE DE APRENDIZADO (LEARNING BASE)
// Inteligência agregada por nicho + plataforma + objetivo.
// É aqui que o MECProAI busca para sugerir parâmetros em novas campanhas.
// ─────────────────────────────────────────────────────────────────────────────
export const learningBase = sqliteTable("learning_base", {
  id:        integer("id").primaryKey({ autoIncrement: true }),

  // Chave de segmentação (combinação única — UPSERT por essa chave)
  platform:  text("platform").notNull(),
  objective: text("objective").notNull(),
  niche:     text("niche").default("geral"),
  segment:   text("segment").default("geral"),

  // Estatísticas agregadas
  sampleCount:    integer("sample_count").default(0),  // # de campanhas analisadas
  avgScore:       real("avg_score").default(0),
  bestScore:      real("best_score").default(0),
  avgCtr:         real("avg_ctr").default(0),
  avgCpc:         real("avg_cpc").default(0),
  avgCpm:         real("avg_cpm").default(0),
  avgRoas:        real("avg_roas").default(0),
  avgConversion:  real("avg_conversion").default(0),

  // Parâmetros mais comuns nas campanhas vencedoras (JSON arrays)
  topAdFormats:     text("top_ad_formats"),    // ["video","carousel"]
  topCtaTypes:      text("top_cta_types"),     // ["LEARN_MORE","SHOP_NOW"]
  topAgeRanges:     text("top_age_ranges"),    // ["25-44","18-34"]
  topPlacements:    text("top_placements"),    // ["ig_reels","fb_feed"]
  topTriggers:      text("top_triggers"),      // ["urgência","prova_social"]
  topCopyStructures: text("top_copy_structures"),
  topMediaTypes:    text("top_media_types"),
  topBudgetRanges:  text("top_budget_ranges"),
  topDurations:     text("top_durations"),
  topBidStrategies: text("top_bid_strategies"),

  // Correlações detectadas (Camada 2 — análise estatística)
  correlations: text("correlations"), // JSON: [{ feature: "video_format", impact: 0.82 }]
  clusters:     text("clusters"),     // JSON: clusters de campanhas similares

  // Recomendações atuais (geradas pelo motor ou por IA)
  currentRecommendations: text("current_recommendations"), // JSON estruturado
  recommendedTemplate:    text("recommended_template"),    // template de campanha ideal

  // Metadados de evolução
  version:     integer("version").default(1),
  lastUpdated: integer("last_updated", { mode: "timestamp" }).$defaultFn(() => new Date()),
  createdAt:   integer("created_at",   { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DATASET ML (Camada 3 — preparação para ML real)
// Cada linha = uma campanha com features normalizadas e label (score).
// Pronto para treino de modelos preditivos.
// ─────────────────────────────────────────────────────────────────────────────
export const mlDataset = sqliteTable("ml_dataset", {
  id:         integer("id").primaryKey({ autoIncrement: true }),
  campaignId: integer("campaign_id").notNull(),
  scoreId:    integer("score_id").notNull(),

  // Features (normalizadas 0–1)
  featurePlatform:     text("feature_platform"),
  featureObjective:    text("feature_objective"),
  featureNiche:        text("feature_niche"),
  featureAdFormat:     text("feature_ad_format"),
  featureAgeRange:     text("feature_age_range"),
  featureBudgetRange:  text("feature_budget_range"),
  featureDuration:     text("feature_duration"),
  featurePlacement:    text("feature_placement"),
  featureBidStrategy:  text("feature_bid_strategy"),
  featureCopyLength:   real("feature_copy_length"),    // 0–1 normalizado
  featureNumCreatives: real("feature_num_creatives"),  // 0–1 normalizado
  featureHasVideo:     integer("feature_has_video"),   // 0|1
  featureHasCarousel:  integer("feature_has_carousel"),
  featureUsedEmoji:    integer("feature_used_emoji"),
  featureUsedUrgency:  integer("feature_used_urgency"),
  featureUsedSocialProof: integer("feature_used_social_proof"),

  // Label (o que queremos prever)
  labelScore:    real("label_score").notNull(),   // score 0–100
  labelCtr:      real("label_ctr"),
  labelCpc:      real("label_cpc"),
  labelRoas:     real("label_roas"),
  labelIsWinner: integer("label_is_winner"),      // 0|1

  // Split para treino/teste
  splitGroup: text("split_group").default("train"), // train | test | validation

  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. LOG DE INTELIGÊNCIA (AUDITORIA)
// Rastreia toda ação de aprendizado, aprovação, atualização de base.
// ─────────────────────────────────────────────────────────────────────────────
export const intelligenceLog = sqliteTable("intelligence_log", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  adminId:   integer("admin_id"),
  action:    text("action").notNull(), // calculate_score | extract_pattern | update_learning | approve_pattern | reject_pattern
  entityType: text("entity_type"),     // campaign | pattern | learning_base
  entityId:  integer("entity_id"),
  payload:   text("payload"),          // JSON com detalhes da ação
  result:    text("result"),           // success | error
  message:   text("message"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION SQL (SQLite)
// Execute no banco para criar as tabelas:
// ─────────────────────────────────────────────────────────────────────────────
export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS campaign_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  score_total REAL NOT NULL DEFAULT 0,
  score_ctr REAL DEFAULT 0,
  score_cpc REAL DEFAULT 0,
  score_cpm REAL DEFAULT 0,
  score_roas REAL DEFAULT 0,
  score_conversion REAL DEFAULT 0,
  score_creative REAL DEFAULT 0,
  score_consistency REAL DEFAULT 0,
  score_scalability REAL DEFAULT 0,
  platform TEXT,
  objective TEXT,
  niche TEXT,
  segment TEXT,
  budget_total REAL,
  duration_days INTEGER,
  metric_impressions REAL DEFAULT 0,
  metric_clicks REAL DEFAULT 0,
  metric_ctr REAL DEFAULT 0,
  metric_cpc REAL DEFAULT 0,
  metric_cpm REAL DEFAULT 0,
  metric_spend REAL DEFAULT 0,
  metric_roas REAL DEFAULT 0,
  metric_conversions REAL DEFAULT 0,
  metric_leads REAL DEFAULT 0,
  weights_used TEXT,
  engine_version TEXT DEFAULT '1.0',
  rank_global INTEGER,
  rank_by_niche INTEGER,
  rank_by_platform INTEGER,
  is_winner INTEGER DEFAULT 0,
  calculated_at INTEGER DEFAULT (unixepoch()),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS winner_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  score_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  objective TEXT NOT NULL,
  niche TEXT,
  segment TEXT,
  status TEXT DEFAULT 'active',
  ad_format TEXT,
  headline_pattern TEXT,
  copy_structure TEXT,
  cta_type TEXT,
  main_promise TEXT,
  trigger_types TEXT,
  media_types TEXT,
  num_variations INTEGER,
  age_min INTEGER,
  age_max INTEGER,
  genders TEXT,
  interests TEXT,
  locations TEXT,
  audience_size TEXT,
  placements TEXT,
  bidding_strategy TEXT,
  optimization_goal TEXT,
  budget_type TEXT,
  budget_range TEXT,
  duration_range TEXT,
  schedule_type TEXT,
  pattern_score REAL DEFAULT 0,
  confidence_level REAL DEFAULT 0,
  times_validated INTEGER DEFAULT 1,
  why_it_won TEXT,
  key_factors TEXT,
  recommendations TEXT,
  extracted_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  approved_by_admin INTEGER DEFAULT 0,
  approved_at INTEGER
);

CREATE TABLE IF NOT EXISTS learning_base (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  objective TEXT NOT NULL,
  niche TEXT DEFAULT 'geral',
  segment TEXT DEFAULT 'geral',
  sample_count INTEGER DEFAULT 0,
  avg_score REAL DEFAULT 0,
  best_score REAL DEFAULT 0,
  avg_ctr REAL DEFAULT 0,
  avg_cpc REAL DEFAULT 0,
  avg_cpm REAL DEFAULT 0,
  avg_roas REAL DEFAULT 0,
  avg_conversion REAL DEFAULT 0,
  top_ad_formats TEXT,
  top_cta_types TEXT,
  top_age_ranges TEXT,
  top_placements TEXT,
  top_triggers TEXT,
  top_copy_structures TEXT,
  top_media_types TEXT,
  top_budget_ranges TEXT,
  top_durations TEXT,
  top_bid_strategies TEXT,
  correlations TEXT,
  clusters TEXT,
  current_recommendations TEXT,
  recommended_template TEXT,
  version INTEGER DEFAULT 1,
  last_updated INTEGER DEFAULT (unixepoch()),
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(platform, objective, niche, segment)
);

CREATE TABLE IF NOT EXISTS ml_dataset (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  score_id INTEGER NOT NULL,
  feature_platform TEXT,
  feature_objective TEXT,
  feature_niche TEXT,
  feature_ad_format TEXT,
  feature_age_range TEXT,
  feature_budget_range TEXT,
  feature_duration TEXT,
  feature_placement TEXT,
  feature_bid_strategy TEXT,
  feature_copy_length REAL,
  feature_num_creatives REAL,
  feature_has_video INTEGER,
  feature_has_carousel INTEGER,
  feature_used_emoji INTEGER,
  feature_used_urgency INTEGER,
  feature_used_social_proof INTEGER,
  label_score REAL NOT NULL,
  label_ctr REAL,
  label_cpc REAL,
  label_roas REAL,
  label_is_winner INTEGER,
  split_group TEXT DEFAULT 'train',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS intelligence_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  payload TEXT,
  result TEXT,
  message TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_campaign_scores_campaign ON campaign_scores(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_scores_niche ON campaign_scores(niche, platform, objective);
CREATE INDEX IF NOT EXISTS idx_campaign_scores_winner ON campaign_scores(is_winner);
CREATE INDEX IF NOT EXISTS idx_winner_patterns_niche ON winner_patterns(niche, platform, objective);
CREATE INDEX IF NOT EXISTS idx_learning_base_key ON learning_base(platform, objective, niche);
CREATE INDEX IF NOT EXISTS idx_ml_dataset_split ON ml_dataset(split_group, label_is_winner);
`;
