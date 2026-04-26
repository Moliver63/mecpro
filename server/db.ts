import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, count, desc, eq, sql } from "drizzle-orm";
import {
  users, projects, clientProfiles, competitors, scrapedAds,
  marketAnalyses, campaigns, subscriptionPlans, userSubscriptions,
  paymentHistory, notifications, adminAuditLogs, adminInvites, planChangeRequests,
  emailVerificationTokens, passwordResetTokens, refreshTokens, activityLogs,
  consultas,
  apiIntegrations,
  lessonProgress,
  appSettings,
  type InsertUser, type InsertProject, type InsertClientProfile,
  type InsertCompetitor, type InsertCampaign, type InsertPaymentHistory,
} from "./schema";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[DB] Failed to connect:", error);
    }
  }
  return _db;
}

// Expõe o pool pg para migrations de SQL puro
export async function getPool(): Promise<Pool | null> {
  await getDb(); // garante inicialização
  return _pool;
}

// ============ USERS ============
export async function getUserById(id: number) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return r[0] ?? null;
}
export async function getUserByEmail(email: string) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return r[0] ?? null;
}
export async function getAllUsers() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}
export async function registerUser(email: string, password: string, name: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const existing = await getUserByEmail(email);
  if (existing) throw new Error("Email já cadastrado");
  const passwordHash = await bcrypt.hash(password, 10);
  const r = await db.insert(users).values({ email, name, passwordHash, loginMethod: "email" }).returning({ id: users.id });
  return getUserById(r[0].id);
}
export async function loginUser(email: string, password: string) {
  const user = await getUserByEmail(email);
  if (!user || !user.passwordHash) throw new Error("Credenciais inválidas");
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Credenciais inválidas");
  return user;
}
/** B04 FIX: Altera a senha do usuário após verificar a senha atual */
export async function changeUserPassword(userId: number, currentPassword: string, newPassword: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const user = await getUserById(userId);
  if (!user) throw new Error("Usuário não encontrado");
  if (!user.passwordHash) throw new Error("Esta conta usa login social. Defina uma senha pelo fluxo de redefinição.");
  if (newPassword.length < 8) throw new Error("A nova senha deve ter no mínimo 8 caracteres");
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new Error("Senha atual incorreta");
  const hash = await bcrypt.hash(newPassword, 12);
  await db.update(users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(users.id, userId));
  return { success: true };
}

export async function updateUserRole(userId: number, role: "user" | "admin" | "superadmin") {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
}
export async function findOrCreateUserByProvider(profile: { openId: string; email: string; name?: string; loginMethod?: string }) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  let user = await db.select().from(users).where(eq(users.openId, profile.openId)).limit(1).then(r => r[0] ?? null);
  if (user) { await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id)); return getUserById(user.id); }
  user = await getUserByEmail(profile.email);
  if (user) { await db.update(users).set({ openId: profile.openId, loginMethod: profile.loginMethod ?? "google", lastSignedIn: new Date() }).where(eq(users.id, user.id)); return getUserById(user.id); }
  const r = await db.insert(users).values({ openId: profile.openId, email: profile.email, name: profile.name, loginMethod: profile.loginMethod ?? "google" }).returning({ id: users.id });
  return getUserById(r[0].id);
}

// ============ PROJECTS ============
export async function getProjectsByUserId(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt));
}
export async function getProjectById(id: number) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return r[0] ?? null;
}
export async function createProject(data: InsertProject) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const r = await db.insert(projects).values(data).returning({ id: projects.id });
  return getProjectById(r[0].id);
}
export async function updateProject(id: number, data: Partial<InsertProject>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.update(projects).set({ ...data, updatedAt: new Date() }).where(eq(projects.id, id));
  return getProjectById(id);
}
export async function deleteProject(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.delete(projects).where(eq(projects.id, id));
}
export async function getAllProjects() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(projects).orderBy(desc(projects.createdAt));
}

// ============ CLIENT PROFILES ============
export async function getClientProfileByProjectId(projectId: number) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(clientProfiles).where(eq(clientProfiles.projectId, projectId)).limit(1);
  return r[0] ?? null;
}
export async function upsertClientProfile(data: InsertClientProfile) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const existing = await getClientProfileByProjectId(data.projectId);
  if (existing) {
    await db.update(clientProfiles).set({ ...data, updatedAt: new Date() }).where(eq(clientProfiles.projectId, data.projectId));
  } else {
    await db.insert(clientProfiles).values(data);
  }
  return getClientProfileByProjectId(data.projectId);
}

