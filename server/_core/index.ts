// ─── Global error handlers (MUST be first) ──────────────────
process.on('uncaughtException', (err) => {
  console.error('[ERROR] uncaughtException:', err.stack || err.message);
  if (process.env.SENTRY_DSN) { try { require('@sentry/node').captureException(err); } catch {} }
});
process.on('unhandledRejection', (reason: unknown) => {
  console.error('[ERROR] unhandledRejection:', reason);
  if (process.env.SENTRY_DSN) { try { require('@sentry/node').captureException(reason); } catch {} }
});

// ─── Signal handlers para diagnóstico ─────────────────────
process.on('SIGTERM', () => {
  console.log('[SERVER] ⚠️  SIGTERM recebido — Render está encerrando o processo');
  console.log('[SERVER] Motivo possível: deploy novo, health check falhou, ou timeout de idle (free tier)');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[SERVER] SIGINT recebido — encerrando');
  process.exit(0);
});

console.log('[BOOT] Starting MECPro server...');
console.log('[BOOT] NODE_ENV:', process.env.NODE_ENV);
console.log('[BOOT] DATABASE_URL set:', !!process.env.DATABASE_URL);
console.log('[BOOT] JWT_SECRET set:', !!process.env.JWT_SECRET);
console.log('[BOOT] SESSION_SECRET set:', !!process.env.SESSION_SECRET);
console.log('[BOOT] STRIPE_SECRET_KEY set:', !!process.env.STRIPE_SECRET_KEY);
console.log('[BOOT] GEMINI_API_KEY set:', !!process.env.GEMINI_API_KEY);
console.log('[BOOT] GROQ_API_KEY set (Llama fallback):', !!process.env.GROQ_API_KEY);
console.log('[BOOT] ANTHROPIC_API_KEY set (Claude fallback):', !!process.env.ANTHROPIC_API_KEY);
console.log('[BOOT] ASAAS_API_KEY set (Pix pagamentos):', !!process.env.ASAAS_API_KEY);
console.log('[BOOT] ASAAS_WEBHOOK_TOKEN set (segurança):', !!process.env.ASAAS_WEBHOOK_TOKEN);
const _hfKey     = (process.env.HUGGINGFACE_API_KEY || '').trim();
const _heygenKey = (process.env.HEYGEN_API_KEY      || '').trim();
const _imgProvider = (process.env.IMAGE_PROVIDER || '').toLowerCase();
const _effectiveProvider = _imgProvider === 'heygen' ? 'heygen ✅'
  : _imgProvider === 'huggingface' ? 'huggingface ✅'
  : (!_imgProvider && _heygenKey) ? 'heygen (auto-detectado) ✅'
  : (!_imgProvider && _hfKey) ? 'huggingface (auto-detectado) ✅'
  : 'mock → SVG inline';
console.log('[BOOT] IMAGE_PROVIDER (efetivo):', _effectiveProvider);
console.log('[BOOT] HEYGEN_API_KEY set:', !!_heygenKey, _heygenKey ? '(' + _heygenKey.slice(0,8) + '...)' : '— nao configurada');
console.log('[BOOT] HUGGINGFACE_API_KEY set:', !!_hfKey, _hfKey ? '(' + _hfKey.slice(0,8) + '...)' : '— nao configurada');
console.log('[BOOT] CLOUDINARY configurado:', !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET), '(storage para HF)');
console.log('[BOOT] ANTHROPIC_API_KEY set (Claude):', !!process.env.ANTHROPIC_API_KEY);
const _elevenKey  = (process.env.ELEVENLABS_API_KEY || '').trim();
const _gensparkKey = (process.env.GENSPARK_API_KEY   || '').trim();
console.log('[BOOT] ELEVENLABS_API_KEY set:', !!_elevenKey,  _elevenKey  ? '(' + _elevenKey.slice(0,12)  + '...)' : '— nao configurada');
console.log('[BOOT] GENSPARK_API_KEY set:',   !!_gensparkKey, _gensparkKey ? '(' + _gensparkKey.slice(0,12) + '...)' : '— nao configurada');
console.log('[BOOT] PID:', process.pid);

// ── Diagnóstico de integrações de plataformas ──────────────────────────────
const _metaAppId     = process.env.META_APP_ID     || process.env.FACEBOOK_APP_ID     || '';
const _metaSecret    = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '';
const _tikTokKey     = process.env.TIKTOK_CLIENT_KEY    || '';
const _tikTokSecret  = process.env.TIKTOK_CLIENT_SECRET || '';
const _googleAdsId   = process.env.GOOGLE_ADS_CLIENT_ID  || process.env.GOOGLE_CLIENT_ID  || '';
const _googleAdsSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
const _googleDevToken  = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';

console.log('[BOOT] ── Integrações de plataformas ──────────────────────────');
console.log('[BOOT] META App ID set:',          !!_metaAppId,    _metaAppId    ? '(' + _metaAppId.slice(0,8)   + '...)' : '❌ ausente — OAuth Meta não funcionará');
console.log('[BOOT] META App Secret set:',      !!_metaSecret,   _metaSecret   ? '✅' : '❌ ausente');
console.log('[BOOT] TikTok Client Key set:',    !!_tikTokKey,    _tikTokKey    ? '(' + _tikTokKey.slice(0,8)   + '...)' : '❌ ausente — OAuth TikTok não funcionará');
console.log('[BOOT] TikTok Client Secret set:', !!_tikTokSecret, _tikTokSecret ? '✅' : '❌ ausente');
console.log('[BOOT] Google Ads Client ID set:', !!_googleAdsId,  _googleAdsId  ? '(' + _googleAdsId.slice(0,8) + '...)' : '❌ ausente — OAuth Google Ads não funcionará');
console.log('[BOOT] Google Ads Secret set:',    !!_googleAdsSecret, _googleAdsSecret ? '✅' : '❌ ausente');
console.log('[BOOT] Google Ads Dev Token set:', !!_googleDevToken,  _googleDevToken  ? '(' + _googleDevToken.slice(0,8) + '...)' : '❌ ausente — chamadas Google Ads API não funcionarão');
console.log('[BOOT] ──────────────────────────────────────────────────────────');

// ── Sentry — captura erros em produção ──────────────────────────────────────
import * as Sentry from '@sentry/node';
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Remove dados sensíveis antes de enviar
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },
  });
  console.log('[BOOT] Sentry configurado');
}


