/**
 * paymentService.ts — Camada de abstração para gateways de pagamento
 * Suporta: Stripe, Asaas
 * Para adicionar novo gateway: implementar PaymentProvider e registrar em PROVIDERS
 */
import { log } from "./_core/logger";
import { getPool } from "./db";

// ── Interface padrão ─────────────────────────────────────────────────────────
export interface CreateCustomerData {
  userId:   number;
  email:    string;
  name?:    string;
  cpfCnpj?: string;
}

export interface CreateSubscriptionData {
  userId:    number;
  email:     string;
  planSlug:  "basic" | "premium" | "vip";
  billing:   "monthly" | "yearly";
  cpfCnpj?:  string;
  appUrl?:   string;
}

export interface CreatePaymentData {
  userId:      number;
  email:       string;
  amountCents: number;
  description: string;
  cpfCnpj?:   string;
}

export interface PaymentResult {
  url?:        string;  // redirect URL (Stripe Checkout)
  pixCode?:    string;  // Pix copia-e-cola (Asaas)
  pixQr?:      string;  // QR code base64 (Asaas)
  invoiceId?:  string;  // ID da cobrança no gateway
  customerId?: string;  // ID do cliente no gateway
  expiresAt?:  Date;
}

export interface PaymentProvider {
  name:               string;
  createCustomer(data: CreateCustomerData):     Promise<string>;          // retorna customerId
  createSubscription(data: CreateSubscriptionData): Promise<PaymentResult>;
  createPayment(data: CreatePaymentData):       Promise<PaymentResult>;
  cancelSubscription(subscriptionId: string):   Promise<void>;
}

// ── Stripe Provider ──────────────────────────────────────────────────────────
class StripeProvider implements PaymentProvider {
  name = "stripe";

