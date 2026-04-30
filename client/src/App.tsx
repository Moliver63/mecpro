import { Switch, Route, Redirect } from "wouter";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import { useEffect } from "react";

// Carrega config de visibilidade uma vez e salva no sessionStorage
// Feito fora do Layout para evitar hook tRPC em componente crítico
function UIConfigLoader() {
  const { data } = trpc.public.getUIConfig.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  useEffect(() => {
    if ((data as any)?.visibility) {
      try { sessionStorage.setItem("mecpro_ui_visibility", JSON.stringify((data as any).visibility)); } catch {}
    }
  }, [data]);
  return null;
}
import AdminUIConfig from "@/pages/AdminUIConfig";
import CheckoutAsaas from "@/pages/CheckoutAsaas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { trpc, trpcClient } from "@/lib/trpc";

// Pages - Public
import Landing from "@/pages/Landing";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/VerifyEmail";
import Pricing from "@/pages/Pricing";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import FAQ from "@/pages/FAQ";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Courses from "@/pages/Courses";
import CourseDetail from "@/pages/CourseDetail";
import Ebooks from "@/pages/Ebooks";
import EbookReader from "@/pages/EbookReader";
import Unauthorized from "@/pages/Unauthorized";
import NotFound from "@/pages/NotFound";

// Pages - User
import Dashboard from "@/pages/Dashboard";
import Projects from "@/pages/Projects";
import NewProject from "@/pages/NewProject";
import ProjectDetail from "@/pages/ProjectDetail";
import ClientProfile from "@/pages/ClientProfile";
import CompetitorAnalysis from "@/pages/CompetitorAnalysis";
import MarketIntelligence from "@/pages/MarketIntelligence";
import CampaignBuilder from "@/pages/CampaignBuilder";
import CampaignResult from "@/pages/CampaignResult";
import Settings from "@/pages/Settings";
import MetaIntegration from "@/pages/MetaIntegration";
import MetaOAuthCallback from "@/pages/MetaOAuthCallback";
import GoogleAdsOAuthCallback from "@/pages/GoogleAdsOAuthCallback";
import TikTokOAuthCallback from "@/pages/TikTokOAuthCallback";
import MetaCampaigns from "@/pages/MetaCampaigns";
import UnifiedDashboard from "@/pages/UnifiedDashboard";
import Consultas from "@/pages/Consultas";
import Profile from "@/pages/Profile";
import EditProfile from "@/pages/EditProfile";
import Billing from "@/pages/Billing";
import Marketplace from "@/pages/Marketplace";
import PublishListing from "@/pages/PublishListing";
import SellerDashboard from "@/pages/SellerDashboard";
import MySubscription from "@/pages/MySubscription";
import Notifications from "@/pages/Notifications";
import Messages from "@/pages/Messages";
import MyCourses from "@/pages/MyCourses";
import LessonView from "@/pages/LessonView";
import MyCertificates from "@/pages/MyCertificates";
import UserReferrals from "@/pages/UserReferrals";
import CommunityExplore from "@/pages/CommunityExplore";
import CommunityConnections from "@/pages/CommunityConnections";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import AcceptAdminInvite from "@/pages/AcceptAdminInvite";
import Academy from "@/pages/Academy";

