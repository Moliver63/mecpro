// ============ MARKETPLACE TABLES — adicionar ao schema.ts existente ============

import {
  pgTable, pgEnum, serial, text, varchar, integer,
  boolean, timestamp, numeric, jsonb, index
} from "drizzle-orm/pg-core";

// ── Enums ────────────────────────────────────────────────────────────────────
export const marketplaceNicheEnum = pgEnum("marketplace_niche", [
  "imobiliario", "servicos", "produtos_fisicos",
  "infoprodutos", "negocios_locais", "ecommerce",
  "saude_beleza", "educacao", "alimentacao", "outros"
]);

export const listingStatusEnum = pgEnum("listing_status", [
  "draft", "pending_review", "active", "paused", "rejected", "sold_out"
]);

export const boostTypeEnum = pgEnum("boost_type", [
  "featured_home", "featured_niche", "priority_search", "banner_top"
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending", "paid", "processing", "completed", "cancelled", "refunded"
]);

// ── Tabela: Listings (produtos/serviços no marketplace) ──────────────────────
export const marketplaceListings = pgTable("marketplace_listings", {
  id:              serial("id").primaryKey(),
  userId:          integer("userId").notNull(),           // FK → users.id
  campaignId:      integer("campaignId"),                 // FK → campaigns.id (opcional)
  projectId:       integer("projectId"),                  // FK → projects.id (opcional)

  // Identidade da oferta
  title:           varchar("title", { length: 255 }).notNull(),
  slug:            varchar("slug", { length: 300 }).notNull().unique(),
  niche:           marketplaceNicheEnum("niche").notNull(),
  status:          listingStatusEnum("status").default("draft").notNull(),

  // Precificação
  price:           numeric("price", { precision: 10, scale: 2 }),
  priceType:       varchar("priceType", { length: 30 }).default("fixed"), // fixed|monthly|negotiable|free
  currency:        varchar("currency", { length: 3 }).default("BRL"),
  commissionRate:  numeric("commissionRate", { precision: 5, scale: 2 }).default("10.00"), // %

  // Landing page gerada por IA (JSON com todas as seções)
  landingPage:     jsonb("landingPage"),                  // ver LandingPageData type abaixo
  landingPageHtml: text("landingPageHtml"),               // HTML estático gerado

  // Copy gerada
  headline:        text("headline"),
  subheadline:     text("subheadline"),
  description:     text("description"),
  benefits:        jsonb("benefits"),                     // string[]
  faq:             jsonb("faq"),                          // { q, a }[]
  testimonials:    jsonb("testimonials"),                 // { name, text, rating }[]
  ctaText:         varchar("ctaText", { length: 100 }),
  guarantee:       text("guarantee"),

  // Mídia
  imageUrl:        text("imageUrl"),
  videoUrl:        text("videoUrl"),
  thumbnailUrl:    text("thumbnailUrl"),

  // Contato/checkout
  checkoutUrl:     text("checkoutUrl"),
  whatsappNumber:  varchar("whatsappNumber", { length: 20 }),
  contactEmail:    varchar("contactEmail", { length: 255 }),
  checkoutType:    varchar("checkoutType", { length: 30 }), // stripe|mercadopago|pix|whatsapp|link

  // Geolocalização
  region:          varchar("region", { length: 100 }),
  city:            varchar("city", { length: 100 }),
  state:           varchar("state", { length: 2 }),
  isNational:      boolean("isNational").default(true),

  // Métricas
  views:           integer("views").default(0),
  clicks:          integer("clicks").default(0),
  conversions:     integer("conversions").default(0),
  revenue:         numeric("revenue", { precision: 12, scale: 2 }).default("0"),

  // IA
  aiScore:         integer("aiScore"),                    // 0-100 score de qualidade da landing
  aiSuggestions:   jsonb("aiSuggestions"),               // sugestões de melhoria
  lastOptimizedAt: timestamp("lastOptimizedAt"),

  // Timestamps
  publishedAt:     timestamp("publishedAt"),
  expiresAt:       timestamp("expiresAt"),
  createdAt:       timestamp("createdAt").defaultNow().notNull(),
  updatedAt:       timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({
  slugIdx:   index("listings_slug_idx").on(t.slug),
  nicheIdx:  index("listings_niche_idx").on(t.niche),
  statusIdx: index("listings_status_idx").on(t.status),
  userIdx:   index("listings_user_idx").on(t.userId),
}));

// ── Tabela: Boosts (destaque pago) ───────────────────────────────────────────
export const marketplaceBoosts = pgTable("marketplace_boosts", {
  id:          serial("id").primaryKey(),
  listingId:   integer("listingId").notNull(),
  userId:      integer("userId").notNull(),
  boostType:   boostTypeEnum("boostType").notNull(),
  startDate:   timestamp("startDate").notNull(),
  endDate:     timestamp("endDate").notNull(),
  price:       numeric("price", { precision: 8, scale: 2 }).notNull(),
  isActive:    boolean("isActive").default(true),
  paymentId:   varchar("paymentId", { length: 255 }),
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
});

// ── Tabela: Orders (pedidos/vendas) ──────────────────────────────────────────
export const marketplaceOrders = pgTable("marketplace_orders", {
  id:            serial("id").primaryKey(),
  listingId:     integer("listingId").notNull(),
  buyerEmail:    varchar("buyerEmail", { length: 255 }).notNull(),
  buyerName:     varchar("buyerName", { length: 255 }),
  buyerPhone:    varchar("buyerPhone", { length: 20 }),
  sellerId:      integer("sellerId").notNull(),           // FK → users.id
  status:        orderStatusEnum("status").default("pending").notNull(),
  amount:        numeric("amount", { precision: 10, scale: 2 }).notNull(),
  commission:    numeric("commission", { precision: 10, scale: 2 }),
  netAmount:     numeric("netAmount", { precision: 10, scale: 2 }),
  paymentMethod: varchar("paymentMethod", { length: 30 }),
  paymentId:     varchar("paymentId", { length: 255 }),
  paidAt:        timestamp("paidAt"),
  notes:         text("notes"),
  createdAt:     timestamp("createdAt").defaultNow().notNull(),
  updatedAt:     timestamp("updatedAt").defaultNow().notNull(),
});

// ── Tabela: Analytics de listing ─────────────────────────────────────────────
export const listingAnalytics = pgTable("listing_analytics", {
  id:        serial("id").primaryKey(),
  listingId: integer("listingId").notNull(),
  date:      varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  views:     integer("views").default(0),
  clicks:    integer("clicks").default(0),
  ctr:       numeric("ctr", { precision: 5, scale: 2 }),
  source:    varchar("source", { length: 50 }),          // direct|search|marketplace|ads
}, (t) => ({
  listingDateIdx: index("analytics_listing_date_idx").on(t.listingId, t.date),
}));

// ── Types TS ─────────────────────────────────────────────────────────────────
export type MarketplaceListing    = typeof marketplaceListings.$inferSelect;
export type InsertMarketplaceListing = typeof marketplaceListings.$inferInsert;
export type MarketplaceOrder      = typeof marketplaceOrders.$inferSelect;
export type MarketplaceBoost      = typeof marketplaceBoosts.$inferSelect;

export interface LandingPageData {
  sections: {
    hero:        { headline: string; subheadline: string; cta: string; imageUrl?: string };
    problem:     { title: string; points: string[] };
    solution:    { title: string; description: string };
    benefits:    { title: string; items: { icon: string; title: string; desc: string }[] };
    social:      { testimonials: { name: string; text: string; rating: number; avatar?: string }[] };
    pricing:     { title: string; price: string; installments?: string; guarantee: string };
    faq:         { items: { q: string; a: string }[] };
    finalCta:    { headline: string; cta: string };
  };
  theme:    { primaryColor: string; accentColor: string; font: string };
  niche:    string;
  aiScore:  number;
}
