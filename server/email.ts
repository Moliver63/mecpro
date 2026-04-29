import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || "noreply@mecpro.com.br";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

export async function sendVerificationEmail(email: string, name: string, token: string) {
  const url = `${APP_URL}/verify-email?token=${token}`;
  return resend.emails.send({
    from: FROM,
    to: email,
    subject: "Confirme seu e-mail — MECPro",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
        <h2 style="font-size:22px;font-weight:800;color:#0a0a0a;margin-bottom:8px">Confirme seu e-mail</h2>
        <p style="color:#495057;font-size:15px;line-height:1.6">Olá ${name}, obrigado por criar sua conta no MECPro!</p>
        <p style="color:#495057;font-size:15px;line-height:1.6">Clique no botão abaixo para confirmar seu e-mail e ativar sua conta:</p>
        <a href="${url}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#16a34a;color:white;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">
          Confirmar e-mail
        </a>
        <p style="color:#868e96;font-size:13px">Link expira em 24 horas. Se não criou uma conta, ignore este e-mail.</p>
        <hr style="border:none;border-top:1px solid #e9ecef;margin:24px 0"/>
        <p style="color:#adb5bd;font-size:12px">MECPro — Campaign Intelligence Builder</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  const url = `${APP_URL}/reset-password/${token}`;
  return resend.emails.send({
    from: FROM,
    to: email,
    subject: "Redefinir senha — MECPro",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
        <h2 style="font-size:22px;font-weight:800;color:#0a0a0a;margin-bottom:8px">Redefinir senha</h2>
        <p style="color:#495057;font-size:15px;line-height:1.6">Olá ${name}, recebemos uma solicitação para redefinir sua senha.</p>
        <a href="${url}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#0a0a0a;color:white;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">
          Redefinir senha
        </a>
        <p style="color:#868e96;font-size:13px">Link expira em 1 hora. Se não solicitou, ignore este e-mail.</p>
      </div>
    `,
  });
}


export async function sendWeeklyReport(
  email: string,
  name: string,
  data: {
    meta:   { campaigns:number; spend:number; impressions:number; clicks:number; cpc:number; ctr:number };
    google: { campaigns:number; spend:number; impressions:number; clicks:number; cpc:number; ctr:number };
    tiktok: { campaigns:number; spend:number; impressions:number; clicks:number; cpc:number; ctr:number };
    period: string;
    generatedAt: string;
  }
) {
  const R = (v:number) => `R$ ${v.toFixed(2)}`;
  const N = (v:number) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M`
    : v >= 1_000 ? `${(v/1_000).toFixed(1)}K` : String(v);
  const PCT = (v:number) => `${(v*100).toFixed(2)}%`;

  const totalSpend = data.meta.spend + data.google.spend + data.tiktok.spend;
  const totalImpr  = data.meta.impressions + data.google.impressions + data.tiktok.impressions;
  const totalClicks= data.meta.clicks + data.google.clicks + data.tiktok.clicks;

  const platformRow = (icon:string, label:string, d:typeof data.meta) => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;font-weight:700">${icon} ${label}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;text-align:center">${d.campaigns}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;text-align:center;color:#dc2626;font-weight:700">${R(d.spend)}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;text-align:center">${N(d.impressions)}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;text-align:center">${N(d.clicks)}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;text-align:center">${R(d.cpc)}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;text-align:center">${PCT(d.ctr)}</td>
    </tr>`;

  return resend.emails.send({
    from: FROM,
    to: email,
    subject: `📊 Relatório Semanal MECPro — ${data.period}`,
    html: `
      <div style="font-family:sans-serif;max-width:680px;margin:0 auto;padding:0;background:#fff">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#1a73e8,#7c3aed);padding:32px 28px;border-radius:16px 16px 0 0">
          <h1 style="color:#fff;margin:0 0 4px;font-size:22px;font-weight:800">📊 Relatório Semanal MECPro</h1>
          <p style="color:rgba(255,255,255,.8);margin:0;font-size:13px">Olá ${name} · ${data.period}</p>
        </div>

        <!-- Consolidated summary -->
        <div style="background:#f8fafc;padding:24px 28px;border:1px solid #e2e8f0">
          <h2 style="font-size:15px;font-weight:800;margin:0 0 14px;color:#0a0a0a">🌐 Consolidado — Todas as plataformas</h2>
          <div style="display:flex;gap:12;flex-wrap:wrap">
            ${[
              { l:"Total Gasto",   v:R(totalSpend),  c:"#dc2626" },
              { l:"Impressões",    v:N(totalImpr),   c:"#7c3aed" },
              { l:"Cliques",       v:N(totalClicks), c:"#0891b2" },
              { l:"CPC médio",     v:R(totalClicks>0?totalSpend/totalClicks:0), c:"#059669" },
            ].map(m => `
              <div style="flex:1;min-width:120px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:4px">
                <p style="margin:0;font-size:11px;color:#64748b">${m.l}</p>
                <p style="margin:0;font-weight:800;font-size:20px;color:${m.c}">${m.v}</p>
              </div>`).join("")}
          </div>
        </div>

        <!-- Per-platform table -->
        <div style="padding:24px 28px">
          <h2 style="font-size:15px;font-weight:800;margin:0 0 14px;color:#0a0a0a">Por plataforma</h2>
          <table style="width:100%;border-collapse:collapse;border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden">
            <thead>
              <tr style="background:#f1f5f9">
                <th style="padding:10px 16px;text-align:left;font-size:12px;color:#64748b">Plataforma</th>
                <th style="padding:10px 16px;font-size:12px;color:#64748b">Camps.</th>
                <th style="padding:10px 16px;font-size:12px;color:#64748b">Gasto</th>
                <th style="padding:10px 16px;font-size:12px;color:#64748b">Impr.</th>
                <th style="padding:10px 16px;font-size:12px;color:#64748b">Cliques</th>
                <th style="padding:10px 16px;font-size:12px;color:#64748b">CPC</th>
                <th style="padding:10px 16px;font-size:12px;color:#64748b">CTR</th>
              </tr>
            </thead>
            <tbody>
              ${platformRow("📘","Meta Ads", data.meta)}
              ${platformRow("🔵","Google Ads", data.google)}
              ${platformRow("🎵","TikTok Ads", data.tiktok)}
            </tbody>
          </table>
        </div>

        <!-- CTA -->
        <div style="padding:0 28px 32px;text-align:center">
          <a href="${APP_URL}/unified-dashboard"
            style="display:inline-block;background:linear-gradient(135deg,#1a73e8,#7c3aed);color:#fff;
              text-decoration:none;border-radius:12px;padding:14px 28px;font-weight:800;font-size:14px">
            📊 Ver Dashboard Completo →
          </a>
          <p style="margin:16px 0 0;font-size:11px;color:#94a3b8">
            Gerado em ${data.generatedAt} · MECPro Campaign Intelligence Builder
          </p>
        </div>
      </div>
    `,
  });

}
export function sendRechargeReminderEmail(
  email:      string,
  name:       string,
  platform:   string,
  amount:     string,
  confirmUrl: string,
  hoursAgo:   number,
) {
  const platLabel: Record<string, string> = {
    meta: "Meta Ads", google: "Google Ads", tiktok: "TikTok Ads",
  };
  const label = platLabel[platform] || platform;

  return resend.emails.send({
    from: FROM,
    to:   email,
    subject: `Lembrete: confirme sua recarga em ${label} — MECPro`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
        <h2 style="font-size:20px;font-weight:800;color:#0a0a0a;margin-bottom:8px">
          Sua recarga em ${label} está pendente
        </h2>
        <p style="color:#495057;font-size:15px;line-height:1.6;margin-bottom:8px">
          Olá ${name},
        </p>
        <p style="color:#495057;font-size:15px;line-height:1.6;margin-bottom:20px">
          Há <strong>${hoursAgo} hora${hoursAgo !== 1 ? "s" : ""}</strong>, você solicitou uma
          recarga de <strong>R$ ${amount}</strong> em <strong>${label}</strong>, mas ainda não
          confirmou que o pagamento foi realizado.
        </p>

        <div style="background:#fff8e1;border:1px solid #f59e0b;border-radius:10px;padding:16px;margin-bottom:24px">
          <p style="margin:0;font-size:14px;color:#92400e;font-weight:700;">◬ O que fazer agora</p>
          <ol style="margin:10px 0 0;padding-left:18px;font-size:14px;color:#78350f;line-height:1.8">
            <li>Acesse o painel de ${label}</li>
            <li>Adicione exatamente <strong>R$ ${amount}</strong></li>
            <li>Volte ao MECPro e clique em <strong>"Confirmar recarga"</strong></li>
          </ol>
        </div>

        <a href="${confirmUrl}"
          style="display:inline-block;padding:14px 28px;background:#0071e3;color:white;
                 border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;margin-bottom:20px">
          Confirmar recarga →
        </a>

        <p style="color:#adb5bd;font-size:13px;margin-top:24px">
          Se você não realizou essa solicitação ou já cancelou, ignore este email.
          Recargas não confirmadas em 24h são canceladas automaticamente e o saldo é devolvido.
        </p>

        <div style="border-top:1px solid #e9ecef;margin-top:24px;padding-top:16px">
          <p style="color:#adb5bd;font-size:12px;margin:0">MECPro · Plataforma de Inteligência de Campanhas</p>
        </div>
      </div>
    `,
  });
}

export function sendRechargeCancelledEmail(
  email:    string,
  name:     string,
  platform: string,
  amount:   string,
) {
  const platLabel: Record<string, string> = {
    meta: "Meta Ads", google: "Google Ads", tiktok: "TikTok Ads",
  };
  const label = platLabel[platform] || platform;

  return resend.emails.send({
    from: FROM,
    to:   email,
    subject: `Recarga cancelada — saldo devolvido — MECPro`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
        <h2 style="font-size:20px;font-weight:800;color:#0a0a0a;margin-bottom:8px">
          Recarga cancelada e saldo devolvido
        </h2>
        <p style="color:#495057;font-size:15px;line-height:1.6;margin-bottom:20px">
          Olá ${name}, sua solicitação de recarga de <strong>R$ ${amount}</strong> em
          <strong>${label}</strong> foi cancelada automaticamente após 24h sem confirmação.
          O valor foi devolvido ao seu saldo MECPro.
        </p>
        <p style="color:#495057;font-size:14px;line-height:1.6">
          Para realizar uma nova recarga, acesse <a href="${APP_URL}/financeiro"
          style="color:#0071e3;font-weight:600">Financeiro → Depositar</a>.
        </p>
        <div style="border-top:1px solid #e9ecef;margin-top:24px;padding-top:16px">
          <p style="color:#adb5bd;font-size:12px;margin:0">MECPro · Plataforma de Inteligência de Campanhas</p>
        </div>
      </div>
    `,
  });
}

export function sendExternalPaymentEmail(
  email:    string,
  name:     string,
  type:     "pix" | "boleto",
  amount:   string,
  platform: string,
  status:   "success" | "failed",
  asaasId?: string,
  errorMsg?: string,
) {
  const platLabel: Record<string, string> = {
    meta: "Meta Ads", google: "Google Ads", tiktok: "TikTok Ads", other: "plataforma externa",
  };
  const label = platLabel[platform] || platform;
  const methodLabel = type === "pix" ? "Pix" : "Boleto";

  const subject = status === "success"
    ? `◎ ${methodLabel} de R$ ${amount} pago — ${label} — MECPro`
    : `◬ Falha no pagamento ${methodLabel} — ${label} — MECPro`;

  const body = status === "success" ? `
    <div style="background:#dcfce7;border:1.5px solid #86efac;border-radius:12px;padding:20px;margin-bottom:20px">
      <p style="margin:0;font-size:16px;font-weight:800;color:#166534">
        ◎ Pagamento executado com sucesso
      </p>
    </div>
    <p style="color:#374151;font-size:14px;line-height:1.7">
      Olá ${name}, seu pagamento de <strong>R$ ${amount}</strong> em <strong>${label}</strong>
      foi processado via ${methodLabel} e o valor foi debitado do seu saldo MECPro.
    </p>
    ${asaasId ? `<p style="color:#6b7280;font-size:12px">ID da transação: <code>${asaasId}</code></p>` : ""}
  ` : `
    <div style="background:#fee2e2;border:1.5px solid #fca5a5;border-radius:12px;padding:20px;margin-bottom:20px">
      <p style="margin:0;font-size:16px;font-weight:800;color:#991b1b">
        ◬ Pagamento não pôde ser executado
      </p>
    </div>
    <p style="color:#374151;font-size:14px;line-height:1.7">
      Olá ${name}, sua tentativa de pagamento de <strong>R$ ${amount}</strong> em
      <strong>${label}</strong> via ${methodLabel} falhou.
      <strong>Nenhum valor foi debitado</strong> do seu saldo MECPro.
    </p>
    ${errorMsg ? `<p style="color:#991b1b;font-size:12px;background:#fef2f2;padding:10px;border-radius:6px">Motivo: ${errorMsg}</p>` : ""}
    <p style="color:#374151;font-size:14px">
      Verifique o código e tente novamente. Se o problema persistir, entre em contato.
    </p>
  `;

  return resend.emails.send({
    from: FROM,
    to:   email,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
        ${body}
        <div style="border-top:1px solid #e9ecef;margin-top:24px;padding-top:16px">
          <p style="color:#adb5bd;font-size:12px;margin:0">MECPro · Plataforma de Inteligência de Campanhas</p>
        </div>
      </div>
    `,
  });
}
