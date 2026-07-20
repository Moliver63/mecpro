/**
 * siteAnalyticsRouter.ts
 *
 * Puxa métricas REAIS do GA4 (mecproai.com) via Google Analytics Data API,
 * usando uma Service Account (credenciais em GA4_SERVICE_ACCOUNT_JSON).
 *
 * Rotas: trpc.siteAnalytics.*
 * Todos os endpoints são adminProcedure (só admin vê métricas do site).
 */

import { z } from "zod";
import { log } from "../logger";
import { router, adminProcedure } from "./trpc";

const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || "476009199";

// Lazy import: @google-analytics/data só é carregado se a credencial existir,
// evita crash no boot se a lib não estiver instalada ainda ou faltar env var.
async function getGa4Client() {
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  let credentials: any;
  try {
    credentials = JSON.parse(raw);
  } catch {
    log.warn("ga4", "GA4_SERVICE_ACCOUNT_JSON presente mas não é JSON válido");
    return null;
  }

  const { BetaAnalyticsDataClient } = await import("@google-analytics/data");
  return new BetaAnalyticsDataClient({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
  });
}

export const siteAnalyticsRouter = router({
  // ── Status da integração (credencial presente? property acessível?) ──────
  status: adminProcedure.query(async () => {
    const configured = !!process.env.GA4_SERVICE_ACCOUNT_JSON;
    if (!configured) {
      return { configured: false, connected: false, error: null, propertyId: GA4_PROPERTY_ID };
    }
    try {
      const client = await getGa4Client();
      if (!client) return { configured: true, connected: false, error: "Credencial inválida", propertyId: GA4_PROPERTY_ID };

      // Chamada mínima só pra validar acesso (1 dia, 1 métrica)
      await client.runReport({
        property: `properties/${GA4_PROPERTY_ID}`,
        dateRanges: [{ startDate: "yesterday", endDate: "today" }],
        metrics: [{ name: "activeUsers" }],
      });
      return { configured: true, connected: true, error: null, propertyId: GA4_PROPERTY_ID };
    } catch (e: any) {
      log.warn("ga4", "Falha ao validar acesso GA4", { error: e?.message });
      return { configured: true, connected: false, error: e?.message || "Erro desconhecido", propertyId: GA4_PROPERTY_ID };
    }
  }),

  // ── Série temporal (para o gráfico) ───────────────────────────────────────
  timeseries: adminProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .query(async ({ input }) => {
      const client = await getGa4Client();
      if (!client) {
        throw new Error("GA4 não configurado. Defina GA4_SERVICE_ACCOUNT_JSON no ambiente.");
      }

      const [response] = await client.runReport({
        property: `properties/${GA4_PROPERTY_ID}`,
        dateRanges: [{ startDate: `${input.days}daysAgo`, endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
        ],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      });

      const rows = (response.rows || []).map((r: any) => {
        const raw = r.dimensionValues[0].value; // YYYYMMDD
        const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
        return {
          date,
          activeUsers: Number(r.metricValues[0].value),
          sessions:    Number(r.metricValues[1].value),
          pageViews:   Number(r.metricValues[2].value),
          bounceRate:  Number(Number(r.metricValues[3].value).toFixed(1)), // já vem 0-1 ou 0-100 dependendo da API; GA4 retorna fração
        };
      });

      return { rows, propertyId: GA4_PROPERTY_ID, days: input.days };
    }),

  // ── Totais do período + comparação com período anterior ──────────────────
  summary: adminProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .query(async ({ input }) => {
      const client = await getGa4Client();
      if (!client) {
        throw new Error("GA4 não configurado. Defina GA4_SERVICE_ACCOUNT_JSON no ambiente.");
      }

      const [response] = await client.runReport({
        property: `properties/${GA4_PROPERTY_ID}`,
        dateRanges: [
          { startDate: `${input.days}daysAgo`, endDate: "today" },
          { startDate: `${input.days * 2}daysAgo`, endDate: `${input.days + 1}daysAgo` }, // período anterior, mesmo tamanho
        ],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
        ],
      });

      const current  = response.rows?.[0]?.metricValues?.map((m: any) => Number(m.value)) || [0, 0, 0, 0];
      const previous = response.rows?.[1]?.metricValues?.map((m: any) => Number(m.value)) || [0, 0, 0, 0];

      const pctChange = (curr: number, prev: number) => prev === 0 ? null : Number((((curr - prev) / prev) * 100).toFixed(1));

      return {
        activeUsers:  { value: current[0], changePct: pctChange(current[0], previous[0]) },
        sessions:     { value: current[1], changePct: pctChange(current[1], previous[1]) },
        pageViews:    { value: current[2], changePct: pctChange(current[2], previous[2]) },
        avgSessionSec:{ value: Math.round(current[3]), changePct: pctChange(current[3], previous[3]) },
      };
    }),
});
