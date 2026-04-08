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
console.log('[BOOT] PID:', process.pid);

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
import { createContext } from './context.js';
import { appRouter } from './router.js';
import Stripe from 'stripe';
import { json } from 'express';
import cors from 'cors';
import multer from 'multer';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import * as db from '../db.js';
import log from './logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './migrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ─── Health check (ANTES de qualquer middleware) ───────────
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
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }
  const sig = req.headers['stripe-signature']!;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      log.info('stripe', `Payment completed: ${session.id}`);
    }
    res.json({ received: true });
  } catch (err: any) {
    log.error('stripe', `Webhook error: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
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
// Limite de 20MB para suportar upload de imagens em base64 via tRPC
app.use(json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(cookieParser());

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
const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/meta/upload-media', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { adAccountId, accessToken } = req.body;
    if (!adAccountId || !accessToken) {
      return res.status(400).json({ error: 'adAccountId and accessToken are required' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append('file', blob, req.file.originalname);
    const uploadResp = await fetch(
      `https://graph.facebook.com/v18.0/act_${adAccountId}/adimages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      }
    );
    const uploadData = await uploadResp.json() as any;
    res.json(uploadData);
  } catch (err: any) {
    log.error('meta-upload', err.message);
    res.status(500).json({ error: err.message });
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

  // Executa imediatamente e depois a cada 6 horas
  refreshExpiringMetaTokens();
  setInterval(refreshExpiringMetaTokens, 6 * 60 * 60 * 1000);
}

main().catch((err) => {
  console.error('[FATAL] main() failed:', err);
});