// ============ COMPETITORS ============
export async function getCompetitorsByProjectId(projectId: number) {
  const db = await getDb(); if (!db) return [];

  const comps = await db.select({
    id:              competitors.id,
    name:            competitors.name,
    facebookPageId:  competitors.facebookPageId,
    facebookPageUrl: competitors.facebookPageUrl,
    instagramUrl:    competitors.instagramUrl,
    websiteUrl:      competitors.websiteUrl,
    googleAdsUrl:    competitors.googleAdsUrl,
    aiInsights:      (competitors as any).aiInsights,
    aiGeneratedAt:   (competitors as any).aiGeneratedAt,
    aiAdsAnalyzed:   (competitors as any).aiAdsAnalyzed,
    notes:           competitors.notes,
    createdAt:       competitors.createdAt,
  })
  .from(competitors)
  .where(eq(competitors.projectId, projectId))
  .orderBy(competitors.createdAt);

  // Para cada concorrente, busca anúncios e calcula adsCount
  const result = await Promise.all(comps.map(async (c) => {
    const ads = await db.select()
      .from(scrapedAds)
      .where(eq(scrapedAds.competitorId, c.id))
      .orderBy(desc(scrapedAds.createdAt))
      .limit(50);

    // Expõe rawData.source como campo de topo para o frontend usar diretamente
    const adsWithSource = ads.map((a: any) => {
      let parsedSource = "unknown";
      try { parsedSource = JSON.parse(a.rawData || "{}").source || "unknown"; } catch {}
      return { ...a, source: parsedSource };
    });

    return {
      ...c,
      adsCount:   ads.length,
      scrapedAds: adsWithSource,
    };
  }));

  return result;
}
export async function createCompetitor(data: InsertCompetitor) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const r = await db.insert(competitors).values(data).returning({ id: competitors.id });
  return r[0];
}
export async function deleteCompetitor(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.delete(competitors).where(eq(competitors.id, id));
}
export async function updateCompetitor(id: number, data: Partial<{
  name: string;
  facebookPageId:  string | null;
  facebookPageUrl: string | null;
  instagramUrl:    string | null;
  tiktokUrl:       string | null;
  googleAdsUrl:    string | null;
  googleAdsQuery:  string | null;
  websiteUrl:      string | null;
  notes:           string | null;
}>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  // Filtra campos undefined para não sobrescrever valores existentes acidentalmente
  const clean = Object.fromEntries(
    Object.entries(data).filter(([_, v]) => v !== undefined)
  );
  const r = await db.update(competitors).set(clean as any).where(eq(competitors.id, id)).returning();
  return r[0];
}

// ============ CAMPAIGNS ============
export async function getCampaignsByProjectId(projectId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(campaigns).where(eq(campaigns.projectId, projectId)).orderBy(desc(campaigns.generatedAt));
}
export async function getCampaignById(id: number) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return r[0] ?? null;
}
export async function createCampaign(data: InsertCampaign) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const r = await db.insert(campaigns).values(data).returning({ id: campaigns.id });
  return getCampaignById(r[0].id);
}
export async function updateCampaign(id: number, data: Partial<InsertCampaign>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.update(campaigns).set({ ...data, updatedAt: new Date() }).where(eq(campaigns.id, id));
  return getCampaignById(id);
}

export async function updateCampaignField(id: number, field: "creatives" | "adSets" | "strategy" | "aiResponse", value: string) {
  return updateCampaign(id, { [field]: value } as any);
}

// ============ SUBSCRIPTION PLANS ============
export async function getAllPlans() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, 1)).orderBy(subscriptionPlans.price);
}
export async function getPlanBySlug(slug: string) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, slug)).limit(1);
  return r[0] ?? null;
}

// ============ NOTIFICATIONS ============
export async function getNotificationsByUserId(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
}
export async function markNotificationRead(id: number) {
  const db = await getDb(); if (!db) return;
  await db.update(notifications).set({ read: 1 }).where(eq(notifications.id, id));
}

// ============ ADMIN ============
export async function promoteToAdmin(targetUserId: number, performedByUserId: number, ip?: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.update(users).set({ role: "admin", updatedAt: new Date() }).where(eq(users.id, targetUserId));
  await db.insert(adminAuditLogs).values({ action: "PROMOTE_ADMIN", performedByUserId, targetUserId, ip });
}
export async function demoteFromAdmin(targetUserId: number, performedByUserId: number, ip?: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.update(users).set({ role: "user", updatedAt: new Date() }).where(eq(users.id, targetUserId));
  await db.insert(adminAuditLogs).values({ action: "DEMOTE_ADMIN", performedByUserId, targetUserId, ip });
}
export async function listAllAdmins() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(users).where(sql`${users.role} IN ('admin', 'superadmin')`).orderBy(users.createdAt);
}
export async function createAdminInvite(email: string, role: "admin" | "superadmin", invitedBy: number) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const token = crypto.randomBytes(24).toString("hex"); // 48-char hex seguro
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48h
  await db.insert(adminInvites).values({ email, role, token, expiresAt, invitedBy });
  return token;
}
export async function getAdminInviteByToken(token: string) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(adminInvites).where(eq(adminInvites.token, token)).limit(1);
  return r[0] ?? null;
}
export async function listAdminInvites() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(adminInvites).orderBy(desc(adminInvites.createdAt));
}

// ============ ACTIVITY LOG ============
export async function logActivity(userId: number, action: string, entity?: string, entityId?: number, details?: string) {
  const db = await getDb(); if (!db) return;
  await db.insert(activityLogs).values({ userId, action, entity, entityId, details }).catch(() => {});
}

// ============ EMAIL VERIFICATION ============
/** Gera um token seguro de 64 chars hex (32 bytes), remove tokens anteriores e armazena com expiração de 24h */
export async function createEmailVerificationToken(userId: number): Promise<string> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const token = crypto.randomBytes(32).toString("hex"); // 64-char hex, criptograficamente seguro
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 horas
  // Remove tokens anteriores (válidos ou expirados) para esse usuário
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
  await db.insert(emailVerificationTokens).values({ userId, token, expiresAt });
  return token;
}

