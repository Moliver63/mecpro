/**
 * server/oauthServer.ts
 *
 * Servidor de Autorização OAuth 2.1, implementado especificamente pra
 * permitir que o conector remoto MCP do Claude.ai conecte no MecProAI.
 *
 * Segue a especificação de autorização do MCP (baseada em OAuth 2.1 +
 * RFC 8414, RFC 7591, RFC 9728, RFC 8707) — versão mínima e enxuta,
 * cobrindo só o que o Claude.ai realmente usa: Dynamic Client
 * Registration, PKCE S256, authorization_code + refresh_token.
 *
 * Decisão de arquitetura: reaproveita o login por sessão que já existe
 * (cookie "token", JWT via jose — mesmo mecanismo do context.ts do tRPC)
 * pra resolver "quem é o usuário" na tela de consentimento. Não duplica
 * autenticação — só emite um token de acesso NOVO vinculado a esse
 * userId já autenticado, pro Claude usar nas chamadas MCP.
 */

import { Router, Request, Response } from "express";
import { json, urlencoded } from "express";
import { jwtVerify } from "jose";
import * as db from "./db";
import { log } from "./logger";
import crypto from "node:crypto";

const router = Router();

const APP_URL = process.env.APP_URL || "https://www.mecproai.com";
const MCP_RESOURCE = `${APP_URL}/api/v1/mcp`;

// Escapa valores antes de interpolar no HTML da tela de consentimento —
// redirect_uri/code_challenge/state/resource vêm da query string (controláveis
// por quem monta o link), nunca confiar neles sem escapar primeiro.
function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Helper: resolve o usuário logado a partir do cookie de sessão ──────────
// Mesmo padrão exato de server/_core/context.ts — não duplica lógica nova,
// só reusa o mecanismo já validado em produção.
async function getLoggedInUser(req: Request): Promise<any | null> {
  try {
    const token = (req as any).cookies?.token;
    if (!token) return null;
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    return await db.getUserById(payload.userId as number);
  } catch {
    return null;
  }
}

// ── GET /.well-known/oauth-protected-resource (RFC 9728) ───────────────────
router.get("/.well-known/oauth-protected-resource", (_req: Request, res: Response) => {
  res.json({
    resource: MCP_RESOURCE,
    authorization_servers: [APP_URL],
  });
});