import 'dotenv/config';
import express, { type Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import publicApiRouter from '../publicApi';
import { createContext } from './context.js';
import { appRouter } from './router.js';
import Stripe from 'stripe';
import { json } from 'express';
import cors from 'cors';
import multer from 'multer';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import * as db from '../db.js';
import { getPool } from '../db.js';
import log from './logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './migrations.js';
import { loadLLMModeFromDB } from '../ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ─── Health check (ANTES de qualquer middleware) ───────────
// ── MECPro Public REST API v1 ──────────────────────────────────────────────
app.use('/api/v1', publicApiRouter);

// ── REST: Campaign by ID para pré-preencher wizard de publicação ──────────────
app.get('/api/campaigns/:id', async (req: Request, res: Response) => {
  try {
    const token = (req as any).cookies?.token;
    if (!token) return res.status(401).json({ error: 'Não autenticado' });
    const { jwtVerify } = await import('jose');
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret).catch(() => ({ payload: null }));
    if (!payload) return res.status(401).json({ error: 'Token inválido' });
    const campaign = await db.getCampaignById(parseInt(req.params.id));
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
    // Extrai nicho do clientProfile se disponível
    const project = campaign.projectId ? await db.getProjectById(campaign.projectId) : null;
    const clientProfile = project ? await db.getClientProfileByProjectId(project.id) : null;
    res.json({
      id: (campaign as any).id,
      name: (campaign as any).name,
      niche: (clientProfile as any)?.niche || '',
      description: (clientProfile as any)?.productService || '',
      objective: (campaign as any).objective,
      platform: (campaign as any).platform,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Marketplace REST API ──────────────────────────────────────────────────────
// Middleware JWT leve para injetar req.user (opcional — rotas públicas não precisam)
// cookieParser registrado AQUI antes do marketplace para req.cookies funcionar
app.use(cookieParser());

const marketplaceAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Tenta ler token do cookie (httpOnly) ou do header Authorization (Bearer)
    const cookieToken = (req as any).cookies?.token;
    const headerToken = (req.headers.authorization || "").replace("Bearer ", "").trim() || "";
    const token = cookieToken || headerToken || "";
    if (token) {
      const { jwtVerify } = await import('jose');
      const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
      const { payload } = await jwtVerify(token, secret).catch(() => ({ payload: null }));
      if (payload) {
        (req as any).user = { id: (payload as any).userId, role: (payload as any).role };
      }
    }
  } catch { /* sem auth — rotas públicas continuam */ }
  next();
};
import marketplaceRouter from '../marketplace.js';
app.use('/api/marketplace', marketplaceAuthMiddleware, marketplaceRouter);

app.get('/api/health', async (_req, res) => {
  // Importa estado do Circuit Breaker e cache do ai.ts
  let aiStatus: any = {};
  try {
    const ai = await import('../ai.js');
    aiStatus = (ai as any).getHealthStatus?.() || {};
  } catch {}

  const mem  = process.memoryUsage();
  const heap = Math.round(mem.heapUsed  / 1024 / 1024);
  const rss  = Math.round(mem.rss       / 1024 / 1024);

  res.json({
    status:  'ok',
    ts:      new Date().toISOString(),
    uptime:  Math.round(process.uptime()),
    pid:     process.pid,
    memory: { heapMB: heap, rssMB: rss },
    ai:      aiStatus,
  });
});

// ─── Diagnóstico Meta Ads (admin only) ────────────────────
app.get('/api/diag/meta', async (req, res) => {
  const key = req.query.key as string;
  if (key !== (process.env.DEBUG_TOKEN || 'mecpro-diag-2026')) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  try {
    const { getPool } = await import('../db.js');
    const pool = await getPool();
    if (!pool) return res.json({ error: 'DB unavailable' });

    // Busca todas as integrações Meta ativas
    const result = await pool.query(`
      SELECT u.id, u.email, u.name,
             i."accessToken", i."adAccountId", i."appId",
             i."tokenExpiresAt", i."isActive"
      FROM api_integrations i
      JOIN users u ON u.id = i."userId"
      WHERE i.provider = 'meta' AND i."isActive" = 1
      ORDER BY i."userId"
    `);

    const integrations = result.rows;
    const diagnostics = [];

    for (const intg of integrations) {
      const token = intg.accessToken;
      const diag: any = {
        userId:       intg.id,
        email:        intg.email,
        name:         intg.name,
        adAccountId:  intg.adAccountId,
        appId:        intg.appId,
        tokenExpiry:  intg.tokenExpiresAt,
        tokenExpired: intg.tokenExpiresAt ? new Date() > new Date(intg.tokenExpiresAt) : false,
        tokenLen:     token?.length || 0,
        tokenPreview: token ? token.slice(0, 15) + '...' : 'none',
      };

      if (token) {
        try {
          // Testa /me
          const meRes = await fetch(`https://graph.facebook.com/v20.0/me?access_token=${token}&fields=id,name`);
          const meData = await meRes.json() as any;
          diag.meOk = !meData.error;
          diag.meName = meData.name || meData.error?.message;
          diag.meCode = meData.error?.code;

          if (!meData.error) {
            // Testa permissões
            const permRes = await fetch(`https://graph.facebook.com/v20.0/me/permissions?access_token=${token}`);
            const permData = await permRes.json() as any;
            const perms = (permData.data || []).filter((p: any) => p.status === 'granted').map((p: any) => p.permission);
            diag.permissions = perms;
            diag.hasAdsRead = perms.includes('ads_read');

            // Testa Ads Library API
            const adsRes = await fetch(
              `https://graph.facebook.com/v20.0/ads_archive?access_token=${token}` +
              `&ad_reached_countries=BR&ad_active_status=ACTIVE&fields=id,page_name&limit=1`
            );
            const adsData = await adsRes.json() as any;
            diag.adsLibraryOk = !adsData.error;
            diag.adsLibraryError = adsData.error ? `code=${adsData.error.code}: ${adsData.error.message}` : null;
            diag.adsLibraryCode = adsData.error?.code;
          }
        } catch (e: any) {
          diag.fetchError = e.message;
        }
      }

      diagnostics.push(diag);
    }

    res.json({
      ts: new Date().toISOString(),
      count: diagnostics.length,
      integrations: diagnostics,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── CORS ─────────────────────────────────────────────────
const allowedOrigins = [
  'https://mecpro.onrender.com',
  'https://www.mecproai.com',
  'https://mecproai.com',
  'https://mecpro-ai.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.onrender.com') ||
      origin.endsWith('.mecproai.com')
    ) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ─── Stripe (inicializado de forma segura) ─────────────────
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

// ─── Stripe webhook (raw body BEFORE json parser) ─────────
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const sig            = req.headers['stripe-signature']!;
  const webhookSecret  = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    log.warn('stripe', 'STRIPE_WEBHOOK_SECRET não configurado — aceitando sem validação (dev)');
  }

  let event: Stripe.Event;
  try {
    event = webhookSecret
      ? stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
      : JSON.parse(req.body.toString());
  } catch (err: any) {
    log.error('stripe', `Webhook signature error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    log.info('stripe', `Webhook recebido: ${event.type}`);

    // ── Checkout concluído ───────────────────────────────────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const sessionType = session.metadata?.type;

      // ── WALLET DEPOSIT (recarga via cartão de crédito) ─────────────────
      if (sessionType === 'wallet_deposit') {
        const userId    = Number(session.metadata?.userId);
        const netAmount = Number(session.metadata?.netAmount || 0);
        const grossAmt  = Number(session.metadata?.feeAmount || 0) + netAmount;
        const feeAmount = Number(session.metadata?.feeAmount || 0);

        if (userId && netAmount > 0) {
          const pool = await getPool();
          if (pool) {
            try {
              // Marca depósito como aprovado
              await pool.query(
                `UPDATE media_budget
                 SET status='approved', "approvedAt"=NOW(), "operationStatus"='confirmed_api', "updatedAt"=NOW()
                 WHERE "stripeId" = $1 AND type = 'deposit'`,
                [session.id]
              );

              // Credita líquido na wallet
              await pool.query(`
                INSERT INTO media_balance ("userId", balance, "totalDeposited", "totalFees")
                VALUES ($1, $2, $3, $4)
                ON CONFLICT ("userId") DO UPDATE SET
                  balance          = media_balance.balance + $2,
                  "totalDeposited" = media_balance."totalDeposited" + $3,
                  "totalFees"      = media_balance."totalFees" + $4,
                  "updatedAt"      = NOW()
              `, [userId, netAmount, grossAmt, feeAmount]);

              log.info('stripe', '✅ Recarga via cartão creditada', {
                userId, sessionId: session.id, netAmount: netAmount / 100,
              });
            } catch (err: any) {
              log.error('stripe', 'Erro ao creditar wallet', { error: err.message, sessionId: session.id });
            }
          }
        }
        return res.json({ received: true });
      }

      // ── SUBSCRIPTION (ativação de plano — fluxo antigo) ───────────────
      const userId   = session.metadata?.user_id;
      const planSlug = session.metadata?.plan_slug as 'basic' | 'premium' | 'vip' | undefined;
      const stripeCustomerId    = session.customer as string;
      const stripeSubscriptionId = session.subscription as string;

      if (userId && planSlug) {
        // 1. Atualiza plano do usuário
        await db.updateUserPlan(Number(userId), planSlug);

        // 2. Salva stripeCustomerId no usuário
        const pool = await getPool();
        if (pool) {
          await pool.query(
            `UPDATE users SET "stripeCustomerId" = $1, "updatedAt" = NOW() WHERE id = $2`,
            [stripeCustomerId, Number(userId)]
          );

          // 3. Cria/atualiza registro de subscription
          if (stripeSubscriptionId) {
            // Busca o planId pelo slug
            const planRes = await pool.query(
              `SELECT id FROM subscription_plans WHERE slug = $1 LIMIT 1`,
              [planSlug]
            );
            const planId = planRes.rows[0]?.id;
            if (planId) {
              // Verifica se já tem subscription ativa para esse usuário
              const existingSub = await pool.query(
                `SELECT id FROM user_subscriptions WHERE "userId" = $1 LIMIT 1`,
                [Number(userId)]
              );
              if (existingSub.rows[0]) {
                await pool.query(`
                  UPDATE user_subscriptions SET
                    "planId" = $2, "stripeSubscriptionId" = $3, "stripeCustomerId" = $4,
                    status = 'active', "currentPeriodStart" = NOW(),
                    "currentPeriodEnd" = NOW() + INTERVAL '30 days', "updatedAt" = NOW()
                  WHERE "userId" = $1
                `, [Number(userId), planId, stripeSubscriptionId, stripeCustomerId]);
              } else {
                await pool.query(`
                  INSERT INTO user_subscriptions
                    ("userId", "planId", "stripeSubscriptionId", "stripeCustomerId",
                     status, "currentPeriodStart", "currentPeriodEnd", "createdAt", "updatedAt")
                  VALUES ($1, $2, $3, $4, 'active', NOW(), NOW() + INTERVAL '30 days', NOW(), NOW())
                `, [Number(userId), planId, stripeSubscriptionId, stripeCustomerId]);
              }
            }
          }
        }

        log.info('stripe', '✅ Plano ativado após checkout', { userId, planSlug, stripeCustomerId });
      } else {
        log.warn('stripe', 'checkout.session.completed sem metadata userId/planSlug', { sessionId: session.id });
      }
    }

    // ── Assinatura renovada ───────────────────────────────────────────────
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as any;
      const subscriptionId = invoice.subscription;
      if (subscriptionId) {
        const pool = await getPool();
        if (pool) {
          await pool.query(`
            UPDATE user_subscriptions SET
              status = 'active',
              "currentPeriodEnd" = NOW() + INTERVAL '30 days',
              "updatedAt" = NOW()
            WHERE "stripeSubscriptionId" = $1
          `, [subscriptionId]);
          log.info('stripe', '✅ Assinatura renovada', { subscriptionId });
        }
      }
    }

    // ── Assinatura cancelada ou com falha ─────────────────────────────────
    if (event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_failed') {
      const obj = event.data.object as any;
      const stripeCustomerId = obj.customer;
      if (stripeCustomerId) {
        const pool = await getPool();
        if (pool) {
          // Rebaixa para plano free
          const userRes = await pool.query(
            `SELECT id FROM users WHERE "stripeCustomerId" = $1 LIMIT 1`,
            [stripeCustomerId]
          );
          if (userRes.rows[0]) {
            await db.updateUserPlan(userRes.rows[0].id, 'free');
            await pool.query(`
              UPDATE user_subscriptions SET status = 'canceled', "updatedAt" = NOW()
              WHERE "stripeCustomerId" = $1
            `, [stripeCustomerId]);
            log.info('stripe', '⚠️ Plano rebaixado para free', { userId: userRes.rows[0].id });
          }
        }
      }
    }

  } catch (err: any) {
    log.error('stripe', `Erro ao processar webhook: ${err.message}`, { type: event.type });
    // Retorna 200 mesmo com erro interno para evitar retries do Stripe
  }

  res.json({ received: true });
});

// ─── Diagnóstico do webhook Asaas (sem autenticação — apenas leitura) ─────────
app.get('/api/webhook/asaas/status', async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });

    const deposits = await pool.query(`
      SELECT id, "userId", amount, "feeAmount", "netAmount",
             status, "stripeId" as "asaasId", "createdAt", "approvedAt"
      FROM media_budget WHERE type = 'deposit'
      ORDER BY "createdAt" DESC LIMIT 20
    `);
    const balances = await pool.query(`
      SELECT "userId", balance, "totalDeposited", "updatedAt"
      FROM media_balance ORDER BY "updatedAt" DESC LIMIT 20
    `);

    res.json({
      webhook_url:     (process.env.APP_URL || 'https://www.mecproai.com') + '/api/webhook/asaas',
      token_configured: !!process.env.ASAAS_WEBHOOK_TOKEN,
      asaas_key_set:    !!process.env.ASAAS_API_KEY,
      events_expected:  ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'],
      deposits: deposits.rows.map((r: any) => ({
        id: r.id, userId: r.userId,
        amount: Number(r.amount) / 100, net: Number(r.netAmount) / 100,
        status: r.status, asaasId: r.asaasId,
        createdAt: r.createdAt, approvedAt: r.approvedAt,
      })),
      balances: balances.rows.map((r: any) => ({
        userId: r.userId, balance: Number(r.balance) / 100,
        deposited: Number(r.totalDeposited) / 100, updatedAt: r.updatedAt,
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Crédito manual de saldo (admin — resolver webhook falhou) ─────────────────
app.post('/api/admin/credit-balance', async (req: Request, res: Response) => {
  const adminSecret = process.env.ADMIN_SECRET || process.env.JWT_SECRET || '';
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!auth || auth !== adminSecret) return res.status(401).json({ error: 'Unauthorized' });

  const { userId, amountReais, notes, depositId } = req.body;
  if (!userId || !amountReais) return res.status(400).json({ error: 'userId e amountReais obrigatorios' });

  try {
    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });

    const amountCents = Math.round(Number(amountReais) * 100);

    if (depositId) {
      await pool.query(
        `UPDATE media_budget SET status='approved', "approvedAt"=NOW(), "updatedAt"=NOW() WHERE id=$1`,
        [depositId]
      );
    }

    await pool.query(`
      INSERT INTO media_balance ("userId", balance, "totalDeposited", "totalFees")
      VALUES ($1, $2, $2, 0)
      ON CONFLICT ("userId") DO UPDATE SET
        balance = media_balance.balance + $2,
        "totalDeposited" = media_balance."totalDeposited" + $2,
        "updatedAt" = NOW()
    `, [userId, amountCents]);

    await pool.query(`
      INSERT INTO media_budget ("userId", amount, "feePercent", "feeAmount", "netAmount",
        type, status, method, notes, "approvedAt")
      VALUES ($1, $2, 0, 0, $2, 'deposit', 'approved', 'manual', $3, NOW())
    `, [userId, amountCents, notes || 'Credito manual admin']);

    log.info('admin', 'Credito manual aplicado', { userId, amountReais });
    return res.json({ success: true, userId: Number(userId), credited: Number(amountReais) });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

// ─── Smoke test E2E — valida fluxo completo de recarga ──────────────────────
app.get('/api/smoke-test/recharge', async (req: Request, res: Response) => {
  const adminSecret = process.env.ADMIN_SECRET || process.env.JWT_SECRET || '';
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!auth || auth !== adminSecret) return res.status(401).json({ error: 'Unauthorized' });

  const results: Record<string, any> = {};

  try {
    const pool = await getPool();
    if (!pool) throw new Error('DB unavailable');

    // 1. Verificar tabela media_budget e colunas de auditoria
    const colsRes = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'media_budget'
      ORDER BY ordinal_position
    `);
    const cols = colsRes.rows.map((r: any) => r.column_name);
    results.schema = {
      ok: ['externalId', 'verifiedAt', 'operationStatus', 'errorMsg'].every(c => cols.includes(c)),
      columns: cols,
    };

    // 2. Contar registros por status e tipo
    const statsRes = await pool.query(`
      SELECT type, status, "operationStatus", COUNT(*)::int as cnt
      FROM media_budget
      GROUP BY type, status, "operationStatus"
      ORDER BY cnt DESC
      LIMIT 20
    `);
    results.budgetStats = statsRes.rows;

    // 3. Verificar saldos por usuário
    const balRes = await pool.query(`
      SELECT mb."userId", mb.balance, mb."totalDeposited", mb."updatedAt"
      FROM media_balance mb
      ORDER BY mb."updatedAt" DESC LIMIT 10
    `);
    results.balances = balRes.rows.map((r: any) => ({
      userId:    r.userId,
      balance:   Number(r.balance) / 100,
      deposited: Number(r.totalDeposited) / 100,
      updatedAt: r.updatedAt,
    }));

    // 4. Últimas recargas com trilha de auditoria
    const rechargeRes = await pool.query(`
      SELECT id, "userId", amount, platform, status, "operationStatus",
             "verifiedBy", "verifiedAt", "externalId", "externalReceipt",
             "createdAt", "approvedAt"
      FROM media_budget
      WHERE type = 'spend' AND method IN ('guide', 'asaas_sync', 'manual')
      ORDER BY "createdAt" DESC LIMIT 10
    `);
    results.recentRecharges = rechargeRes.rows.map((r: any) => ({
      ...r,
      amount: Number(r.amount) / 100,
    }));

    // 5. Links das plataformas
    results.platformLinks = {
      meta:   'https://www.facebook.com/adsmanager/manage/billing',
      google: 'https://ads.google.com/aw/billing/addfunds',
      tiktok: 'https://ads.tiktok.com/i18n/topup/recharge',
    };

    // 6. Verificar integrações ativas
    const intRes = await pool.query(`
      SELECT "userId", provider, "isActive",
             CASE WHEN "accessToken" IS NOT NULL THEN true ELSE false END as has_token,
             "updatedAt"
      FROM api_integrations
      WHERE "isActive" = 1
      ORDER BY "updatedAt" DESC LIMIT 20
    `);
    results.activeIntegrations = intRes.rows;

    results.status = 'ok';
    results.timestamp = new Date().toISOString();

  } catch (err: any) {
    results.status = 'error';
    results.error = err.message;
  }

  res.json(results);
});

// ─── Site Verifications ───────────────────────────────────
// TikTok — método "upload de arquivo" (nome do arquivo = token)
app.get("/tiktokGmTH14mA1YdrvwoTJJyJeSzROidi1LnE.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send("tiktok-developers-site-verification=GmTH14mA1YdrvwoTJJyJeSzROidi1LnE");
});
app.get("/privacy/tiktoklUKo4W0GpjnPD2r0cXK2xjUBGIOUf5e2.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send("tiktok-developers-site-verification=lUKo4W0GpjnPD2r0cXK2xjUBGIOUf5e2");
});
app.get("/terms/tiktokrbOfXrV6I8CdbslityLtt9j6agr8WnCy.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send("tiktok-developers-site-verification=rbOfXrV6I8CdbslityLtt9j6agr8WnCy");
});
// TikTok site verification — tokens por URL
app.get("/tiktok-developers-site-verification.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send("GmTH14mA1YdrvwoTJJyJeSzROidi1LnE"); // domínio principal
});
// Rotas de verificação adicionais por página
app.get("/terms/tiktok-developers-site-verification.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send("zTsqZWGhZ2bPFYKUDJzomWXrYqy4rJqr"); // terms
});
app.get("/privacy/tiktok-developers-site-verification.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send("SUcXocJEDSh67LwL4H5D1SGRIESRzrnH"); // privacy
});