/** Valida o token de verificação, marca o e-mail como verificado e remove o token usado */
export async function verifyEmailToken(token: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!token || token.length < 32) return null; // guard básico

  const r = await db.select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.token, token))
    .limit(1);
  const row = r[0];
  if (!row) return null;

  // Token expirado → limpa e retorna null
  if (row.expiresAt < new Date()) {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, row.id));
    return null;
  }

  // Marca e-mail como verificado e remove o token (one-time use)
  await db.update(users)
    .set({ emailVerified: 1, updatedAt: new Date() })
    .where(eq(users.id, row.userId));
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, row.id));

  return getUserById(row.userId);
}

/** Limpa tokens de verificação expirados de todos os usuários (útil para cron job de manutenção) */
export async function purgeExpiredVerificationTokens(): Promise<number> {
  const db = await getDb(); if (!db) return 0;
  const result = await db.delete(emailVerificationTokens)
    .where(sql`${emailVerificationTokens.expiresAt} < NOW()`);
  return (result as any).rowCount ?? 0;
}

// ============ PASSWORD RESET ============
/** Gera token de reset de senha (64-char hex), invalida tokens anteriores, expira em 1h */
export async function createPasswordResetToken(email: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const user = await getUserByEmail(email);
  if (!user) return null; // Não revela se o e-mail existe (segurança)

  const token = crypto.randomBytes(32).toString("hex"); // 64-char hex seguro
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hora

  // Invalida todos os tokens de reset anteriores desse usuário
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
  await db.insert(passwordResetTokens).values({ userId: user.id, token, expiresAt });

  return { token, user };
}

/** Valida o token de reset, faz hash da nova senha e atualiza o usuário */
export async function resetPasswordWithToken(token: string, newPassword: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!token || token.length < 32) return null; // guard básico
  if (!newPassword || newPassword.length < 8) throw new Error("A senha deve ter no mínimo 8 caracteres");

  const r = await db.select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .limit(1);
  const row = r[0];

  // Token inválido ou expirado
  if (!row || row.expiresAt < new Date()) {
    if (row) await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, row.id)); // limpa expirado
    return null;
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await db.update(users)
    .set({ passwordHash: hash, updatedAt: new Date() })
    .where(eq(users.id, row.userId));

  // Remove o token após uso (one-time use)
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, row.id));

  return getUserById(row.userId);
}

/** Revoga todos os tokens de reset pendentes para um usuário (ex: logout forçado, mudança de segurança) */
export async function revokePasswordResetTokens(userId: number): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
}

/** Limpa tokens de reset expirados (útil para cron job de manutenção) */
export async function purgeExpiredPasswordTokens(): Promise<number> {
  const db = await getDb(); if (!db) return 0;
  const result = await db.delete(passwordResetTokens)
    .where(sql`${passwordResetTokens.expiresAt} < NOW()`);
  return (result as any).rowCount ?? 0;
}

// ============ OAUTH UPSERT ============
export async function upsertOAuthUser(profile: { email: string; name?: string; openId?: string; loginMethod?: string; avatarUrl?: string }) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  let user = await getUserByEmail(profile.email);
  if (user) {
    await db.update(users).set({
      openId: profile.openId,
      loginMethod: profile.loginMethod ?? "google",
      emailVerified: 1,
      lastSignedIn: new Date(),
      updatedAt: new Date(),
    }).where(eq(users.id, user.id));
    return getUserById(user.id) as Promise<NonNullable<typeof user>>;
  }
  const r = await db.insert(users).values({
    email: profile.email,
    name: profile.name ?? profile.email.split("@")[0],
    passwordHash: "",
    openId: profile.openId,
    loginMethod: profile.loginMethod ?? "google",
    emailVerified: 1,
    role: "user",
    plan: "free",
  }).returning();
  return getUserById(r[0].id) as Promise<NonNullable<typeof user>>;
}

// ── AI / Competitors ──
export async function getCompetitorById(id: number) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(competitors).where(eq(competitors.id, id)).limit(1);
  return r[0] || null;
}

export async function getScrapedAdsByCompetitor(competitorId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(scrapedAds).where(eq(scrapedAds.competitorId, competitorId)).orderBy(desc(scrapedAds.createdAt));
}

export async function getScrapedAdByAdId(adId: string) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select({ id: scrapedAds.id })
    .from(scrapedAds).where(eq(scrapedAds.adId, adId)).limit(1);
  return r[0] || null;
}

export async function createScrapedAd(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const r = await db.insert(scrapedAds).values(data).returning({ id: scrapedAds.id });
  return r[0];
}

export async function upsertScrapedAd(data: any) {
  if (data.adId) {
    const existing = await getScrapedAdByAdId(data.adId);
    if (existing) {
      await updateScrapedAd(existing.id, {
        isActive:  data.isActive ?? 1,
        rawData:   data.rawData ?? null,
        ...(data.pageName           ? { pageName:           data.pageName }           : {}),
        ...(data.pageId             ? { pageId:             data.pageId }             : {}),
        ...(data.publisherPlatforms ? { publisherPlatforms: data.publisherPlatforms } : {}),
        ...(data.demographicData    ? { demographicData:    data.demographicData }    : {}),
        ...(data.regionData         ? { regionData:         data.regionData }         : {}),
        ...(data.spendRange         ? { spendRange:         data.spendRange }         : {}),
        ...(data.reachEstimate      ? { reachEstimate:      data.reachEstimate }      : {}),
      } as any);
      return existing;
    }
  }
  return createScrapedAd(data);
}

export async function updateScrapedAd(id: number, data: { isActive?: number; rawData?: string | null }) {
  const db = await getDb(); if (!db) return;
  await db.update(scrapedAds).set(data).where(eq(scrapedAds.id, id));
}