// Pages - Admin
import AdminDashboard from "@/pages/AdminDashboard";
import AdminUsers from "@/pages/AdminUsers";
import AdminProjects from "@/pages/AdminProjects";
import AdminSettings from "@/pages/AdminSettings";
import AdminAnalytics from "@/pages/AdminAnalytics";
import AdminInvites from "@/pages/AdminInvites";
import AdminManageAdmins from "@/pages/AdminManageAdmins";
import AdminManageSubscriptions from "@/pages/AdminManageSubscriptions";
import Financeiro from "@/pages/Financeiro";
import AdminAuditoria from "@/pages/AdminAuditoria";
import AdminFinanceiro from "@/pages/AdminFinanceiro";
import AdminPlans from "@/pages/AdminPlans";
import AdminModeration from "@/pages/AdminModeration";
import AdminStudents from "@/pages/AdminStudents";
import AdminCourses from "@/pages/AdminCourses";
import AdminLessons from "@/pages/AdminLessons";
import AdminCourseLessons from "@/pages/AdminCourseLessons";
import AdminPrograms from "@/pages/AdminPrograms";
import AdminAppointments from "@/pages/AdminAppointments";
import AdminCashbackRequests from "@/pages/AdminCashbackRequests";
import AdminAccountSettings from "@/pages/AdminAccountSettings";
import AdminRoles from "@/pages/AdminRoles";
import AdminPlanRequests from "@/pages/AdminPlanRequests";
import FacebookCampaignCreator from "@/pages/FacebookCampaignCreator";
import AutonomousAgent from "@/pages/AutonomousAgent";
import MediaBudget from "@/pages/MediaBudget";
import BudgetDistribution from "@/pages/BudgetDistribution";
import PlatformPayment from "@/pages/PlatformPayment";
import RechargeGuide from "@/pages/RechargeGuide";
import GoogleAdsIntegration from "@/pages/GoogleAdsIntegration";
import GoogleCampaignCreator from "@/pages/GoogleCampaignCreator";
import GoogleCampaigns from "@/pages/GoogleCampaigns";
import TikTokIntegration from "@/pages/TikTokIntegration";
import TikTokCampaignCreator from "@/pages/TikTokCampaignCreator";
import TikTokCampaigns from "@/pages/TikTokCampaigns";
import TikTokVideoCreator from "@/pages/TikTokVideoCreator";
import AlertsSettings from "@/pages/AlertsSettings";

// ── NOVO: Inteligência de Campanhas (Admin) ──────────────────────────────────
import AdminCampaignIntelligence from "@/pages/AdminCampaignIntelligence";

// ── PROMOÇÃO: Plano Anual com 60% de crédito ─────────────────────────────────
import PromoAnual    from "@/pages/PromoAnual";
import CheckoutAnual from "@/pages/CheckoutAnual";
import LandingNormal from "@/pages/LandingNormal";

// Components
import ProtectedRoute from "@/components/shared/ProtectedRoute";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import CookieConsent from "@/components/shared/CookieConsent";
import MECPROAssistantChat from "@/components/shared/MECPROAssistantChat";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (count, err: any) => err?.status >= 500 && count < 2 } },
});