// ─── Body parsers ─────────────────────────────────────────
// Limite de 50MB para suportar upload de imagens e vídeos em base64 via tRPC
app.use(json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
// cookieParser já registrado antes do marketplace router (não duplicar aqui)

// ─── Google OAuth ──────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL
    || 'https://www.mecproai.com/api/auth/google/callback';

  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  CALLBACK_URL,
  }, async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error('Email não disponível no perfil Google'));
      const user = await db.findOrCreateUserByProvider({
        openId:      profile.id,
        email,
        name:        profile.displayName,
        loginMethod: 'google',
      });
      return done(null, user);
    } catch (err) {
      return done(err as Error);
    }
  }));

  app.use(passport.initialize());

  // Iniciar fluxo OAuth
  app.get('/api/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })
  );

  // Callback do Google
  app.get('/api/auth/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/login?error=oauth_failed' }),
    async (req: Request, res: Response) => {
      try {
        const user = req.user as any;
        if (!user) return res.redirect('/login?error=oauth_failed');

        const { SignJWT } = await import('jose');
        const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
        const token = await new SignJWT({ userId: user.id, role: user.role })
          .setProtectedHeader({ alg: 'HS256' })
          .setExpirationTime('7d')
          .sign(secret);

        res.cookie('token', token, {
          httpOnly: true,
          secure:   true,
          sameSite: 'lax',
          maxAge:   7 * 24 * 60 * 60 * 1000,
        });
        res.redirect('/dashboard');
      } catch (err: any) {
        log.error('oauth', 'Google callback error: ' + err.message);
        res.redirect('/login?error=oauth_failed');
      }
    }
  );
  log.info('server', '✅ Google OAuth configurado');
} else {
  app.get('/api/auth/google', (_req: Request, res: Response) => {
    res.redirect('/login?error=oauth_not_configured');
  });
  log.warn('server', '⚠️ Google OAuth não configurado — variáveis ausentes');
}