export async function deleteScrapedAd(id: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(scrapedAds).where(eq(scrapedAds.id, id));
}

export async function deleteScrapedAdsByCompetitor(competitorId: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(scrapedAds).where(eq(scrapedAds.competitorId, competitorId));
}

export async function updateCompetitorInsights(id: number, insights: string, adsAnalyzed?: number) {
  const db = await getDb(); if (!db) return;
  await db.update(competitors).set({ aiInsights: insights, aiGeneratedAt: new Date(), aiAdsAnalyzed: adsAnalyzed ?? null } as any).where(eq(competitors.id, id));
}

// ── Market Analysis ──
export async function getMarketAnalysis(projectId: number) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(marketAnalyses).where(eq(marketAnalyses.projectId, projectId)).limit(1);
  return r[0] || null;
}

export async function upsertMarketAnalysis(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const existing = await getMarketAnalysis(data.projectId);
  if (existing) {
    const r = await db.update(marketAnalyses).set({ ...data, updatedAt: new Date() }).where(eq(marketAnalyses.projectId, data.projectId)).returning();
    return r[0];
  }
  const r = await db.insert(marketAnalyses).values(data).returning();
  return r[0];
}

export async function getClientProfile(projectId: number) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(clientProfiles).where(eq(clientProfiles.projectId, projectId)).limit(1);
  return r[0] || null;
}

// ── Admin extra ──
export async function suspendUser(userId: number, reason?: string) {
  const db = await getDb(); if (!db) return;
  await db.update(users).set({ status: "suspended", suspendedAt: new Date(), suspendReason: reason || null, updatedAt: new Date() } as any).where(eq(users.id, userId));
}
export async function unsuspendUser(userId: number) {
  const db = await getDb(); if (!db) return;
  await db.update(users).set({ status: "active", suspendedAt: null, suspendReason: null, updatedAt: new Date() } as any).where(eq(users.id, userId));
}
export async function deleteUser(userId: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(users).where(eq(users.id, userId));
}
export async function updateUserPlan(userId: number, plan: "free"|"basic"|"premium"|"vip") {
  const db = await getDb(); if (!db) return;
  await db.update(users).set({ plan, updatedAt: new Date() }).where(eq(users.id, userId));
}
export async function deleteInvite(id: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(adminInvites).where(eq(adminInvites.id, id));
}
export async function getAllPlansAdmin() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(subscriptionPlans).orderBy(subscriptionPlans.price);
}
export async function upsertPlan(data: any) {
  const db = await getDb(); if (!db) return null;
  const payload = { ...data, updatedAt: new Date() };
  delete payload.id;
  if (data.id) {
    const r = await db.update(subscriptionPlans).set(payload).where(eq(subscriptionPlans.id, data.id)).returning();
    return r[0];
  }
  const r = await db.insert(subscriptionPlans).values({ ...payload, createdAt: new Date() }).returning();
  return r[0];
}
export async function getAllSubscriptions() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(userSubscriptions).orderBy(desc(userSubscriptions.createdAt));
}
export async function getAllPayments() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(paymentHistory).orderBy(desc(paymentHistory.createdAt));
}
export async function getAdminStats() {
  const db = await getDb(); if (!db) return { totalUsers: 0, newUsersMonth: 0, totalProjects: 0, activeProjects: 0, premiumUsers: 0, freeUsers: 0, activeSubsCount: 0, totalRevenue: 0, revenueMonth: 0, planBreakdown: { free: 0, basic: 0, premium: 0, vip: 0 } };
  const allUsers   = await db.select().from(users);
  const allProjects = await db.select().from(projects);
  const allSubs    = await db.select().from(userSubscriptions);
  const allPayments = await db.select().from(paymentHistory);
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    totalUsers:      allUsers.length,
    newUsersMonth:   allUsers.filter(u => new Date((u as any).createdAt) >= thisMonth).length,
    totalProjects:   allProjects.length,
    activeProjects:  allProjects.filter(p => p.status !== "archived").length,
    premiumUsers:    allUsers.filter(u => ["premium","vip"].includes(u.plan)).length,
    freeUsers:       allUsers.filter(u => u.plan === "free").length,
    activeSubsCount: allSubs.filter(s => s.status === "active").length,
    totalRevenue:    allPayments.filter(p => p.status === "completed").reduce((acc: number, p: any) => acc + (Number(p.amount) || 0), 0),
    revenueMonth:    allPayments.filter(p => p.status === "completed" && new Date((p as any).createdAt) >= thisMonth).reduce((acc: number, p: any) => acc + (Number(p.amount) || 0), 0),
    planBreakdown: {
      free:    allUsers.filter(u => u.plan === "free").length,
      basic:   allUsers.filter(u => u.plan === "basic").length,
      premium: allUsers.filter(u => u.plan === "premium").length,
      vip:     allUsers.filter(u => u.plan === "vip").length,
    }
  };
}
export async function getAuditLogs() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(100);
}
export async function getAdminSetting(key: string): Promise<string | null> {
  const db = await getDb(); if (!db) return null;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return row?.value ?? null;
}

export async function getAdminSettings(): Promise<Record<string, string>> {
  const db = await getDb(); if (!db) return {};
  const rows = await db.select().from(appSettings);
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}
export async function saveAdminSetting(key: string, value: string) {
  const db = await getDb(); if (!db) return { key, value };
  await db.insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  return { key, value };
}
export async function deletePlan(id: number) {
  const db = await getDb(); if (!db) return;
  await db.update(subscriptionPlans).set({ isActive: 0, updatedAt: new Date() }).where(eq(subscriptionPlans.id, id));
}


