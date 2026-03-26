// Tipos compartilhados do MECPro

export interface User {
  id: number;
  name?: string;
  email: string;
  role: "user" | "admin" | "superadmin";
  plan: "free" | "basic" | "premium" | "vip";
  createdAt: string;
}

export interface Project {
  id: number;
  userId: number;
  name: string;
  description?: string;
  status: "draft" | "analyzing" | "completed" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface ClientProfile {
  id: number;
  projectId: number;
  companyName: string;
  niche: string;
  productService: string;
  targetAudience?: string;
  mainPain?: string;
  desiredTransformation?: string;
  uniqueValueProposition?: string;
  campaignObjective: "leads" | "sales" | "branding" | "traffic" | "engagement";
  monthlyBudget?: number;
  websiteUrl?: string;
}

export interface Competitor {
  id: number;
  projectId: number;
  name: string;
  websiteUrl?: string;
  facebookPageUrl?: string;
  facebookPageId?: string;
}

export interface Campaign {
  id: number;
  projectId: number;
  name: string;
  objective: string;
  platform: string;
  strategy?: string;
  adSets?: string;
  creatives?: string;
  conversionFunnel?: string;
  executionPlan?: string;
  status: string;
  generatedAt: string;
}

export interface SubscriptionPlan {
  id: number;
  name: string;
  slug: string;
  description?: string;
  price: number;
  maxProjects?: number;
  maxCompetitors?: number;
  hasAiAnalysis: number;
  hasMetaIntegration: number;
  hasExportPdf: number;
  hasExportXlsx: number;
  stripePriceId?: string;
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  read: number;
  actionUrl?: string;
  createdAt: string;
}