// ─── Meta upload media ────────────────────────────────────
// ── Upload multipart (imagem + vídeo) — sem limite de base64 ──────────────
// Multer sem limite de tamanho — arquivos ficam em memória temporariamente
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB máximo
});

// Rota segura: usa JWT cookie para autenticar, busca token Meta do banco
app.post('/api/meta/upload-image', upload.single('file'), async (req: Request, res: Response) => {
  try {
    // Autenticação via JWT cookie
    const token = (req as any).cookies?.token;
    if (!token) return res.status(401).json({ error: 'Não autenticado' });

    const { jwtVerify } = await import('jose');
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret).catch(() => ({ payload: null }));
    if (!payload) return res.status(401).json({ error: 'Token inválido' });

    const userId = (payload as any).userId as number;
    const { getApiIntegration } = await import('../db.js');
    const integration = await getApiIntegration(userId, 'meta') as any;
    if (!integration?.accessToken) return res.status(400).json({ error: 'Meta não conectado' });

    const metaToken = integration.accessToken;
    const rawAccountId = integration.adAccountId || '';
    const act = rawAccountId.startsWith('act_') ? rawAccountId : `act_${rawAccountId}`;

    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    log.info('meta', 'upload-image multipart', {
      userId, fileName: req.file.originalname,
      sizeMB: (req.file.size / 1024 / 1024).toFixed(1), mimeType: req.file.mimetype,
    });

    const form = new FormData();
    form.append('access_token', metaToken);
    form.append('source', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);

    const uploadResp = await fetch(`https://graph.facebook.com/v19.0/${act}/adimages`, {
      method: 'POST', body: form as any,
    });
    const uploadData = await uploadResp.json() as any;
    if (!uploadResp.ok || uploadData.error) {
      log.warn('meta', 'upload-image erro', { error: uploadData.error?.message });
      return res.status(400).json({ error: uploadData.error?.message || 'Falha no upload' });
    }

    // Extrai hash da resposta
    const images = uploadData.images || {};
    const firstKey = Object.keys(images)[0];
    const hash = firstKey ? images[firstKey]?.hash : null;
    log.info('meta', 'upload-image OK', { userId, hash, fileName: req.file.originalname });
    return res.json({ hash, fileName: req.file.originalname });

  } catch (err: any) {
    log.warn('meta', 'upload-image exception', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// Rota de upload de vídeo via multipart
app.post('/api/meta/upload-video', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const token = (req as any).cookies?.token;
    if (!token) return res.status(401).json({ error: 'Não autenticado' });

    const { jwtVerify } = await import('jose');
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret).catch(() => ({ payload: null }));
    if (!payload) return res.status(401).json({ error: 'Token inválido' });

    const userId = (payload as any).userId as number;
    const { getApiIntegration } = await import('../db.js');
    const integration = await getApiIntegration(userId, 'meta') as any;
    if (!integration?.accessToken) return res.status(400).json({ error: 'Meta não conectado' });

    const metaToken = integration.accessToken;
    const rawAccountId = integration.adAccountId || '';
    const act = rawAccountId.startsWith('act_') ? rawAccountId : `act_${rawAccountId}`;

    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    log.info('meta', 'upload-video multipart', {
      userId, fileName: req.file.originalname,
      sizeMB: (req.file.size / 1024 / 1024).toFixed(1), mimeType: req.file.mimetype,
    });

    const form = new FormData();
    form.append('access_token', metaToken);
    form.append('source', new Blob([req.file.buffer], { type: req.file.mimetype || 'video/mp4' }), req.file.originalname);

    const uploadResp = await fetch(`https://graph.facebook.com/v19.0/${act}/advideos`, {
      method: 'POST', body: form as any,
      signal: AbortSignal.timeout(120_000), // 120s timeout para vídeos grandes
    });
    const uploadData = await uploadResp.json() as any;
    if (!uploadResp.ok || uploadData.error) {
      log.warn('meta', 'upload-video erro', { error: uploadData.error?.message });
      return res.status(400).json({ error: uploadData.error?.message || 'Falha no upload' });
    }

    log.info('meta', 'upload-video OK', { userId, videoId: uploadData.id, fileName: req.file.originalname });
    return res.json({ videoId: uploadData.id, fileName: req.file.originalname });

  } catch (err: any) {
    log.warn('meta', 'upload-video exception', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// Rota legada mantida por compatibilidade
app.post('/api/meta/upload-media', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { adAccountId, accessToken } = req.body;
    if (!adAccountId || !accessToken) return res.status(400).json({ error: 'adAccountId and accessToken are required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const formData = new FormData();
    formData.append('source', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);
    const uploadResp = await fetch(`https://graph.facebook.com/v19.0/act_${adAccountId}/adimages`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: formData as any,
    });
    const uploadData = await uploadResp.json() as any;
    res.json(uploadData);
  } catch (err: any) {
    log.warn('meta-upload', 'legacy upload error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Webhook Asaas — confirmação automática de Pix ──────────
app.post('/api/webhook/asaas', express.json(), async (req: Request, res: Response) => {
  try {
    // Valida token de autenticação do Asaas
    const asaasToken = process.env.ASAAS_WEBHOOK_TOKEN;
    if (asaasToken) {
      const receivedToken = req.headers['asaas-access-token'] as string;
      if (!receivedToken || receivedToken !== asaasToken) {
        log.warn('asaas-webhook', 'Token inválido — requisição rejeitada', {
          ip: req.ip, hasToken: !!receivedToken,
        });
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const event = req.body;
    log.info('asaas-webhook', 'Evento recebido', { event: event?.event, paymentId: event?.payment?.id });

    // Só processa pagamentos confirmados
    if (event?.event !== 'PAYMENT_RECEIVED' && event?.event !== 'PAYMENT_CONFIRMED') {
      return res.json({ received: true });
    }

    const asaasId   = event?.payment?.id;
    const paidValue = event?.payment?.value;
    if (!asaasId) return res.json({ received: true });

    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });

    // Busca o depósito pelo asaasId (gravado na coluna stripeId)
    const depRes = await pool.query(
      `SELECT * FROM media_budget WHERE "stripeId" = $1 AND status = 'pending' LIMIT 1`,
      [asaasId]
    );

    if (!depRes.rows[0]) {
      log.warn('asaas-webhook', 'Depósito não encontrado ou já processado', { asaasId });
      return res.json({ received: true });
    }

    const dep = depRes.rows[0];

    // Marca como aprovado
    await pool.query(
      `UPDATE media_budget SET status = 'approved', "approvedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
      [dep.id]
    );

    // Credita saldo líquido automaticamente
    await pool.query(`
      INSERT INTO media_balance ("userId", balance, "totalDeposited", "totalFees")
      VALUES ($1, $2, $3, $4)
      ON CONFLICT ("userId") DO UPDATE SET
        balance = media_balance.balance + $2,
        "totalDeposited" = media_balance."totalDeposited" + $3,
        "totalFees" = media_balance."totalFees" + $4,
        "updatedAt" = NOW()
    `, [dep.userId, dep.netAmount, dep.amount, dep.feeAmount]);

    // ── GAP 1 CORRIGIDO: Registra no wallet_ledger para histórico completo ──
    try {
      const balRes = await pool.query(
        `SELECT COALESCE(balance, 0) as balance FROM media_balance WHERE "userId" = $1`,
        [dep.userId]
      );
      const balBefore = Number(balRes.rows[0]?.balance ?? 0);
      const balAfter  = balBefore + Number(dep.netAmount);
      // Determina o tipo: plano anual ou depósito de mídia
      const isAnnualPlan = (dep.notes || '').toLowerCase().includes('plano') &&
                           (dep.notes || '').toLowerCase().includes('anual');
      await pool.query(`
        INSERT INTO wallet_ledger (
          "userId", type, amount, direction, reference, notes,
          "balanceBefore", "balanceAfter", "createdAt"
        ) VALUES ($1, $2, $3, 'credit', $4, $5, $6, $7, NOW())
      `, [
        dep.userId,
        isAnnualPlan ? 'promo_credit' : 'deposit',
        dep.netAmount,
        asaasId,
        isAnnualPlan
          ? `Crédito promocional — ${dep.notes}`
          : `Depósito Pix confirmado — R$ ${(Number(dep.amount)/100).toFixed(2)} (taxa ${dep.feePercent}%)`,
        balBefore,
        balAfter,
      ]);
    } catch (ledgerErr: any) {
      // Falha no ledger não deve bloquear o crédito
      log.warn('asaas-webhook', 'Falha ao registrar no wallet_ledger', { error: ledgerErr.message });
    }

    log.info('asaas-webhook', '✅ Pix confirmado — saldo creditado automaticamente', {
      userId:    dep.userId,
      depositId: dep.id,
      asaasId,
      netCredit: Number(dep.netAmount) / 100,
      grossPaid: paidValue,
    });

    // Notifica o admin por email (se RESEND_API_KEY configurada)
    try {
      const { getAdminSettings } = await import('../db.js');
      const settings = await getAdminSettings();
      const adminEmail = settings['admin_email'] || 'contato@mecproai.com';
      // Aqui poderia enviar email via Resend — simplificado por ora
      log.info('asaas-webhook', `Admin notificado: ${adminEmail}`, {
        message: `Pix R$ ${paidValue} confirmado para userId ${dep.userId}. Saldo creditado: R$ ${Number(dep.netAmount)/100}`,
      });
    } catch {}

    return res.json({ received: true, credited: Number(dep.netAmount) / 100 });
  } catch (err: any) {
    log.warn('asaas-webhook', 'Erro no webhook', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// ─── tRPC ─────────────────────────────────────────────────
app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path }) {
      log.error('trpc', `[${path}] ${error.message}`);
    },
  })
);



// ─── /api/auth/me — REST endpoint para useAuth hook ───────
// ─── Verificação de email via link ───────────────────────────────────────
app.get('/api/auth/verify-email', async (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token || token.length < 32) {
    return res.status(400).json({ success: false, error: 'Token inválido ou ausente.' });
  }
  try {
    const pool = await getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB indisponível.' });

    const user = await db.verifyEmailToken(token);
    if (!user) {
      return res.status(400).json({ success: false, error: 'Token inválido ou já utilizado. Solicite um novo link.' });
    }

    log.info('auth', 'Email verificado com sucesso', { userId: (user as any).id, email: (user as any).email });
    return res.json({ success: true, email: (user as any).email });
  } catch (err: any) {
    log.error('auth', 'Erro ao verificar email', { error: err?.message });
    return res.status(500).json({ success: false, error: 'Erro interno. Tente novamente.' });
  }
});

// ─── Reenviar email de verificação ───────────────────────────────────────
app.post('/api/auth/resend-verification', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email obrigatório.' });
  try {
    const user = await db.getUserByEmail(email);
    if (!user) return res.json({ success: true }); // silencioso por segurança

    if ((user as any).emailVerified) {
      return res.json({ success: true, alreadyVerified: true });
    }

    const verifyToken = await db.createEmailVerificationToken((user as any).id);
    const { sendVerificationEmail } = await import('../email');
    await sendVerificationEmail((user as any).email, (user as any).name ?? 'Usuário', verifyToken);
    log.info('auth', 'Email de verificação reenviado', { email });
    return res.json({ success: true });
  } catch (err: any) {
    log.error('auth', 'Erro ao reenviar verificação', { error: err?.message });
    return res.status(500).json({ success: false, error: 'Erro ao reenviar.' });
  }
});

app.get('/api/auth/me', async (req: Request, res: Response) => {
  try {
    const token = (req as any).cookies?.token;
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const { jwtVerify } = await import('jose');
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    const { getUserById } = await import('../db.js');
    const user = await getUserById(payload.userId as number);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    const { passwordHash, ...safeUser } = user as any;
    return res.json(safeUser);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// ─── Serve frontend estático (SPA) ────────────────────────
const distPath = path.join(__dirname, '../../dist/public');

// ── Rotas estáticas para crawlers (Google, Meta) — sem necessidade de JS ──
// Servidas ANTES do express.static para garantir prioridade
const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Politica de Privacidade da MECProAI — MECPro Tecnologia Ltda, CNPJ 13.122.473/0001-03">
  <title>Politica de Privacidade — MECProAI</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 860px; margin: 0 auto; padding: 40px 24px; color: #334155; background: #f8fafc; }
    h1 { color: #0f172a; font-size: 28px; margin-bottom: 8px; }
    h2 { color: #0f172a; font-size: 18px; margin-top: 32px; margin-bottom: 8px; border-left: 4px solid #1d4ed8; padding-left: 12px; }
    p { line-height: 1.7; margin: 8px 0; }
    .header { background: #0f172a; color: white; padding: 32px; border-radius: 12px; margin-bottom: 32px; }
    .header p { color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 14px; }
    .info-box { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px; display: flex; flex-wrap: wrap; gap: 20px; }
    .info-item label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; display: block; margin-bottom: 2px; }
    .info-item span { font-size: 13px; font-weight: 600; color: #0f172a; }
    .section { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
    .footer { text-align: center; margin-top: 32px; padding: 20px; background: white; border-radius: 10px; border: 1px solid #e2e8f0; }
    .footer a { color: #1d4ed8; text-decoration: none; margin: 0 8px; font-size: 13px; }
    a { color: #1d4ed8; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Politica de Privacidade</h1>
    <p>Ultima atualizacao: 07 de abril de 2026 &middot; MECPro Tecnologia Ltda &middot; CNPJ 13.122.473/0001-03</p>
  </div>

  <div class="info-box">
    <div class="info-item"><label>Razao Social</label><span>MECPro Tecnologia Ltda</span></div>
    <div class="info-item"><label>CNPJ</label><span>13.122.473/0001-03</span></div>
    <div class="info-item"><label>Endereco</label><span>Rua Jose Damasio Duarte, 46 &mdash; Barra, Balneario Camboriu, SC</span></div>
    <div class="info-item"><label>E-mail DPO</label><span>contato@mecproai.com</span></div>
    <div class="info-item"><label>Site</label><span>www.mecproai.com</span></div>
  </div>

  <div class="section">
    <h2>1. Introducao e Controlador dos Dados</h2>
    <p>A MECPro Tecnologia Ltda, desenvolvedora do aplicativo MECProAI, inscrita no CNPJ 13.122.473/0001-03, com sede na Rua Jose Damasio Duarte, 46, Barra, Balneario Camboriu &mdash; SC, CEP 88330-000, e a controladora dos dados pessoais coletados por meio do aplicativo MECProAI (www.mecproai.com), disponivel como plataforma web.</p>
    <p>Esta Politica descreve como coletamos, usamos, armazenamos e protegemos seus dados, em conformidade com a LGPD (Lei n 13.709/2018) e o GDPR.</p>
  </div>

  <div class="section">
    <h2>2. Dados Coletados</h2>
    <p>Coletamos: nome completo, e-mail e dados da empresa (fornecidos no cadastro); tokens de acesso OAuth 2.0 para Meta Ads, Google Ads e TikTok Ads (fornecidos pelo usuario); endereco IP, logs de acesso e cookies tecnicos essenciais.</p>
  </div>

  <div class="section">
    <h2>3. Finalidade do Tratamento</h2>
    <p>O aplicativo MECProAI utiliza seus dados para: prestacao dos servicos contratados (criacao e gestao de campanhas de marketing via IA); integracao com APIs de terceiros (Meta Ads API, Google Ads API, TikTok Ads API) em nome do usuario autenticado via OAuth 2.0; geracao de relatorios de performance; melhoria continua do aplicativo MECProAI; comunicacoes sobre o servico.</p>
  </div>

  <div class="section">
    <h2>4. Base Legal (LGPD)</h2>
    <p>Execucao de contrato (Art. 7, V); Legitimo interesse (Art. 7, IX); Consentimento (Art. 7, I); Cumprimento de obrigacao legal (Art. 7, II).</p>
  </div>

  <div class="section">
    <h2>5. Integracao com APIs de Terceiros</h2>
    <p>A MECProAI integra-se com Meta Ads API, Google Ads API e TikTok Ads API mediante autorizacao expressa do usuario via OAuth 2.0. Os dados de campanha sao processados em nome e sob controle do usuario. Nao compartilhamos dados entre clientes. Todo acesso e feito exclusivamente em nome do cliente autenticado.</p>
    <p>O uso das APIs esta sujeito aos termos de cada plataforma: <a href="https://developers.facebook.com/devpolicy">Meta Business Tools Terms</a> | <a href="https://developers.google.com/google-ads/api/terms">Google Ads API Terms</a>.</p>
  </div>

  <div class="section">
    <h2>6. Compartilhamento de Dados</h2>
    <p>Nao vendemos seus dados. Compartilhamos apenas com: plataformas de anuncios autorizadas pelo usuario; provedores de hospedagem (Render.com) e IA (Google Gemini); autoridades competentes quando exigido por lei.</p>
  </div>

  <div class="section">
    <h2>7. Transferencia Internacional</h2>
    <p>Dados processados em servidores nos EUA (Render.com, Google Cloud), com base em clausulas contratuais padrao reconhecidas pela ANPD e GDPR.</p>
  </div>

  <div class="section">
    <h2>8. Seguranca</h2>
    <p>Criptografia em transito (HTTPS/TLS 1.3) e em repouso; tokens OAuth armazenados de forma criptografada; autenticacao JWT; controle de acesso por funcao (RBAC); logs de auditoria.</p>
  </div>

  <div class="section">
    <h2>9. Seus Direitos (LGPD/GDPR)</h2>
    <p>Voce tem direito a: acesso, correcao, portabilidade, eliminacao e oposicao ao tratamento de seus dados. Para exercer seus direitos: <strong>contato@mecproai.com</strong>. Respondemos em ate 15 dias uteis.</p>
  </div>

  <div class="section">
    <h2>10. Encarregado de Dados (DPO)</h2>
    <p>Michel Leal de Oliveira &mdash; contato@mecproai.com &mdash; Rua Jose Damasio Duarte, 46, Barra, Balneario Camboriu &mdash; SC, CEP 88330-000, Brasil.</p>
  </div>

  <div class="section">
    <h2>11. Contato e Reclamacoes</h2>
    <p>E-mail: contato@mecproai.com | Site: www.mecproai.com/contact | ANPD: www.gov.br/anpd</p>
  </div>

  <div class="footer">
    <p style="color:#94a3b8;font-size:13px;margin:0 0 8px">MECPro Tecnologia Ltda &middot; CNPJ 13.122.473/0001-03</p>
    <a href="/terms">Termos de Uso</a>
    <a href="/about">Sobre nos</a>
    <a href="/contact">Contato</a>
  </div>
</body>
</html>`;
const TERMS_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Termos de Uso da MECProAI — MECPro Tecnologia Ltda, CNPJ 13.122.473/0001-03">
  <title>Termos de Uso — MECProAI</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 860px; margin: 0 auto; padding: 40px 24px; color: #334155; background: #f8fafc; }
    h1 { color: #0f172a; font-size: 28px; margin-bottom: 8px; }
    h2 { color: #0f172a; font-size: 18px; margin-top: 32px; margin-bottom: 8px; border-left: 4px solid #064e3b; padding-left: 12px; }
    p { line-height: 1.7; margin: 8px 0; }
    .header { background: #064e3b; color: white; padding: 32px; border-radius: 12px; margin-bottom: 32px; }
    .header p { color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 14px; }
    .info-box { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px; display: flex; flex-wrap: wrap; gap: 20px; }
    .info-item label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; display: block; margin-bottom: 2px; }
    .info-item span { font-size: 13px; font-weight: 600; color: #0f172a; }
    .section { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
    .footer { text-align: center; margin-top: 32px; padding: 20px; background: white; border-radius: 10px; border: 1px solid #e2e8f0; }
    .footer a { color: #1d4ed8; text-decoration: none; margin: 0 8px; font-size: 13px; }
    a { color: #1d4ed8; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Termos de Uso</h1>
    <p>Ultima atualizacao: 07 de abril de 2026 &middot; MECPro Tecnologia Ltda &middot; CNPJ 13.122.473/0001-03</p>
  </div>

  <div class="info-box">
    <div class="info-item"><label>Razao Social</label><span>MECPro Tecnologia Ltda</span></div>
    <div class="info-item"><label>CNPJ</label><span>13.122.473/0001-03</span></div>
    <div class="info-item"><label>Endereco</label><span>Rua Jose Damasio Duarte, 46 &mdash; Barra, Balneario Camboriu, SC</span></div>
    <div class="info-item"><label>E-mail</label><span>contato@mecproai.com</span></div>
    <div class="info-item"><label>Site</label><span>www.mecproai.com</span></div>
  </div>

  <div class="section">
    <h2>1. Aceitacao dos Termos</h2>
    <p>Ao acessar ou utilizar o aplicativo MECProAI (www.mecproai.com), voce concorda com estes Termos de Uso. O aplicativo MECProAI e desenvolvido e operado pela MECPro Tecnologia Ltda (CNPJ 13.122.473/0001-03). A MECPro Tecnologia Ltda, inscrita no CNPJ 13.122.473/0001-03, com sede na Rua Jose Damasio Duarte, 46, Barra, Balneario Camboriu &mdash; SC, CEP 88330-000, e a prestadora dos servicos.</p>
  </div>

  <div class="section">
    <h2>2. Descricao dos Servicos</h2>
    <p>A MECProAI e uma plataforma SaaS de marketing digital com inteligencia artificial que oferece: geracao automatica de campanhas via IA; analise de concorrentes; integracao com Meta Ads API, Google Ads API e TikTok Ads API para criacao e publicacao de campanhas em nome do usuario autenticado via OAuth 2.0; relatorios de performance; Academy com cursos de marketing digital.</p>
  </div>

  <div class="section">
    <h2>3. Integracao com APIs de Terceiros</h2>
    <p>Ao conectar suas contas de anuncios, voce autoriza a MECProAI a criar, editar e publicar campanhas em seu nome via API oficial. Os tokens de acesso sao armazenados de forma criptografada e utilizados exclusivamente para os servicos contratados. O uso esta sujeito aos termos de cada plataforma:</p>
    <p><a href="https://developers.facebook.com/devpolicy">Meta Business Tools Terms</a> | <a href="https://developers.google.com/google-ads/api/terms">Google Ads API Terms</a> | <a href="https://ads.tiktok.com/marketing_api/terms">TikTok Ads API Terms</a></p>
  </div>

  <div class="section">
    <h2>4. Planos e Pagamentos</h2>
    <p>Free (gratuito) | Basic R$ 97/mes | Premium R$ 197/mes | VIP R$ 397/mes. Cobranças mensais antecipadas. Cancelamento a qualquer momento com acesso ate fim do periodo pago.</p>
  </div>

  <div class="section">
    <h2>5. Uso Aceitavel</h2>
    <p>Proibido: criar campanhas com conteudo ilegal ou fraudulento; violar politicas das plataformas de anuncios; tentar acessar dados de outros usuarios; fazer engenharia reversa da plataforma; revender acesso as APIs integradas sem autorizacao.</p>
  </div>

  <div class="section">
    <h2>6. Propriedade Intelectual</h2>
    <p>Todo o codigo, design, algoritmos e marcas da MECProAI sao propriedade exclusiva da MECPro Tecnologia Ltda. Os dados e criativos criados pelo usuario permanecem de sua propriedade.</p>
  </div>

  <div class="section">
    <h2>7. Limitacao de Responsabilidade</h2>
    <p>A MECProAI nao se responsabiliza por resultados especificos de campanhas, decisoes de aprovacao das plataformas de anuncios, ou alteracoes nas APIs de terceiros. Nossa responsabilidade esta limitada ao valor pago no mes do evento.</p>
  </div>

  <div class="section">
    <h2>8. Lei Aplicavel e Foro</h2>
    <p>Regidos pelas leis do Brasil. Foro eleito: Comarca de Balneario Camboriu &mdash; SC. Para usuarios na UE, aplicam-se adicionalmente as disposicoes do GDPR.</p>
  </div>

  <div class="section">
    <h2>9. Contato</h2>
    <p>E-mail: contato@mecproai.com | Endereco: Rua Jose Damasio Duarte, 46, Barra, Balneario Camboriu &mdash; SC, CEP 88330-000 | Site: www.mecproai.com/contact</p>
  </div>

  <div class="footer">
    <p style="color:#94a3b8;font-size:13px;margin:0 0 8px">MECPro Tecnologia Ltda &middot; CNPJ 13.122.473/0001-03</p>
    <a href="/privacy">Politica de Privacidade</a>
    <a href="/about">Sobre nos</a>
    <a href="/contact">Contato</a>
  </div>
</body>
</html>`;

app.get('/privacy', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(PRIVACY_HTML);
});

app.get('/terms', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(TERMS_HTML);
});

app.use(express.static(distPath));

// SPA fallback – qualquer rota não-API retorna index.html
// Injeta meta tags de verificação dinamicamente (garante crawlers server-side)
app.get('*', async (_req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  try {
    const { readFileSync } = await import('fs');
    let html = readFileSync(indexPath, 'utf-8');
    // Token por rota — normaliza path removendo barra final
    const reqPath = _req.path.replace(/\/+$/, "") || "/";
    const tiktokTokens: Record<string, string> = {
      "/terms":   "zTsqZWGhZ2bPFYKUDJzomWXrYqy4rJqr",
      "/privacy": "SUcXocJEDSh67LwL4H5D1SGRIESRzrnH",
      "/":        "GmTH14mA1YdrvwoTJJyJeSzROidi1LnE",
    };
    const token = tiktokTokens[reqPath] ?? "6NnqTEV8nGoeLT605bmpOKtPvtGE7oSh";

    // Remove meta tags TikTok existentes e injeta todas
    html = html.replace(/<meta name="tiktok-developers-site-verification"[^>]*\/?>\n?/g, "");
    // Injeta o token específico da rota + todos os outros como fallback
    const allTokens = [
      token,
      "GmTH14mA1YdrvwoTJJyJeSzROidi1LnE",
      "zTsqZWGhZ2bPFYKUDJzomWXrYqy4rJqr",
      "SUcXocJEDSh67LwL4H5D1SGRIESRzrnH",
    ].filter((t, i, arr) => arr.indexOf(t) === i); // deduplica

    const metaTags = allTokens
      .map(t => `<meta name="tiktok-developers-site-verification" content="${t}" />`)
      .join("\n    ");

    html = html.replace(
      '<meta name="robots"',
      metaTags + "\n    <meta name=\"robots\""
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch {
    res.sendFile(indexPath);
  }
});

// ─── Error handler ────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  log.error('express', err.stack || err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────
async function main() {
  try {
    await runMigrations();
  await loadLLMModeFromDB(); // Carrega modo LLM (Gemini/Groq) salvo pelo admin
    log.info('migrations', '✅ Migrations applied successfully');
  } catch (err: any) {
    log.warn('migrations', `⚠️  Migration warning (server still starting): ${err.message}`);
  }

  const PORT = parseInt(process.env.PORT || '10000', 10);
  app.listen(PORT, '0.0.0.0', () => {
    log.info('server', `🚀 MECPro running on port ${PORT}`);
    console.log(`[SERVER] 🚀 MECPro running on port ${PORT}`);
    const mem = process.memoryUsage();
    console.log(`[SERVER] RAM usada: ${Math.round(mem.rss / 1024 / 1024)}MB RSS, ${Math.round(mem.heapUsed / 1024 / 1024)}MB Heap`);
  });

  // ── Cron: renovar tokens Meta que expiram em menos de 7 dias ─────────────
  // Roda a cada 6 horas — tokens Meta duram 60 dias, renovação tem janela ampla
  async function refreshExpiringMetaTokens() {
    try {
      const { getDb } = await import('../db.js');
      const { eq, and, lt, isNotNull } = await import('drizzle-orm');
      const { apiIntegrations } = await import('../schema.js');

      const drz = await getDb();
      if (!drz) return;

      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Busca integrações Meta com appId + appSecret + token expirando em 7 dias
      const expiring = await drz.select().from(apiIntegrations).where(
        and(
          eq(apiIntegrations.provider, 'meta'),
          eq(apiIntegrations.isActive, 1),
          isNotNull(apiIntegrations.appId),
          isNotNull(apiIntegrations.appSecret),
        )
      );

      let renewed = 0;
      for (const integ of expiring) {
        const expiresAt = (integ as any).tokenExpiresAt;
        if (!expiresAt || new Date(expiresAt) > sevenDaysFromNow) continue;

        const shortToken = (integ as any).accessToken;
        const appId      = (integ as any).appId;
        const appSecret  = (integ as any).appSecret;
        if (!shortToken || !appId || !appSecret) continue;

        try {
          const url = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
          const res  = await fetch(url);
          const data: any = await res.json();

          if (data.access_token) {
            const expiresIn      = data.expires_in || 5184000;
            const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
            await drz.update(apiIntegrations)
              .set({ accessToken: data.access_token, tokenExpiresAt, updatedAt: new Date() } as any)
              .where(eq(apiIntegrations.id, integ.id));
            renewed++;
            log.info('auth', `Token Meta renovado automaticamente`, { userId: integ.userId, expiresAt: tokenExpiresAt.toISOString() });
          }
        } catch (e: any) {
          log.warn('auth', `Falha ao renovar token Meta`, { userId: integ.userId, error: e.message });
        }
      }

      if (renewed > 0) log.info('auth', `Cron: ${renewed} token(s) Meta renovados`);
    } catch (e: any) {
      log.warn('auth', 'Cron refresh token erro', { error: e.message });
    }
  }

  // ── Cron: verificar recargas manuais pendentes ───────────────────────────
  // Roda a cada 30 minutos
  // - Envia lembrete após 2h sem confirmação (uma vez)
  // - Cancela e devolve saldo após 24h sem confirmação
  async function checkPendingRecharges() {
    try {
      const pool = await getPool();
      if (!pool) return;

      const now = new Date();

      // Busca recargas tipo 'guide_generated' com status 'pending' e com plataforma
      // (registradas quando o usuário gera o guia via confirmRecharge ou generateRechargeGuide)
      const pendingRes = await pool.query(`
        SELECT
          mb.id, mb."userId", mb.amount, mb.platform, mb."createdAt",
          mb."reminderSentAt", mb."cancelledAt",
          u.email, u.name,
          EXTRACT(EPOCH FROM (NOW() - mb."createdAt")) / 3600 AS hours_pending
        FROM media_budget mb
        JOIN users u ON u.id = mb."userId"
        WHERE mb.status = 'pending'
          AND mb.type    = 'spend'
          AND mb.method  = 'guide'
          AND mb."cancelledAt" IS NULL
        ORDER BY mb."createdAt" ASC
      `);

      for (const row of pendingRes.rows) {
        const hoursPending = Number(row.hours_pending);
        const amountFmt    = (Number(row.amount) / 100).toFixed(2);

        // 1. Cancelamento automático após 24h
        if (hoursPending >= 24) {
          // Devolve o saldo
          await pool.query(`
            INSERT INTO media_balance ("userId", balance, "totalDeposited", "totalFees")
            VALUES ($1, $2, 0, 0)
            ON CONFLICT ("userId") DO UPDATE SET
              balance = media_balance.balance + $2,
              "updatedAt" = NOW()
          `, [row.userId, row.amount]);

          // Marca como cancelado
          await pool.query(`
            UPDATE media_budget
            SET status = 'cancelled', "cancelledAt" = NOW(), "updatedAt" = NOW()
            WHERE id = $1
          `, [row.id]);

          log.info('recharge-cron', 'Recarga cancelada após 24h — saldo devolvido', {
            userId: row.userId, budgetId: row.id, amount: amountFmt, platform: row.platform,
          });

          // Envia email de cancelamento
          try {
            const { sendRechargeCancelledEmail } = await import('../email.js');
            await sendRechargeCancelledEmail(
              row.email, row.name || 'Usuário',
              row.platform || 'plataforma', amountFmt,
            );
          } catch (emailErr: any) {
            log.warn('recharge-cron', 'Email cancelamento falhou', { error: emailErr.message });
          }
          continue;
        }

        // 2. Lembrete após 2h (apenas uma vez)
        if (hoursPending >= 2 && !row.reminderSentAt) {
          const confirmUrl = `${process.env.APP_URL || 'https://www.mecproai.com'}/financeiro`;

          try {
            const { sendRechargeReminderEmail } = await import('../email.js');
            await sendRechargeReminderEmail(
              row.email, row.name || 'Usuário',
              row.platform || 'plataforma', amountFmt,
              confirmUrl, Math.floor(hoursPending),
            );

            // Marca que lembrete foi enviado
            await pool.query(`
              UPDATE media_budget SET "reminderSentAt" = NOW(), "updatedAt" = NOW() WHERE id = $1
            `, [row.id]);

            log.info('recharge-cron', 'Lembrete de recarga enviado', {
              userId: row.userId, budgetId: row.id, platform: row.platform,
              hoursPending: Math.floor(hoursPending),
            });
          } catch (emailErr: any) {
            log.warn('recharge-cron', 'Email lembrete falhou', { error: emailErr.message });
          }
        }
      }

      if (pendingRes.rows.length > 0) {
        log.info('recharge-cron', `Verificação concluída: ${pendingRes.rows.length} recarga(s) pendente(s)`, {
          cancelled: pendingRes.rows.filter(r => Number(r.hours_pending) >= 24).length,
          reminded:  pendingRes.rows.filter(r => Number(r.hours_pending) >= 2 && !r.reminderSentAt).length,
        });
      }
    } catch (err: any) {
      log.error('recharge-cron', 'Erro no cron de recargas', { error: err.message });
    }
  }

  // Executa imediatamente e depois a cada 30 minutos
  checkPendingRecharges();
  setInterval(checkPendingRecharges, 30 * 60 * 1000);

  // Executa imediatamente e depois a cada 6 horas
  refreshExpiringMetaTokens();
  setInterval(refreshExpiringMetaTokens, 6 * 60 * 60 * 1000);
}

main().catch((err) => {
  console.error('[FATAL] main() failed:', err);
});