// ── Landing dinâmica: promo ou normal conforme admin ─────────────────────────
import { useEffect, useState } from "react";
function LandingRouter() {
  const [mode, setMode] = useState<"promo"|"normal"|null>(null);
  useEffect(() => {
    fetch("/api/trpc/public.getLandingMode", { credentials: "include" })
      .then(r => r.json())
      .then(d => setMode(d?.result?.data?.mode ?? "normal"))
      .catch(() => setMode("normal"));
  }, []);
  if (mode === null) return null; // loading silencioso
  return mode === "normal" ? <LandingNormal /> : <Landing />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <Switch>
            {/* PUBLIC */}
            <Route path="/" component={LandingRouter} />
            <Route path="/home" component={Home} />
            <Route path="/pricing" component={Pricing} />
            <Route path="/about" component={About} />
            <Route path="/contact" component={Contact} />
            <Route path="/faq" component={FAQ} />
            <Route path="/terms" component={Terms} />
            <Route path="/privacy" component={Privacy} />
            <Route path="/courses" component={Courses} />
            <Route path="/courses/:slug" component={CourseDetail} />
            <Route path="/marketplace" component={Marketplace} />
            <Route path="/marketplace/publish"><ProtectedRoute><PublishListing /></ProtectedRoute></Route>
            <Route path="/marketplace/seller"><ProtectedRoute><SellerDashboard /></ProtectedRoute></Route>
            <Route path="/marketplace/:slug" component={Marketplace} />
            <Route path="/ebooks" component={Ebooks} />
            <Route path="/ebook/:id" component={EbookReader} />
            <Route path="/login" component={Login} />
            <Route path="/auth/meta/callback"   component={MetaOAuthCallback} />
            <Route path="/auth/google/callback" component={GoogleAdsOAuthCallback} />
            <Route path="/auth/tiktok/callback" component={TikTokOAuthCallback} />
            <Route path="/register" component={Register} />
            <Route path="/signup" component={Signup} />
            <Route path="/forgot-password" component={ForgotPassword} />
            <Route path="/reset-password" component={ResetPassword} />
            <Route path="/reset-password/:token" component={ResetPassword} />
            <Route path="/verify-email" component={VerifyEmail} />
            <Route path="/accept-invite/:token" component={AcceptAdminInvite} />
            <Route path="/unauthorized" component={Unauthorized} />
            <Route path="/404" component={NotFound} />
            <Route path="/promo" component={PromoAnual} />
            <Route path="/promo-anual" component={PromoAnual} />
            <Route path="/checkout-anual"><ProtectedRoute><CheckoutAnual /></ProtectedRoute></Route>

            {/* USER */}
            <Route path="/dashboard"><ProtectedRoute><Dashboard /></ProtectedRoute></Route>
            <Route path="/dashboard/referrals"><ProtectedRoute><UserReferrals /></ProtectedRoute></Route>
            <Route path="/projects"><ProtectedRoute><Projects /></ProtectedRoute></Route>
            <Route path="/projects/new"><ProtectedRoute><NewProject /></ProtectedRoute></Route>
            <Route path="/projects/:id"><ProtectedRoute><ProjectDetail /></ProtectedRoute></Route>
            <Route path="/projects/:id/client"><ProtectedRoute><ClientProfile /></ProtectedRoute></Route>
            <Route path="/projects/:id/competitors"><ProtectedRoute><CompetitorAnalysis /></ProtectedRoute></Route>
            <Route path="/projects/:id/market"><ProtectedRoute><MarketIntelligence /></ProtectedRoute></Route>
            <Route path="/projects/:id/campaign"><ProtectedRoute><CampaignBuilder /></ProtectedRoute></Route>
            <Route path="/projects/:id/campaign/result/:campaignId"><ProtectedRoute><CampaignResult /></ProtectedRoute></Route>
            <Route path="/projects/:id/campaign/result/:campaignId/google"><ProtectedRoute><GoogleCampaignCreator /></ProtectedRoute></Route>
            <Route path="/projects/:id/campaign/result/:campaignId/tiktok"><ProtectedRoute><TikTokCampaignCreator /></ProtectedRoute></Route>
            <Route path="/projects/:id/campaign/result/:campaignId/tiktok-video"><ProtectedRoute><TikTokVideoCreator /></ProtectedRoute></Route>
            <Route path="/projects/:id/campaign/result/:campaignId/:extra">{({ id, campaignId, extra }: any) => {
              const knownExtras = ["google", "tiktok", "tiktok-video"];
              if (knownExtras.includes(extra)) return null;
              const cid = Number(campaignId);
              const pid = Number(id);
              if (cid > 0 && pid > 0) {
                window.location.replace(`/projects/${pid}/campaign/result/${cid}`);
              } else {
                window.location.replace(`/projects/${pid || ""}/campaign`);
              }
              return null;
            }}</Route>
            <Route path="/profile"><ProtectedRoute><Profile /></ProtectedRoute></Route>
            <Route path="/edit-profile"><ProtectedRoute><EditProfile /></ProtectedRoute></Route>
            <Route path="/settings"><ProtectedRoute><Settings /></ProtectedRoute></Route>
            <Route path="/settings/meta"><ProtectedRoute><MetaIntegration /></ProtectedRoute></Route>
            <Route path="/settings/google"><ProtectedRoute><GoogleAdsIntegration /></ProtectedRoute></Route>
            <Route path="/google-campaign/new"><ProtectedRoute><GoogleCampaignCreator /></ProtectedRoute></Route>
            <Route path="/settings/tiktok"><ProtectedRoute><TikTokIntegration /></ProtectedRoute></Route>
            <Route path="/tiktok-campaign/new"><ProtectedRoute><TikTokCampaignCreator /></ProtectedRoute></Route>
            <Route path="/tiktok-video/new"><ProtectedRoute><TikTokVideoCreator /></ProtectedRoute></Route>
            <Route path="/projects/:id/tiktok-video"><ProtectedRoute><TikTokVideoCreator /></ProtectedRoute></Route>
            <Route path="/settings/alerts"><ProtectedRoute><AlertsSettings /></ProtectedRoute></Route>
            <Route path="/projects/:id/tiktok-campaign"><ProtectedRoute><TikTokCampaignCreator /></ProtectedRoute></Route>
            <Route path="/projects/:id/google-campaign"><ProtectedRoute><GoogleCampaignCreator /></ProtectedRoute></Route>
            <Route path="/meta-campaigns"><ProtectedRoute><MetaCampaigns /></ProtectedRoute></Route>
            <Route path="/google-campaigns"><ProtectedRoute><GoogleCampaigns /></ProtectedRoute></Route>
            <Route path="/tiktok-campaigns"><ProtectedRoute><TikTokCampaigns /></ProtectedRoute></Route>
            <Route path="/unified-dashboard"><ProtectedRoute><UnifiedDashboard /></ProtectedRoute></Route>
            <Route path="/facebook-campaign/new"><ProtectedRoute><FacebookCampaignCreator /></ProtectedRoute></Route>
            <Route path="/autonomous-agent"><ProtectedRoute><AutonomousAgent /></ProtectedRoute></Route>
            <Route path="/financeiro"><ProtectedRoute><Financeiro /></ProtectedRoute></Route>
            <Route path="/media-budget"><ProtectedRoute><MediaBudget /></ProtectedRoute></Route>
            <Route path="/budget-distribution"><ProtectedRoute><BudgetDistribution /></ProtectedRoute></Route>
            <Route path="/platform-payment"><ProtectedRoute><PlatformPayment /></ProtectedRoute></Route>
            <Route path="/recharge-guide"><ProtectedRoute><RechargeGuide /></ProtectedRoute></Route>
            <Route path="/projects/:id/facebook-campaign"><ProtectedRoute><FacebookCampaignCreator /></ProtectedRoute></Route>
            <Route path="/consultas"><ProtectedRoute><Consultas /></ProtectedRoute></Route>
            <Route path="/billing"><ProtectedRoute><Billing /></ProtectedRoute></Route>
            <Route path="/my-subscription"><ProtectedRoute><MySubscription /></ProtectedRoute></Route>
            <Route path="/notifications"><ProtectedRoute><Notifications /></ProtectedRoute></Route>
            <Route path="/messages"><ProtectedRoute><Messages /></ProtectedRoute></Route>
            <Route path="/my-courses"><ProtectedRoute><MyCourses /></ProtectedRoute></Route>
            <Route path="/lesson/:id"><ProtectedRoute><LessonView /></ProtectedRoute></Route>
            <Route path="/certificates"><ProtectedRoute><MyCertificates /></ProtectedRoute></Route>
            <Route path="/community/explore"><ProtectedRoute><CommunityExplore /></ProtectedRoute></Route>
            <Route path="/community/connections"><ProtectedRoute><CommunityConnections /></ProtectedRoute></Route>
            <Route path="/checkout/success"><ProtectedRoute><CheckoutSuccess /></ProtectedRoute></Route>
            <Route path="/academy"><ProtectedRoute><Academy /></ProtectedRoute></Route>

            {/* ADMIN */}
            <Route path="/admin"><ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute></Route>
            <Route path="/admin/users"><ProtectedRoute role="admin"><AdminUsers /></ProtectedRoute></Route>
            <Route path="/admin/projects"><ProtectedRoute role="admin"><AdminProjects /></ProtectedRoute></Route>
            <Route path="/admin/analytics"><ProtectedRoute role="admin"><AdminAnalytics /></ProtectedRoute></Route>
            <Route path="/admin/settings"><ProtectedRoute role="admin"><AdminSettings /></ProtectedRoute></Route>
            <Route path="/admin/invites"><ProtectedRoute role="admin"><AdminInvites /></ProtectedRoute></Route>
            <Route path="/admin/manage-admins"><ProtectedRoute role="admin"><AdminManageAdmins /></ProtectedRoute></Route>
            <Route path="/admin/manage-subscriptions"><ProtectedRoute role="admin"><AdminManageSubscriptions /></ProtectedRoute></Route>
            <Route path="/admin/auditoria"><ProtectedRoute role="admin"><AdminAuditoria /></ProtectedRoute></Route>
            <Route path="/admin/financeiro"><ProtectedRoute role="admin"><AdminFinanceiro /></ProtectedRoute></Route>
            <Route path="/admin/plans"><ProtectedRoute role="admin"><AdminPlans /></ProtectedRoute></Route>
            <Route path="/admin/moderation"><ProtectedRoute role="admin"><AdminModeration /></ProtectedRoute></Route>
            <Route path="/admin/students"><ProtectedRoute role="admin"><AdminStudents /></ProtectedRoute></Route>
            <Route path="/admin/courses"><ProtectedRoute role="admin"><AdminCourses /></ProtectedRoute></Route>
            <Route path="/admin/lessons"><ProtectedRoute role="admin"><AdminLessons /></ProtectedRoute></Route>
            <Route path="/admin/courses/:id/lessons"><ProtectedRoute role="admin"><AdminCourseLessons /></ProtectedRoute></Route>
            <Route path="/admin/programs"><ProtectedRoute role="admin"><AdminPrograms /></ProtectedRoute></Route>
            <Route path="/admin/appointments"><ProtectedRoute role="admin"><AdminAppointments /></ProtectedRoute></Route>
            <Route path="/admin/cashback-requests"><ProtectedRoute role="admin"><AdminCashbackRequests /></ProtectedRoute></Route>
            <Route path="/admin/account-settings"><ProtectedRoute role="admin"><AdminAccountSettings /></ProtectedRoute></Route>
            <Route path="/admin/roles"><ProtectedRoute role="admin"><AdminRoles /></ProtectedRoute></Route>
            <Route path="/admin/plan-requests"><ProtectedRoute role="admin"><AdminPlanRequests /></ProtectedRoute></Route>
            <Route path="/admin/management"><ProtectedRoute role="admin"><AdminManageAdmins /></ProtectedRoute></Route>
            <Route path="/admin/accept-invite"><ProtectedRoute role="admin"><AdminInvites /></ProtectedRoute></Route>

            {/* ── NOVO: Inteligência de Campanhas ─────────────────────────── */}
            <Route path="/admin/ui-config">
              <ProtectedRoute role="admin"><AdminUIConfig /></ProtectedRoute>
            </Route>
            <Route path="/admin/intelligence">
              <ProtectedRoute role="admin"><AdminCampaignIntelligence /></ProtectedRoute>
            </Route>

            {/* Aliases pt-BR */}
            <Route path="/precos"><Redirect to="/pricing" /></Route>
            <Route path="/plataforma"><Redirect to="/" /></Route>
            <Route path="/sobre"><Redirect to="/about" /></Route>
            <Route path="/contato"><Redirect to="/contact" /></Route>
            <Route component={NotFound} />
          </Switch>
          <CookieConsent />
          <MECPROAssistantChat />
          <UIConfigLoader />
          <PWAInstallBanner />
          <Toaster richColors position="top-right" />
        </QueryClientProvider>
      </trpc.Provider>
    </ErrorBoundary>
  );
}
// build force Thu Mar 19 18:22:11 UTC 2026
