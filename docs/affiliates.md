# Programa de parceiros (comissao sobre mensalidade)

Parceiro indica a MecProAI e recebe comissao sobre a assinatura do indicado.

## Regra padrao
- 10% do valor efetivamente pago (`invoice.amount_paid`), nos 3 primeiros pagamentos (`maxPayments`).
- Carencia de 7 dias corridos (`holdDays`, minimo 7): art. 49 do CDC. Antes disso a comissao fica "em carencia" e nao pode ser paga.
- Repasse por Pix, minimo R$ 20,00, registrado em `/admin/affiliates` ("Registrar repasse").
- Reembolso total (`charge.refunded`): comissao pendente e cancelada; se ja paga, vira `clawback` e e descontada do proximo repasse. Reembolso parcial so gera nota para revisao manual.
- Credito de midia (`wallet_deposit`) nao gera comissao: so faturas de assinatura (`invoice.payment_succeeded`).

## Fluxo
1. Admin cria o parceiro (`trpc.affiliates.create`) e recebe o link `https://www.mecproai.com/register?ref=CODIGO`.
2. `main.tsx` guarda `?ref=` em localStorage (`mp_ref`); `Register.tsx` envia `ref` em `auth.register`; `attachReferral` vincula o usuario (1 parceiro por usuario, sem auto-indicacao, nunca bloqueia cadastro).
3. Webhook Stripe `invoice.payment_succeeded` -> `recordCommissionFromInvoice` (idempotente por `stripeInvoiceId`), em try/catch: comissao nunca bloqueia ativacao de plano.
4. Usuario de Google OAuth pode vincular depois com `trpc.affiliates.claim` (so se ainda nao assina).

## Tabelas (aditivas, `AFFILIATES_MIGRATION` no boot)
`affiliates`, `affiliate_referrals` (userId unico), `affiliate_commissions` (stripeInvoiceId unico).

## Pontos nao confirmados
- Confirmar com um evento real que `invoice.customer` encontra o usuario por `users.stripeCustomerId`, e que `charge.invoice` / `charge.payment_intent` casam com a comissao no reembolso (a API do Stripe varia por versao).
- Entrada por Google OAuth ainda nao captura `ref` automaticamente (usar `claim`).
- Tela admin ainda sem link no menu lateral: acessar `/admin/affiliates`.