// ============ API INTEGRATIONS ============
export async function getApiIntegration(userId: number, provider: string) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(apiIntegrations)
    .where(and(eq(apiIntegrations.userId, userId), eq(apiIntegrations.provider, provider)))
    .limit(1);
  return r[0] ?? null;
}
export async function upsertApiIntegration(data: {
  userId: number; provider: string; accessToken?: string; refreshToken?: string;
  adAccountId?: string; appId?: string; appSecret?: string;
  accountId?: string;        // TikTok advertiserId / Google customerId
  developerToken?: string;   // Google Ads developer token
  tokenExpiry?: Date;        // TikTok/Google token expiry
  tokenExpiresAt?: Date; isActive?: number;
  whatsappPhone?: string;    // WhatsApp vinculado à conta Meta
}) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const existing = await getApiIntegration(data.userId, data.provider);
  if (existing) {
    await db.update(apiIntegrations)
      .set({ ...data as any, updatedAt: new Date() })
      .where(and(eq(apiIntegrations.userId, data.userId), eq(apiIntegrations.provider, data.provider)));
  } else {
    await db.insert(apiIntegrations).values(data as any);
  }
  return getApiIntegration(data.userId, data.provider);
}
export async function listApiIntegrations(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(apiIntegrations).where(eq(apiIntegrations.userId, userId));
}
export async function deleteApiIntegration(userId: number, provider: string) {
  const db = await getDb(); if (!db) return;
  await db.delete(apiIntegrations)
    .where(and(eq(apiIntegrations.userId, userId), eq(apiIntegrations.provider, provider)));
}

// ============ CONSULTAS CPF/CNPJ ============
export async function createConsulta(data: {
  userId: number; documento: string; tipo: string;
  razaoSocial?: string; nomeFantasia?: string; situacao?: string;
  porte?: string; capitalSocial?: number; dataAbertura?: string;
  cnae?: string; email?: string; telefone?: string;
  endereco?: string; socios?: string;
  totalProcessos?: number; processos?: string;
  fonteUsada?: string; fontes?: string;
}) {
  const db = await getDb(); if (!db) return null;
  const r = await db.insert(consultas).values(data as any).returning({ id: consultas.id });
  return r[0] ?? null;
}

export async function getConsultasByUserId(userId: number, limit = 20) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(consultas)
    .where(eq(consultas.userId, userId))
    .orderBy(desc(consultas.createdAt))
    .limit(limit);
}

export async function getConsultaById(id: number) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(consultas).where(eq(consultas.id, id)).limit(1);
  return r[0] ?? null;
}

export async function countConsultasByUserId(userId: number): Promise<number> {
  const db = await getDb(); if (!db) return 0;
  const r = await db.select({ count: sql`count(*)` })
    .from(consultas).where(eq(consultas.userId, userId));
  return Number(r[0]?.count ?? 0);
}


// ============ NOTIFICATIONS - CREATE ============
export async function createNotification(data: {
  userId: number;
  title: string;
  message: string;
  type?: string;
  actionUrl?: string;
}) {
  const db = await getDb(); if (!db) return;
  await db.insert(notifications).values({
    userId: data.userId,
    title: data.title,
    message: data.message,
    type: data.type ?? "info",
    actionUrl: data.actionUrl,
    read: 0,
  });
}

export async function getSuperadminIds(): Promise<number[]> {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "superadmin"));
  return rows.map(r => r.id);
}

// ============ PLAN CHANGE REQUESTS ============
export async function createPlanChangeRequest(data: {
  requestedByUserId: number;
  targetUserId: number;
  currentPlan: string;
  requestedPlan: string;
  reason?: string;
}) {
  const db = await getDb(); if (!db) return null;
  const r = await db.insert(planChangeRequests).values({
    requestedByUserId: data.requestedByUserId,
    targetUserId: data.targetUserId,
    currentPlan: data.currentPlan as any,
    requestedPlan: data.requestedPlan as any,
    reason: data.reason,
    status: "pending",
  }).returning();
  return r[0] ?? null;
}

export async function getPendingPlanRequests() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(planChangeRequests)
    .where(eq(planChangeRequests.status, "pending"))
    .orderBy(desc(planChangeRequests.createdAt));
}

export async function getAllPlanRequests() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(planChangeRequests)
    .orderBy(desc(planChangeRequests.createdAt));
}

export async function approvePlanRequest(requestId: number, reviewerId: number, note?: string) {
  const db = await getDb(); if (!db) return;
  // Get request
  const rows = await db.select().from(planChangeRequests).where(eq(planChangeRequests.id, requestId));
  if (!rows[0]) return;
  const req = rows[0];
  // Update plan
  await db.update(users).set({ plan: req.requestedPlan as any, updatedAt: new Date() }).where(eq(users.id, req.targetUserId));
  // Update request status
  await db.update(planChangeRequests).set({
    status: "approved",
    reviewedByUserId: reviewerId,
    reviewNote: note,
    reviewedAt: new Date(),
  }).where(eq(planChangeRequests.id, requestId));
  // Log audit
  await db.insert(adminAuditLogs).values({
    action: "PLAN_CHANGE_APPROVED",
    performedByUserId: reviewerId,
    targetUserId: req.targetUserId,
  });
  // Notify requester
  await createNotification({
    userId: req.requestedByUserId,
    title: "Solicitação de plano aprovada ✅",
    message: `A mudança de plano para "${req.requestedPlan}" foi aprovada pelo Superadmin.${note ? ` Nota: ${note}` : ""}`,
    type: "success",
    actionUrl: "/admin/financeiro",
  });
}

