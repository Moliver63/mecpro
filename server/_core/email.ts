/**
 * server/email.ts
 * Utilitário de envio de emails via Resend
 * Compatível com as chamadas em router.ts e index.ts
 */

import { Resend } from "resend";

const resend  = new Resend(process.env.RESEND_API_KEY);
const FROM    = process.env.EMAIL_FROM!;
const APP_URL = process.env.VITE_APP_URL || process.env.APP_URL || "http://localhost:3000";

// ─── Template base ─────────────────────────────────────────────────────────────

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MECPRO</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0"
        style="background:#ffffff;border-radius:12px;overflow:hidden;
               box-shadow:0 2px 12px rgba(0,0,0,0.08);max-width:100%">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);
                     padding:28px 40px;text-align:center">
            <span style="color:#ffffff;font-size:24px;font-weight:700;letter-spacing:2px">
              MECPRO
            </span>
            <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px">
              Plataforma de Inteligência de Marketing
            </p>
          </td>
        </tr>

        <!-- Conteúdo -->
        <tr>
          <td style="padding:40px 40px 32px">${content}</td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;text-align:center;
                     border-top:1px solid #e5e7eb">
            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6">
              Este email foi enviado automaticamente — não responda.<br>
              © ${new Date().getFullYear()} MECPRO. Todos os direitos reservados.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(href: string, label: string): string {
  return `<div style="text-align:center;margin:28px 0">
    <a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);
       color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;
       font-weight:600;font-size:15px">${label}</a>
  </div>`;
}

function linkFallback(url: string): string {
  return `<p style="margin:16px 0 0;color:#9ca3af;font-size:12px;text-align:center">
    Problemas com o botão? Copie este link:<br>
    <a href="${url}" style="color:#6366f1;word-break:break-all">${url}</a>
  </p>`;
}

// ─── 1. Verificação de email ───────────────────────────────────────────────────
// Chamado em router.ts: sendVerificationEmail(user.email, user.name ?? "Usuário", verifyToken)

export async function sendVerificationEmail(toEmail: string, name: string, token: string) {
  const url = `${APP_URL}/verify-email?token=${token}`;

  return resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: "Confirme seu email — MECPRO",
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700">Confirme seu email 📧</h2>
      <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6">
        Olá, <strong>${name}</strong>!<br>
        Bem-vindo à MECPRO. Clique no botão abaixo para ativar sua conta:
      </p>
      ${btn(url, "✅ Verificar meu email")}
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px">
        <p style="margin:0;color:#92400e;font-size:13px">
          ⏰ Link válido por <strong>24 horas</strong>.
          Se não criou uma conta, ignore este email.
        </p>
      </div>
      ${linkFallback(url)}
    `),
  });
}

// ─── 2. Reset de senha ─────────────────────────────────────────────────────────
// Chamado em index.ts: sendPasswordResetEmail(result.user.email, result.user.name ?? "Usuário", result.token)

export async function sendPasswordResetEmail(toEmail: string, name: string, token: string) {
  const url = `${APP_URL}/reset-password?token=${token}`;

  return resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: "Redefinir senha — MECPRO",
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700">Redefinir senha 🔐</h2>
      <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6">
        Olá, <strong>${name}</strong>!<br>
        Recebemos uma solicitação para redefinir a senha da sua conta MECPRO.
      </p>
      ${btn(url, "🔑 Redefinir minha senha")}
      <div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px">
        <p style="margin:0;color:#991b1b;font-size:13px">
          ⏰ Link válido por <strong>1 hora</strong>.
          Se não solicitou, ignore — sua senha permanece a mesma.
        </p>
      </div>
      ${linkFallback(url)}
    `),
  });
}

// ─── 3. Boas-vindas (opcional — chamar após verificação confirmada) ─────────────

export async function sendWelcomeEmail(toEmail: string, name: string) {
  return resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: "Bem-vindo à MECPRO! 🚀",
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700">Conta ativa! 🎉</h2>
      <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6">
        Olá, <strong>${name}</strong>!<br>
        Seu email foi verificado com sucesso. Você já pode usar todos os recursos da MECPRO.
      </p>
      ${btn(`${APP_URL}/dashboard`, "🚀 Acessar o Dashboard")}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.8">
        Com a MECPRO você pode:<br>
        • Analisar concorrentes com IA<br>
        • Criar campanhas de alta performance<br>
        • Gerar inteligência de mercado em minutos
      </p>
    `),
  });
}
