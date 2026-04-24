import {
  pgTable, pgEnum, serial, text, varchar, integer,
  timestamp, boolean
} from "drizzle-orm/pg-core";

// ============ ENUMS ============
export const roleEnum = pgEnum("role", ["user", "admin", "superadmin"]);
export const planEnum = pgEnum("plan", ["free", "basic", "premium", "vip"]);
export const projectStatusEnum = pgEnum("project_status", ["draft", "analyzing", "completed", "archived"]);
export const campaignObjectiveEnum = pgEnum("campaign_objective", ["leads", "sales", "branding", "traffic", "engagement"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "completed", "failed", "refunded"]);
export const intervalEnum = pgEnum("billing_interval", ["month", "year"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "canceled", "past_due", "trialing"]);
export const adminActionEnum = pgEnum("admin_action", ["PROMOTE_ADMIN", "DEMOTE_ADMIN", "PROMOTE_SUPERADMIN", "DEMOTE_SUPERADMIN"]);
export const adminRoleEnum = pgEnum("admin_role", ["admin", "superadmin"]);

// ============ USERS ============
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  emailVerified: integer("emailVerified").default(0).notNull(),
  loginMethod: varchar("loginMethod", { length: 64 }).default("email").notNull(),
  role: roleEnum("role").default("user").notNull(),
  plan: planEnum("plan").default("free").notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }).unique(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  suspendedAt: timestamp("suspendedAt"),
  suspendReason: text("suspendReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============ PROJECTS ============
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: projectStatusEnum("status").default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ============ CLIENT PROFILES (Módulo 1) ============
export const clientProfiles = pgTable("client_profiles", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().unique(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  niche: varchar("niche", { length: 255 }).notNull(),
  productService: text("productService").notNull(),
  targetAudience: text("targetAudience"),
  mainPain: text("mainPain"),
  desiredTransformation: text("desiredTransformation"),
  uniqueValueProposition: text("uniqueValueProposition"),
  mainObjections: text("mainObjections"),
  campaignObjective: campaignObjectiveEnum("campaignObjective").default("leads").notNull(),
  monthlyBudget: integer("monthlyBudget"),
  websiteUrl: varchar("websiteUrl", { length: 500 }),
  socialLinks: text("socialLinks"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ClientProfile = typeof clientProfiles.$inferSelect;
export type InsertClientProfile = typeof clientProfiles.$inferInsert;

// ============ COMPETITORS (Módulo 2) ============
export const competitors = pgTable("competitors", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  websiteUrl: varchar("websiteUrl", { length: 500 }),
  facebookPageUrl: varchar("facebookPageUrl", { length: 500 }),
  facebookPageId: varchar("facebookPageId", { length: 100 }),
  instagramUrl: varchar("instagramUrl", { length: 500 }),
  googleAdsUrl: varchar("googleAdsUrl", { length: 500 }),
  notes: text("notes"),
  aiInsights:     text("aiInsights"),
  aiGeneratedAt:  timestamp("aiGeneratedAt"),
  aiAdsAnalyzed:  integer("aiAdsAnalyzed"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Competitor = typeof competitors.$inferSelect;
export type InsertCompetitor = typeof competitors.$inferInsert;

// ============ ADS SCRAPED (Módulo 2 - dados extraídos) ============
export const scrapedAds = pgTable("scraped_ads", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitorId").notNull(),
  projectId: integer("projectId").notNull(),
  platform: varchar("platform", { length: 50 }).notNull(), // meta, google
  adId: varchar("adId", { length: 255 }),
  adType: varchar("adType", { length: 50 }), // image, video, carousel
  headline: text("headline"),
  bodyText: text("bodyText"),
  cta: varchar("cta", { length: 100 }),
  imageUrl: text("imageUrl"),
  videoUrl: text("videoUrl"),
  landingPageUrl: text("landingPageUrl"),
  whatsappPhone: varchar("whatsappPhone", { length: 50 }),  // WhatsApp vinculado à conta Meta
  isActive: integer("isActive").default(1).notNull(),
  startDate: timestamp("startDate"),
  rawData: text("rawData"),
  pageName:            varchar("pageName", { length: 255 }),
  pageId:              varchar("pageId", { length: 100 }),
  publisherPlatforms:  text("publisherPlatforms"),
  demographicData:     text("demographicData"),
  regionData:          text("regionData"),
  spendRange:          varchar("spendRange", { length: 100 }),
  reachEstimate:       varchar("reachEstimate", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScrapedAd = typeof scrapedAds.$inferSelect;
export type InsertScrapedAd = typeof scrapedAds.$inferInsert;

// ============ MARKET ANALYSIS (Módulo 3) ============
export const marketAnalyses = pgTable("market_analyses", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().unique(),
  competitiveGaps: text("competitiveGaps"),
  unexploredOpportunities: text("unexploredOpportunities"),
  suggestedPositioning: text("suggestedPositioning"),
  competitiveMap: text("competitiveMap"),
  threats: text("threats"),
  aiModel: varchar("aiModel", { length: 100 }),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type MarketAnalysis = typeof marketAnalyses.$inferSelect;
export type InsertMarketAnalysis = typeof marketAnalyses.$inferInsert;

// ============ CAMPAIGNS (Módulo 4) ============
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  objective: campaignObjectiveEnum("objective").default("leads").notNull(),
  platform: varchar("platform", { length: 50 }).notNull(), // meta, google, both
  suggestedBudgetDaily: integer("suggestedBudgetDaily"),
  suggestedBudgetMonthly: integer("suggestedBudgetMonthly"),
  durationDays: integer("durationDays"),
  strategy: text("strategy"),
  adSets: text("adSets"),
  creatives: text("creatives"),
  conversionFunnel: text("conversionFunnel"),
  executionPlan: text("executionPlan"),
  aiPromptUsed: text("aiPromptUsed"),
  aiResponse: text("aiResponse"),
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  // Status de publicação nas plataformas de ads
  publishStatus:  varchar("publishStatus",  { length: 20 }).default("draft"),  // draft|pending|processing|success|error
  publishedAt:    timestamp("publishedAt"),
  publishError:   text("publishError"),
  metaCampaignId: varchar("metaCampaignId", { length: 100 }),
  metaAdSetId:    varchar("metaAdSetId",    { length: 100 }),
  metaAdId:       varchar("metaAdId",       { length: 100 }),
  metaCreativeId:   varchar("metaCreativeId",   { length: 100 }),
  googleCampaignId: varchar("googleCampaignId", { length: 100 }),
  googleAdGroupId:  varchar("googleAdGroupId",  { length: 100 }),
  tiktokCampaignId: varchar("tiktokCampaignId", { length: 100 }),
  tiktokAdGroupId:  varchar("tiktokAdGroupId",  { length: 100 }),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

// ============ SUBSCRIPTION PLANS ============
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  price: integer("price").notNull(),
  billingInterval: intervalEnum("billingInterval").notNull(),
  maxProjects: integer("maxProjects"),
  maxCompetitors: integer("maxCompetitors"),
  hasAiAnalysis: integer("hasAiAnalysis").default(0).notNull(),
  hasMetaIntegration: integer("hasMetaIntegration").default(0).notNull(),
  hasGoogleIntegration: integer("hasGoogleIntegration").default(0).notNull(),
  hasExportPdf: integer("hasExportPdf").default(0).notNull(),
  hasExportXlsx: integer("hasExportXlsx").default(0).notNull(),
  stripePriceId: varchar("stripePriceId", { length: 255 }),
  whatsappPhone: varchar("whatsappPhone", { length: 50 }),  // WhatsApp vinculado à conta Meta
  isActive: integer("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = typeof subscriptionPlans.$inferInsert;

// ============ USER SUBSCRIPTIONS ============
export const userSubscriptions = pgTable("user_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  planId: integer("planId").notNull(),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  status: subscriptionStatusEnum("status").notNull(),
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  cancelAtPeriodEnd: integer("cancelAtPeriodEnd").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type InsertUserSubscription = typeof userSubscriptions.$inferInsert;

// ============ PAYMENT HISTORY ============
export const paymentHistory = pgTable("payment_history", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  subscriptionId: integer("subscriptionId"),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).default("BRL").notNull(),
  status: paymentStatusEnum("status").default("pending").notNull(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  stripeInvoiceId: varchar("stripeInvoiceId", { length: 255 }),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PaymentHistory = typeof paymentHistory.$inferSelect;
export type InsertPaymentHistory = typeof paymentHistory.$inferInsert;

// ============ API INTEGRATIONS ============
export const apiIntegrations = pgTable("api_integrations", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  provider: varchar("provider", { length: 50 }).notNull(), // meta, google, tiktok, gemini
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  adAccountId: varchar("adAccountId", { length: 100 }),   // Meta: act_xxx
  appId: varchar("appId", { length: 100 }),               // Meta/TikTok app id
  appSecret: varchar("appSecret", { length: 255 }),       // Meta/TikTok app secret
  accountId: varchar("accountId", { length: 100 }),       // TikTok advertiserId / Google customerId
  developerToken: varchar("developerToken", { length: 255 }), // Google Ads developer token
  tokenExpiry: timestamp("tokenExpiry"),                  // TikTok/Google token expiry
  tokenExpiresAt: timestamp("tokenExpiresAt"),            // OAuth token expiry (Meta)
  whatsappPhone: varchar("whatsappPhone", { length: 50 }),  // WhatsApp vinculado à conta Meta
  isActive: integer("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ApiIntegration = typeof apiIntegrations.$inferSelect;
export type InsertApiIntegration = typeof apiIntegrations.$inferInsert;

// ============ NOTIFICATIONS ============
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).default("info").notNull(),
  read: integer("read").default(0).notNull(),
  actionUrl: varchar("actionUrl", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ============ ADMIN ============
export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: serial("id").primaryKey(),
  action: adminActionEnum("action").notNull(),
  performedByUserId: integer("performedByUserId").notNull(),
  targetUserId: integer("targetUserId").notNull(),
  ip: varchar("ip", { length: 45 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const adminInvites = pgTable("admin_invites", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  role: adminRoleEnum("role").default("admin").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  invitedBy: integer("invitedBy").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============ AUTH TOKENS ============
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: integer("used").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  token: varchar("token", { length: 500 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  revoked: integer("revoked").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============ ACTIVITY LOGS ============
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  entity: varchar("entity", { length: 100 }),
  entityId: integer("entityId"),
  details: text("details"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============ LESSON PROGRESS ============
export const lessonProgress = pgTable("lesson_progress", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  courseSlug: varchar("courseSlug", { length: 100 }).notNull(),
  lessonId: varchar("lessonId", { length: 50 }).notNull(),
  completed: integer("completed").default(0).notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LessonProgress = typeof lessonProgress.$inferSelect;
export type InsertLessonProgress = typeof lessonProgress.$inferInsert;