export async function rejectPlanRequest(requestId: number, reviewerId: number, note: string) {
  const db = await getDb(); if (!db) return;
  const rows = await db.select().from(planChangeRequests).where(eq(planChangeRequests.id, requestId));
  if (!rows[0]) return;
  const req = rows[0];
  await db.update(planChangeRequests).set({
    status: "rejected",
    reviewedByUserId: reviewerId,
    reviewNote: note,
    reviewedAt: new Date(),
  }).where(eq(planChangeRequests.id, requestId));
  await db.insert(adminAuditLogs).values({
    action: "PLAN_CHANGE_REJECTED",
    performedByUserId: reviewerId,
    targetUserId: req.targetUserId,
  });
  // Notify requester
  await createNotification({
    userId: req.requestedByUserId,
    title: "Solicitação de plano recusada ❌",
    message: `A mudança de plano foi recusada pelo Superadmin. Motivo: ${note}`,
    type: "warning",
    actionUrl: "/admin/financeiro",
  });
}

// ============ USER PROFILE (marketing/financeiro/rh) ============
export async function updateUserProfile(userId: number, profile: "marketing" | "financeiro" | "rh" | null, performedByUserId: number) {
  const db = await getDb(); if (!db) return;
  await db.update(users).set({ profile: profile as any, updatedAt: new Date() }).where(eq(users.id, userId));
  await db.insert(adminAuditLogs).values({
    action: "SET_PROFILE",
    performedByUserId,
    targetUserId: userId,
  });
}

// ============ LESSON PROGRESS ============
export async function markLessonComplete(userId: number, courseSlug: string, lessonId: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const existing = await db.select().from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.courseSlug, courseSlug), eq(lessonProgress.lessonId, lessonId)))
    .limit(1);
  if (existing[0]) {
    await db.update(lessonProgress)
      .set({ completed: 1, completedAt: new Date() })
      .where(eq(lessonProgress.id, existing[0].id));
  } else {
    await db.insert(lessonProgress).values({ userId, courseSlug, lessonId, completed: 1, completedAt: new Date() });
  }
  return { ok: true };
}

export async function getLessonProgress(userId: number, courseSlug: string) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.courseSlug, courseSlug)));
}

export async function getAllLessonProgress(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(lessonProgress).where(eq(lessonProgress.userId, userId));
}

// ============ PLAN LIMITS ============
export const PLAN_LIMITS = {
  free:    { maxProjects: 1,    maxCompetitors: 2,  maxCampaigns: 0,  hasAI: false, hasMeta: false, hasGoogle: false, hasExportPdf: false, hasExportXlsx: false },
  basic:   { maxProjects: 3,    maxCompetitors: 5,  maxCampaigns: 3,  hasAI: true,  hasMeta: true,  hasGoogle: false, hasExportPdf: false, hasExportXlsx: false },
  premium: { maxProjects: 10,   maxCompetitors: null, maxCampaigns: null, hasAI: true, hasMeta: true, hasGoogle: true, hasExportPdf: true, hasExportXlsx: true },
  vip:     { maxProjects: null, maxCompetitors: null, maxCampaigns: null, hasAI: true, hasMeta: true, hasGoogle: true, hasExportPdf: true, hasExportXlsx: true },
} as const;

export type PlanKey = keyof typeof PLAN_LIMITS;

