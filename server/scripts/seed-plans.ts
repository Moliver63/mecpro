import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { subscriptionPlans } from "../schema";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

const PLANS = [
  {
    name: "Free",
    slug: "free",
    description: "Para conhecer a plataforma",
    price: 0,
    billingInterval: "month" as const,
    maxProjects: 1,
    maxCompetitors: 2,
    hasAiAnalysis: 0,
    hasMetaIntegration: 0,
    hasGoogleIntegration: 0,
    hasExportPdf: 0,
    hasExportXlsx: 0,
    stripePriceId: null,
    isActive: 1,
  },
  {
    name: "Basic",
    slug: "basic",
    description: "Para profissionais autônomos",
    price: 9700,
    billingInterval: "month" as const,
    maxProjects: 3,
    maxCompetitors: 5,
    hasAiAnalysis: 1,
    hasMetaIntegration: 1,
    hasGoogleIntegration: 0,
    hasExportPdf: 0,
    hasExportXlsx: 0,
    stripePriceId: null,
    isActive: 1,
  },
  {
    name: "Premium",
    slug: "premium",
    description: "Para agências e times de marketing",
    price: 19700,
    billingInterval: "month" as const,
    maxProjects: 10,
    maxCompetitors: null,
    hasAiAnalysis: 1,
    hasMetaIntegration: 1,
    hasGoogleIntegration: 1,
    hasExportPdf: 1,
    hasExportXlsx: 1,
    stripePriceId: null,
    isActive: 1,
  },
  {
    name: "VIP",
    slug: "vip",
    description: "Para grandes operações e agências",
    price: 39700,
    billingInterval: "month" as const,
    maxProjects: null,
    maxCompetitors: null,
    hasAiAnalysis: 1,
    hasMetaIntegration: 1,
    hasGoogleIntegration: 1,
    hasExportPdf: 1,
    hasExportXlsx: 1,
    stripePriceId: null,
    isActive: 1,
  },
];

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle(pool);

  for (const plan of PLANS) {
    const existing = await db.select().from(subscriptionPlans).where((t: any) => t.slug.equals?.(plan.slug) ?? true).limit(1);
    if (existing.length === 0) {
      await db.insert(subscriptionPlans).values(plan as any);
      console.log(`✅ Plano criado: ${plan.name} - R$ ${(plan.price/100).toFixed(2)}/mês`);
    } else {
      console.log(`⏭ Plano já existe: ${plan.name}`);
    }
  }

  console.log("\n📋 Planos configurados:");
  console.log("   Free:    R$ 0,00/mês");
  console.log("   Basic:   R$ 97,00/mês");
  console.log("   Premium: R$ 197,00/mês");
  console.log("   VIP:     R$ 397,00/mês");

  await pool.end();
}

seed().catch(e => { console.error(e); process.exit(1); });