  private async getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY não configurada");
    const Stripe = (await import("stripe")).default;
    return new Stripe(key, { apiVersion: "2024-11-20.acacia" as any });
  }

  async createCustomer({ email }: CreateCustomerData): Promise<string> {
    const stripe = await this.getStripe();
    const customer = await stripe.customers.create({ email });
    return customer.id;
  }

  async createSubscription(data: CreateSubscriptionData): Promise<PaymentResult> {
    const stripe  = await this.getStripe();
    const appUrl  = data.appUrl || process.env.APP_URL || "https://www.mecproai.com";
    const { getStripePriceId } = await import("./stripe-config");
    const priceId = getStripePriceId(data.planSlug);
    if (!priceId) throw new Error(`Plano "${data.planSlug}" sem Price ID configurado no Stripe`);

    const session = await stripe.checkout.sessions.create({
      mode:                 "subscription",
      payment_method_types: ["card"],
      line_items:           [{ price: priceId, quantity: 1 }],
      customer_email:       data.email,
      success_url:          `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:           `${appUrl}/billing`,
      metadata:             { user_id: String(data.userId), plan_slug: data.planSlug, billing: data.billing },
      locale:               "pt-BR",
    });

    log.info("stripe", "Checkout session criada", { userId: data.userId, planSlug: data.planSlug });
    return { url: session.url! };
  }

  async createPayment(data: CreatePaymentData): Promise<PaymentResult> {
    const stripe  = await this.getStripe();
    const appUrl  = process.env.APP_URL || "https://www.mecproai.com";
    const session = await stripe.checkout.sessions.create({
      mode:                 "payment",
      payment_method_types: ["card"],
      line_items:           [{ price_data: { currency: "brl", unit_amount: data.amountCents, product_data: { name: data.description } }, quantity: 1 }],
      customer_email:       data.email,
      success_url:          `${appUrl}/checkout/success`,
      cancel_url:           `${appUrl}/billing`,
    });
    return { url: session.url!, invoiceId: session.id };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    const stripe = await this.getStripe();
    await stripe.subscriptions.cancel(subscriptionId);
    log.info("stripe", "Assinatura cancelada", { subscriptionId });
  }
}

// ── Asaas Provider ───────────────────────────────────────────────────────────
class AsaasProvider implements PaymentProvider {
  name = "asaas";

  private getKey() {
    const key = process.env.ASAAS_API_KEY;
    if (!key) throw new Error("ASAAS_API_KEY não configurada");
    return key;
  }

  private headers() {
    return { "Content-Type": "application/json", access_token: this.getKey() };
  }

  async createCustomer(data: CreateCustomerData): Promise<string> {
    const key = this.getKey();
    // Busca cliente existente por email
    const search = await fetch(
      `https://api.asaas.com/v3/customers?email=${encodeURIComponent(data.email)}&limit=1`,
      { headers: { access_token: key }, signal: AbortSignal.timeout(8000) }
    );
    const sd: any = await search.json();
    if (sd.data?.[0]?.id) {
      if (data.cpfCnpj) {
        await fetch(`https://api.asaas.com/v3/customers/${sd.data[0].id}`, {
          method: "PUT", headers: this.headers(),
          body: JSON.stringify({ cpfCnpj: data.cpfCnpj?.replace(/\D/g, "") }),
          signal: AbortSignal.timeout(6000),
        });
      }
      return sd.data[0].id;
    }
    // Cria novo
    const res  = await fetch("https://api.asaas.com/v3/customers", {
      method: "POST", headers: this.headers(), signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        name:             data.name || data.email,
        email:            data.email,
        cpfCnpj:          data.cpfCnpj?.replace(/\D/g, ""),
        externalReference:String(data.userId),
        notificationDisabled: true,
      }),
    });
    const rd: any = await res.json();
    if (!rd.id) throw new Error(`Asaas createCustomer falhou: ${rd.errors?.[0]?.description || JSON.stringify(rd)}`);
    return rd.id;
  }

  async createSubscription(data: CreateSubscriptionData): Promise<PaymentResult> {
    const MONTHLY: Record<string, number> = { basic: 97, premium: 197, vip: 397 };
    const monthly = MONTHLY[data.planSlug];
    const amount  = data.billing === "yearly" ? Math.floor(monthly * 0.8) * 12 : monthly;
    const cycle   = data.billing === "yearly" ? "YEARLY" : "MONTHLY";

    const customerId = await this.createCustomer({ userId: data.userId, email: data.email, cpfCnpj: data.cpfCnpj });

    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 1);
    const dueDateStr = nextDue.toISOString().split("T")[0];

    const res = await fetch("https://api.asaas.com/v3/subscriptions", {
      method: "POST", headers: this.headers(), signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        customer:         customerId,
        billingType:      "PIX",
        value:            amount,
        nextDueDate:      dueDateStr,
        cycle,
        description:      `MECProAI ${data.planSlug} ${cycle.toLowerCase()}`,
        externalReference:`user_${data.userId}_${data.planSlug}`,
      }),
    });
    const rd: any = await res.json();
    if (!rd.id) throw new Error(`Asaas createSubscription falhou: ${rd.errors?.[0]?.description || JSON.stringify(rd)}`);

    log.info("asaas", "Assinatura criada", { userId: data.userId, planSlug: data.planSlug, subId: rd.id });

    // Busca Pix da primeira cobrança
    const appUrl = data.appUrl || process.env.APP_URL || "https://www.mecproai.com";
    return {
      url:       `${appUrl}/checkout/asaas?sub=${rd.id}&plan=${data.planSlug}`,
      invoiceId: rd.id,
    };
  }

  async createPayment(data: CreatePaymentData): Promise<PaymentResult> {
    const customerId = await this.createCustomer({ userId: data.userId, email: data.email, cpfCnpj: data.cpfCnpj });
    const nextDue    = new Date(); nextDue.setDate(nextDue.getDate() + 1);

    const res = await fetch("https://api.asaas.com/v3/payments", {
      method: "POST", headers: this.headers(), signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        customer:         customerId,
        billingType:      "PIX",
        value:            data.amountCents / 100,
        dueDate:          nextDue.toISOString().split("T")[0],
        description:      data.description,
        externalReference:`user_${data.userId}`,
      }),
    });
    const rd: any = await res.json();
    if (!rd.id) throw new Error(`Asaas createPayment falhou: ${rd.errors?.[0]?.description || JSON.stringify(rd)}`);

    // Busca QR Code Pix
    let pixCode = ""; let pixQr = "";
    try {
      const pixRes  = await fetch(`https://api.asaas.com/v3/payments/${rd.id}/pixQrCode`,
        { headers: { access_token: this.getKey() }, signal: AbortSignal.timeout(8000) });
      const pixData: any = await pixRes.json();
      pixCode = pixData.payload || "";
      pixQr   = pixData.encodedImage || "";
    } catch {}

    return { pixCode, pixQr, invoiceId: rd.id, expiresAt: new Date(nextDue) };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await fetch(`https://api.asaas.com/v3/subscriptions/${subscriptionId}`, {
      method: "DELETE", headers: this.headers(), signal: AbortSignal.timeout(8000),
    });
    log.info("asaas", "Assinatura cancelada", { subscriptionId });
  }
}

// ── Registry de providers ────────────────────────────────────────────────────
const PROVIDERS: Record<string, PaymentProvider> = {
  stripe: new StripeProvider(),
  asaas:  new AsaasProvider(),
};

// ── getActiveProvider — lê o gateway ativo do banco ──────────────────────────
let _cachedGateway: string | null = null;
let _cacheTime = 0;

export async function getActiveProvider(): Promise<PaymentProvider> {
  // Cache de 60s para não bater no banco a cada request
  const now = Date.now();
  if (!_cachedGateway || now - _cacheTime > 60_000) {
    try {
      const pool = await getPool();
      if (pool) {
        const row = await pool.query(`SELECT value FROM app_settings WHERE key = 'payment_gateway' LIMIT 1`);
        _cachedGateway = row.rows[0]?.value || "stripe";
      } else {
        _cachedGateway = "stripe";
      }
    } catch {
      _cachedGateway = "stripe";
    }
    _cacheTime = now;
  }

  const provider = PROVIDERS[_cachedGateway];
  if (!provider) {
    log.warn("payment", `Gateway "${_cachedGateway}" não encontrado — usando stripe`);
    return PROVIDERS.stripe;
  }

  log.info("payment", `Gateway ativo: ${_cachedGateway}`);
  return provider;
}

// Invalida cache quando admin troca o gateway
export function invalidateGatewayCache() {
  _cachedGateway = null;
  _cacheTime     = 0;
}

export { StripeProvider, AsaasProvider };