export async function checkPlanLimit(
  userId: number,
  check: "projects" | "competitors" | "campaigns" | "ai" | "meta" | "google" | "exportPdf" | "exportXlsx",
  context?: { projectId?: number }
): Promise<{ allowed: boolean; reason?: string; upgrade?: string }> {
  const user = await getUserById(userId) as any;
  const plan = (user?.plan || "free") as PlanKey;
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  const planNames: Record<string, string> = {
    free: "Free", basic: "Basic (R$97/mês)", premium: "Premium (R$197/mês)", vip: "VIP (R$397/mês)"
  };

  switch (check) {
    case "projects": {
      if (limits.maxProjects === null) return { allowed: true };
      const projects = await getProjectsByUserId(userId);
      if ((projects as any[]).length >= limits.maxProjects) {
        const next = plan === "free" ? "basic" : plan === "basic" ? "premium" : "vip";
        return { allowed: false, reason: `Seu plano ${planNames[plan]} permite no máximo ${limits.maxProjects} projeto(s). Você atingiu o limite.`, upgrade: next };
      }
      return { allowed: true };
    }
    case "competitors": {
      if (limits.maxCompetitors === null) return { allowed: true };
      if (!context?.projectId) return { allowed: true };
      const competitors = await getCompetitorsByProjectId(context.projectId);
      if ((competitors as any[]).length >= limits.maxCompetitors!) {
        const next = plan === "free" ? "basic" : plan === "basic" ? "premium" : "vip";
        return { allowed: false, reason: `Seu plano ${planNames[plan]} permite no máximo ${limits.maxCompetitors} concorrente(s) por projeto.`, upgrade: next };
      }
      return { allowed: true };
    }
    case "campaigns": {
      if (limits.maxCampaigns === null) return { allowed: true };
      if (limits.maxCampaigns === 0) return { allowed: false, reason: `Geração de campanhas com IA não está disponível no plano ${planNames[plan]}.`, upgrade: "basic" };
      if (!context?.projectId) return { allowed: true };
      // Conta campanhas do mês atual
      const allCampaigns = await getCampaignsByProjectId(context.projectId) as any[];
      const now = new Date();
      const monthCampaigns = allCampaigns.filter(c => {
        const d = new Date(c.createdAt || 0);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });
      if (monthCampaigns.length >= limits.maxCampaigns) {
        return { allowed: false, reason: `Seu plano ${planNames[plan]} permite ${limits.maxCampaigns} campanha(s)/mês. Limite atingido. Renova em ${new Date(now.getFullYear(), now.getMonth()+1, 1).toLocaleDateString("pt-BR")}.`, upgrade: "premium" };
      }
      return { allowed: true };
    }
    case "ai":        return limits.hasAI        ? { allowed: true } : { allowed: false, reason: `Análise com IA não disponível no plano ${planNames[plan]}.`,       upgrade: "basic"   };
    case "meta":      return limits.hasMeta       ? { allowed: true } : { allowed: false, reason: `Integração Meta Ads não disponível no plano ${planNames[plan]}.`, upgrade: "basic"   };
    case "google":    return limits.hasGoogle     ? { allowed: true } : { allowed: false, reason: `Integração Google Ads disponível a partir do plano Premium.`,     upgrade: "premium" };
    case "exportPdf": return limits.hasExportPdf  ? { allowed: true } : { allowed: false, reason: `Exportação PDF disponível a partir do plano Premium.`,            upgrade: "premium" };
    case "exportXlsx":return limits.hasExportXlsx ? { allowed: true } : { allowed: false, reason: `Exportação XLSX disponível a partir do plano Premium.`,           upgrade: "premium" };
    default: return { allowed: true };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// MARKETPLACE — funções de banco de dados
// ════════════════════════════════════════════════════════════════════════════════

export async function getMarketplaceListings(opts: {
  niche?: string; region?: string; search?: string;
  status?: string; limit?: number; offset?: number;
}) {
  const pool = await getPool();
  if (!pool) return [];
  const { niche, search, status = "active", limit = 24, offset = 0 } = opts;
  const conditions: string[] = [`ml.status = $1`];
  const params: any[] = [status];
  if (niche) {
    params.push(niche);
    conditions.push(`ml.niche = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(ml.title ILIKE $${params.length} OR ml.description ILIKE $${params.length})`);
  }
  params.push(limit, offset);
  const where = conditions.join(" AND ");
  const res = await pool.query(
    `SELECT ml.*, u.name as "sellerName",
       EXISTS(
         SELECT 1 FROM marketplace_boosts mb
         WHERE mb."listingId" = ml.id AND mb."isActive" = true AND mb."endDate" > NOW()
       ) as "boostActive"
     FROM marketplace_listings ml
     LEFT JOIN users u ON ml."userId" = u.id
     WHERE ${where}
     ORDER BY
       CASE WHEN EXISTS(
         SELECT 1 FROM marketplace_boosts mb2
         WHERE mb2."listingId" = ml.id AND mb2."isActive" = true AND mb2."endDate" > NOW()
       ) THEN 0 ELSE 1 END,
       ml."publishedAt" DESC NULLS LAST
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return res.rows;
}

export async function getListingBySlug(slug: string) {
  const pool = await getPool(); if (!pool) return null;
  const res = await pool.query(
    `SELECT ml.*, u.name as "sellerName", u.email as "sellerEmail"
     FROM marketplace_listings ml
     LEFT JOIN users u ON ml."userId" = u.id
     WHERE ml.slug = $1 LIMIT 1`,
    [slug]
  );
  return res.rows[0] || null;
}

export async function getListingById(id: number) {
  const pool = await getPool(); if (!pool) return null;
  const res = await pool.query(`SELECT * FROM marketplace_listings WHERE id = $1 LIMIT 1`, [id]);
  return res.rows[0] || null;
}

export async function getListingsByUser(userId: number) {
  const pool = await getPool(); if (!pool) return [];
  const res = await pool.query(
    `SELECT ml.*,
       COALESCE((SELECT COUNT(*) FROM marketplace_orders mo WHERE mo."listingId" = ml.id AND mo.status = 'paid'), 0)::int as "ordersCount",
       EXISTS(SELECT 1 FROM marketplace_boosts mb WHERE mb."listingId" = ml.id AND mb."isActive" = true AND mb."endDate" > NOW()) as "boostActive"
     FROM marketplace_listings ml
     WHERE ml."userId" = $1
     ORDER BY ml."createdAt" DESC`,
    [userId]
  );
  return res.rows;
}

export async function createMarketplaceListing(data: Record<string, any>) {
  const pool = await getPool(); if (!pool) throw new Error("DB unavailable");
  const keys = Object.keys(data);
  const cols = keys.map(k => `"${k}"`).join(", ");
  const vals = keys.map((_, i) => `$${i + 1}`).join(", ");
  const res = await pool.query(
    `INSERT INTO marketplace_listings (${cols}) VALUES (${vals}) RETURNING *`,
    Object.values(data)
  );
  return res.rows[0];
}

export async function updateListingStatus(id: number, status: string) {
  const pool = await getPool(); if (!pool) return;
  await pool.query(
    `UPDATE marketplace_listings SET status = $1, "updatedAt" = NOW() WHERE id = $2`,
    [status, id]
  );
}

export async function updateListingOptimization(id: number, suggestions: any) {
  const pool = await getPool(); if (!pool) return;
  await pool.query(
    `UPDATE marketplace_listings SET "aiSuggestions" = $1, "lastOptimizedAt" = NOW(), "updatedAt" = NOW() WHERE id = $2`,
    [JSON.stringify(suggestions), id]
  );
}

export async function deleteMarketplaceListing(id: number) {
  const pool = await getPool(); if (!pool) return;
  await pool.query(`DELETE FROM marketplace_listings WHERE id = $1`, [id]);
}

export async function incrementListingViews(id: number) {
  const pool = await getPool(); if (!pool) return;
  await pool.query(
    `UPDATE marketplace_listings SET views = COALESCE(views, 0) + 1 WHERE id = $1`, [id]
  );
}

export async function incrementListingConversions(id: number, amount: string) {
  const pool = await getPool(); if (!pool) return;
  await pool.query(
    `UPDATE marketplace_listings
     SET conversions = COALESCE(conversions, 0) + 1,
         revenue     = COALESCE(revenue, 0) + $1,
         "updatedAt" = NOW()
     WHERE id = $2`,
    [amount, id]
  );
}

export async function getOrdersBySeller(sellerId: number) {
  const pool = await getPool(); if (!pool) return [];
  const res = await pool.query(
    `SELECT mo.*, ml.title as "listingTitle"
     FROM marketplace_orders mo
     LEFT JOIN marketplace_listings ml ON mo."listingId" = ml.id
     WHERE mo."sellerId" = $1
     ORDER BY mo."createdAt" DESC LIMIT 50`,
    [sellerId]
  );
  return res.rows;
}

export async function getTotalRevenueByUser(userId: number) {
  const pool = await getPool(); if (!pool) return 0;
  const res = await pool.query(
    `SELECT COALESCE(SUM(mo."netAmount"), 0) as total
     FROM marketplace_orders mo
     LEFT JOIN marketplace_listings ml ON mo."listingId" = ml.id
     WHERE ml."userId" = $1 AND mo.status = 'paid'`,
    [userId]
  );
  return parseFloat(res.rows[0]?.total || "0");
}

export async function createMarketplaceOrder(data: Record<string, any>) {
  const pool = await getPool(); if (!pool) throw new Error("DB unavailable");
  const keys = Object.keys(data);
  const cols = keys.map(k => `"${k}"`).join(", ");
  const vals = keys.map((_, i) => `$${i + 1}`).join(", ");
  const res = await pool.query(
    `INSERT INTO marketplace_orders (${cols}) VALUES (${vals}) RETURNING *`,
    Object.values(data)
  );
  return res.rows[0];
}

export async function createMarketplaceBoost(data: Record<string, any>) {
  const pool = await getPool(); if (!pool) throw new Error("DB unavailable");
  const keys = Object.keys(data);
  const cols = keys.map(k => `"${k}"`).join(", ");
  const vals = keys.map((_, i) => `$${i + 1}`).join(", ");
  const res = await pool.query(
    `INSERT INTO marketplace_boosts (${cols}) VALUES (${vals}) RETURNING *`,
    Object.values(data)
  );
  return res.rows[0];
}

// ── Motor Híbrido: ad_patterns ────────────────────────────────────────────────

export async function getAdPatterns(niche: string, tone?: string, limit = 10): Promise<any[]> {
  const params: any[] = [niche, limit];
  const toneFilter = tone ? `AND tone = $3` : "";
  if (tone) params.splice(2, 0, tone);
  const res = await pool.query(
    `SELECT * FROM ad_patterns
     WHERE niche ILIKE $1 ${toneFilter}
     ORDER BY perf_score DESC, usage_count DESC
     LIMIT $2`,
    params
  );
  return res.rows;
}

export async function upsertAdPattern(data: {
  niche: string; structure: string; tone: string;
  headline_tpl: string; body_tpl?: string; cta_tpl?: string;
  tags?: string[]; longevity_days?: number; source_ad_id?: number;
}): Promise<void> {
  // Evita duplicatas por headline_tpl+niche
  const exists = await pool.query(
    `SELECT id FROM ad_patterns WHERE niche = $1 AND headline_tpl = $2 LIMIT 1`,
    [data.niche, data.headline_tpl]
  );
  if (exists.rows.length > 0) {
    await pool.query(
      `UPDATE ad_patterns SET longevity_days=$1, updated_at=NOW() WHERE id=$2`,
      [data.longevity_days || 0, exists.rows[0].id]
    );
    return;
  }
  await pool.query(
    `INSERT INTO ad_patterns
       (niche, structure, tone, headline_tpl, body_tpl, cta_tpl, tags, longevity_days, source_ad_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      data.niche, data.structure, data.tone,
      data.headline_tpl, data.body_tpl || null, data.cta_tpl || null,
      JSON.stringify(data.tags || []),
      data.longevity_days || 0,
      data.source_ad_id || null,
    ]
  );
}

export async function incrementPatternUsage(id: number): Promise<void> {
  await pool.query(
    `UPDATE ad_patterns SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function updatePatternScore(id: number, score: number): Promise<void> {
  await pool.query(
    `UPDATE ad_patterns SET perf_score = $1, updated_at = NOW() WHERE id = $2`,
    [Math.min(10, Math.max(0, score)), id]
  );
}