// ── GET /.well-known/oauth-authorization-server (RFC 8414) ─────────────────
router.get("/.well-known/oauth-authorization-server", (_req: Request, res: Response) => {
  res.json({
    issuer: APP_URL,
    authorization_endpoint: `${APP_URL}/authorize`,
    token_endpoint: `${APP_URL}/token`,
    registration_endpoint: `${APP_URL}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

// ── POST /register — Dynamic Client Registration (RFC 7591) ────────────────
router.post("/register", json(), async (req: Request, res: Response) => {
  try {
    const { redirect_uris, client_name } = req.body || {};
    log.info("oauth", "POST /register recebido", { client_name, redirect_uris });
    if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      log.warn("oauth", "POST /register rejeitado — redirect_uris ausente/vazio");
      return res.status(400).json({ error: "invalid_client_metadata", error_description: "redirect_uris é obrigatório e precisa ser um array não vazio." });
    }
    // Segurança: todo redirect_uri precisa ser https ou localhost (exigência do spec)
    for (const uri of redirect_uris) {
      const isLocalhost = uri.startsWith("http://localhost") || uri.startsWith("http://127.0.0.1");
      if (!uri.startsWith("https://") && !isLocalhost) {
        log.warn("oauth", "POST /register rejeitado — redirect_uri inválido", { uri });
        return res.status(400).json({ error: "invalid_redirect_uri", error_description: `redirect_uri deve ser https ou localhost: ${uri}` });
      }
    }
    const { clientId } = await db.createOAuthClient(client_name || "MCP Client", redirect_uris);
    log.info("oauth", "POST /register — client registrado com sucesso", { clientId, client_name });
    res.status(201).json({
      client_id: clientId,
      client_name: client_name || "MCP Client",
      redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  } catch (e: any) {
    log.error("oauth", "Erro no /register", { error: e.message });
    res.status(500).json({ error: "server_error" });
  }
});

// ── GET /authorize — tela de consentimento ──────────────────────────────────
router.get("/authorize", async (req: Request, res: Response) => {
  const { response_type, client_id, redirect_uri, code_challenge, code_challenge_method, state, resource } = req.query as Record<string, string>;
  log.info("oauth", "GET /authorize recebido", { client_id, redirect_uri, hasCodeChallenge: !!code_challenge });

  if (response_type !== "code" || !client_id || !redirect_uri || !code_challenge) {
    log.warn("oauth", "GET /authorize rejeitado — parâmetros ausentes", { response_type, client_id, redirect_uri, hasCodeChallenge: !!code_challenge });
    return res.status(400).send("Requisição de autorização inválida — parâmetros obrigatórios ausentes.");
  }
  if ((code_challenge_method || "S256") !== "S256") {
    log.warn("oauth", "GET /authorize rejeitado — code_challenge_method não suportado", { code_challenge_method });
    return res.status(400).send("Só o método PKCE S256 é suportado.");
  }

  const client = await db.getOAuthClient(client_id);
  if (!client) {
    log.warn("oauth", "GET /authorize rejeitado — client_id desconhecido", { client_id });
    return res.status(400).send("client_id desconhecido — o conector precisa se registrar primeiro.");
  }
  // Segurança CRÍTICA: redirect_uri precisa bater EXATO com o que foi registrado,
  // nunca aceitar aproximado — previne ataque de redirecionamento aberto.
  const registeredUris: string[] = client.redirectUris || [];
  if (!registeredUris.includes(redirect_uri)) {
    log.warn("oauth", "GET /authorize rejeitado — redirect_uri não bate com o registrado", { client_id, redirect_uri, registeredUris });
    return res.status(400).send("redirect_uri não corresponde ao que foi registrado para este client_id.");
  }

  const user = await getLoggedInUser(req);
  if (!user) {
    log.info("oauth", "GET /authorize — usuário não logado, redirecionando pro login", { client_id });
    const fullUrl = `${APP_URL}${req.originalUrl}`;
    return res.redirect(`/login?redirect=${encodeURIComponent(fullUrl)}`);
  }
  log.info("oauth", "GET /authorize — mostrando tela de consentimento", { client_id, userId: user.id, email: user.email });

  // Tela de consentimento simples, estilo visual alinhado ao resto do site
  res.set("Content-Type", "text/html; charset=utf-8").send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Autorizar acesso — MECPro</title>
  <style>
    body { font-family: -apple-system, "SF Pro Display", sans-serif; background: #f5f5f7; margin: 0;
           min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: white; border-radius: 18px; padding: 32px; max-width: 420px; width: 100%;
            box-shadow: 0 12px 40px rgba(0,0,0,.12); }
    h1 { font-size: 18px; font-weight: 800; color: #1d1d1f; margin: 0 0 8px; }
    p { font-size: 14px; color: #86868b; line-height: 1.6; margin: 0 0 20px; }
    .user { background: #f5f5f7; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: #1d1d1f; margin-bottom: 20px; }
    .actions { display: flex; gap: 10px; }
    button { flex: 1; padding: 12px; border-radius: 10px; border: none; font-size: 14px; font-weight: 700;
             cursor: pointer; font-family: inherit; }
    .allow { background: #0071e3; color: white; }
    .deny { background: #f5f5f7; color: #1d1d1f; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🤖 Claude quer acessar sua conta MECPro</h1>
    <p>Isso vai permitir que o Claude consulte seus projetos, campanhas e métricas em seu nome.</p>
    <div class="user">Conectado como <strong>${escapeHtml(user.email)}</strong></div>
    <form method="POST" action="/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(client_id)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge)}">
      <input type="hidden" name="state" value="${escapeHtml(state || "")}">
      <input type="hidden" name="resource" value="${escapeHtml(resource || "")}">
      <div class="actions">
        <button type="submit" name="decision" value="deny" class="deny">Negar</button>
        <button type="submit" name="decision" value="allow" class="allow">Permitir</button>
      </div>
    </form>
  </div>
</body>
</html>
  `);
});

// ── POST /authorize — processa a decisão do usuário ─────────────────────────
router.post("/authorize", json(), urlencoded(), async (req: Request, res: Response) => {
  const { decision, client_id, redirect_uri, code_challenge, state, resource } = req.body || {};

  // Validação ANTES de qualquer redirect — inclusive no caminho de "negar".
  // Sem isso, alguém poderia montar um POST direto com redirect_uri arbitrário
  // e decision=deny pra usar essa rota como redirecionador aberto.
  if (!client_id || !redirect_uri) {
    log.warn("oauth", "POST /authorize rejeitado — client_id ou redirect_uri ausente");
    return res.status(400).send("Requisição inválida.");
  }
  const client = await db.getOAuthClient(client_id);
  if (!client || !(client.redirectUris || []).includes(redirect_uri)) {
    log.warn("oauth", "POST /authorize rejeitado — client_id/redirect_uri não reconhecidos", { client_id, redirect_uri });
    return res.status(400).send("Requisição inválida — client_id ou redirect_uri não reconhecidos.");
  }

  if (decision !== "allow") {
    log.info("oauth", "POST /authorize — usuário negou o consentimento", { client_id });
    const url = new URL(redirect_uri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    return res.redirect(url.toString());
  }

  const user = await getLoggedInUser(req);
  if (!user) {
    log.warn("oauth", "POST /authorize — sessão perdida entre GET e POST", { client_id });
    return res.redirect(`/login?redirect=${encodeURIComponent(`${APP_URL}/authorize`)}`);
  }

  const code = await db.createOAuthAuthCode({
    clientId: client_id, userId: user.id, redirectUri: redirect_uri,
    codeChallenge: code_challenge, codeChallengeMethod: "S256",
    resource: resource || MCP_RESOURCE,
  });
  log.info("oauth", "POST /authorize — consentimento aprovado, código emitido", { client_id, userId: user.id, email: user.email });

  const url = new URL(redirect_uri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  res.redirect(url.toString());
});

// ── POST /token — troca code+verifier (ou refresh_token) por access_token ──
router.post("/token", json(), urlencoded(), async (req: Request, res: Response) => {
  try {
    const { grant_type } = req.body || {};

    if (grant_type === "authorization_code") {
      const { code, code_verifier, redirect_uri, client_id } = req.body || {};
      if (!code || !code_verifier) {
        return res.status(400).json({ error: "invalid_request", error_description: "code e code_verifier são obrigatórios." });
      }

      const row = await db.consumeOAuthAuthCode(code);
      if (!row) {
        log.warn("oauth", "POST /token rejeitado — código inválido/expirado/já usado", { client_id });
        return res.status(400).json({ error: "invalid_grant", error_description: "Código inválido, expirado ou já utilizado." });
      }
      if (row.clientId !== client_id) {
        log.warn("oauth", "POST /token rejeitado — client_id não bate com o código", { esperado: row.clientId, recebido: client_id });
        return res.status(400).json({ error: "invalid_grant", error_description: "client_id não corresponde ao código emitido." });
      }
      if (row.redirectUri !== redirect_uri) {
        log.warn("oauth", "POST /token rejeitado — redirect_uri não bate com o código", { esperado: row.redirectUri, recebido: redirect_uri });
        return res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri não corresponde ao usado na autorização." });
      }

      // Verificação PKCE — o núcleo da segurança do fluxo
      const computed = crypto.createHash("sha256").update(code_verifier).digest("base64url");
      if (computed !== row.codeChallenge) {
        log.warn("oauth", "POST /token rejeitado — PKCE code_verifier não bate", { client_id });
        return res.status(400).json({ error: "invalid_grant", error_description: "code_verifier não corresponde ao code_challenge." });
      }

      const tokens = await db.createOAuthToken({ clientId: client_id, userId: row.userId, resource: row.resource });
      log.info("oauth", "POST /token — access_token emitido com sucesso (authorization_code)", { client_id, userId: row.userId });
      return res.json({
        access_token: tokens.accessToken,
        token_type: "Bearer",
        expires_in: tokens.expiresIn,
        refresh_token: tokens.refreshToken,
      });
    }

    if (grant_type === "refresh_token") {
      const { refresh_token } = req.body || {};
      if (!refresh_token) return res.status(400).json({ error: "invalid_request" });
      const tokens = await db.rotateOAuthToken(refresh_token);
      if (!tokens) {
        log.warn("oauth", "POST /token rejeitado — refresh_token inválido/expirado");
        return res.status(400).json({ error: "invalid_grant", error_description: "Refresh token inválido ou expirado." });
      }
      log.info("oauth", "POST /token — access_token renovado com sucesso (refresh_token)");
      return res.json({
        access_token: tokens.accessToken,
        token_type: "Bearer",
        expires_in: tokens.expiresIn,
        refresh_token: tokens.refreshToken,
      });
    }

    log.warn("oauth", "POST /token — grant_type não suportado", { grant_type });
    return res.status(400).json({ error: "unsupported_grant_type" });
  } catch (e: any) {
    log.error("oauth", "Erro no /token", { error: e.message });
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
