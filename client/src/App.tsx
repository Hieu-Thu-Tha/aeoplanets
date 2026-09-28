import { Switch, Route, Redirect, Link, useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ScanProgressOverlay } from "@/components/ScanProgressOverlay";
import { BrandProvider, useBrand } from "@/contexts/BrandContext";
import { BrandSwitcher } from "@/components/BrandSwitcher";
import { SuperAdminSwitcher, SuperAdminBanner } from "@/components/SuperAdminSwitcher";
import { AiUsageCapBanner } from "@/components/AiUsageCapBanner";
import { InviteTeamDialog } from "@/components/InviteTeamDialog";
import { WelcomeVideoModal } from "@/components/WelcomeVideoModal";
import { usePermissions } from "@/hooks/usePermissions";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Pricing from "@/pages/pricing";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Dashboard from "@/pages/dashboard";
import Onboarding from "@/pages/onboarding";
import Perception from "@/pages/perception";
import Coverage from "@/pages/coverage";
import Competitors from "@/pages/competitors";
import Audit from "@/pages/audit";
import Alerts from "@/pages/alerts";
import Reports from "@/pages/reports";
import Terms from "@/pages/terms";
import TermDetail from "@/pages/term-detail";
import BrandSettings from "@/pages/brand-settings";
import RunDetail from "@/pages/run-detail";
import Billing from "@/pages/billing";
import SelectPlan from "@/pages/select-plan";
import Checkout from "@/pages/checkout";
import AdminNews from "@/pages/admin-news";
import AdminReviews from "@/pages/admin-reviews";
import AdminAccounts from "@/pages/admin-accounts";
import AdminSystemConfig from "@/pages/admin-system-config";
import News from "@/pages/news";
import NewsArticle from "@/pages/news-article";
import Privacy from "@/pages/privacy";
import ThankYou from "@/pages/thank-you";
import Resources from "@/pages/resources";
import UserGuide from "@/pages/user-guide";
import Actions from "@/pages/actions";
import WebVitals from "@/pages/web-vitals";
import VisibilityReport from "@/pages/visibility-report";
import Team from "@/pages/team";
import AcceptInvite from "@/pages/accept-invite";
import VerifyEmail from "@/pages/verify-email";
import StartTrial from "@/pages/start-trial";

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

function AppContent() {
  const { isAuthenticated, isLoading, user, needsEmailVerification } = useAuth();
  const [currentPath] = useLocation();

  const { data: billingData, isLoading: billingLoading, isFetching: billingFetching } = useQuery<any>({
    queryKey: ["/api/billing/subscription"],
    enabled: !!user,
    staleTime: 60000,
    retry: 2,
  });

  const hasEverHadSubscription = useRef(false);
  if (billingData?.subscription) {
    hasEverHadSubscription.current = true;
  }

  const publicPaths = ["/", "/pricing", "/select-plan", "/privacy", "/login", "/signup", "/forgot-password", "/reset-password", "/thank-you", "/news", "/resources", "/verify-email", "/start-trial"];
  const isPublicPath = publicPaths.includes(currentPath) || currentPath.startsWith("/news/") || currentPath.startsWith("/accept-invite/");

  if (isLoading && !isPublicPath) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (needsEmailVerification) {
    return (
      <Switch>
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/" component={Landing} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/news" component={News} />
        <Route path="/news/:slug" component={NewsArticle} />
        <Route path="/resources" component={Resources} />
        <Route>
          <Redirect to="/verify-email" />
        </Route>
      </Switch>
    );
  }

  if (!isAuthenticated || isLoading) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/trial">{() => { window.location.replace("/"); return null; }}</Route>
        <Route path="/pricing" component={Pricing} />
        <Route path="/select-plan" component={SelectPlan} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/thank-you" component={ThankYou} />
        <Route path="/news" component={News} />
        <Route path="/news/:slug" component={NewsArticle} />
        <Route path="/resources" component={Resources} />
        <Route path="/accept-invite/:token" component={AcceptInvite} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/start-trial" component={StartTrial} />
        <Route component={Landing} />
      </Switch>
    );
  }

  const isAdminProvisioned = user?.accountType === "admin_provisioned";
  const hasSubscription = !!billingData?.subscription;
  const billingLoaded = !billingLoading;
  const isPlanFlow = ["/select-plan", "/checkout", "/billing", "/onboarding"].includes(currentPath);

  const isTrialExpired = billingLoaded && hasSubscription &&
    billingData?.trialEnd != null && billingData?.isInTrial === false;

  return (
    <BrandProvider>
      <ErrorBoundary>
        <AuthenticatedApp
          hasSubscription={hasSubscription}
          hasEverHadSubscription={hasEverHadSubscription}
          billingLoaded={billingLoaded}
          billingFetching={billingFetching}
          isPlanFlow={isPlanFlow}
          currentPath={currentPath}
          user={user}
          isTrialExpired={isTrialExpired}
          isAdminProvisioned={isAdminProvisioned}
          billingData={billingData}
        />
      </ErrorBoundary>
    </BrandProvider>
  );
}

function ProvisionedTrialBanner({ billingData }: { billingData: any }) {
  const trialEnd = billingData?.trialEnd;
  if (!trialEnd) return null;

  const endDate = new Date(trialEnd);
  const now = Date.now();
  const msLeft = endDate.getTime() - now;
  const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));

  return (
    <div
      className="bg-primary/10 border-b border-primary/20 px-4 py-2 text-center text-sm"
      data-testid="banner-provisioned-trial"
    >
      <span className="text-primary font-medium">Free Trial</span>
      <span className="text-muted-foreground ml-2">
        {daysLeft > 0
          ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`
          : "Your trial has expired"}
      </span>
      <span className="mx-2 text-muted-foreground">—</span>
      <a
        href="/select-plan"
        className="text-primary underline underline-offset-2 font-medium"
        data-testid="link-trial-upgrade"
      >
        View Plans
      </a>
    </div>
  );
}

function AuthenticatedApp({
  hasSubscription,
  hasEverHadSubscription,
  billingLoaded,
  billingFetching,
  isPlanFlow,
  currentPath,
  user,
  isTrialExpired,
  isAdminProvisioned,
  billingData,
}: {
  hasSubscription: boolean;
  hasEverHadSubscription: React.MutableRefObject<boolean>;
  billingLoaded: boolean;
  billingFetching: boolean;
  isPlanFlow: boolean;
  currentPath: string;
  user: any;
  isTrialExpired: boolean;
  isAdminProvisioned: boolean;
  billingData: any;
}) {
  const { brands, activeBrand, activeBrandId, isLoading: brandsLoading } = useBrand();
  const { hasPermission } = usePermissions();
  const { isSuperAdmin, isLoading: superAdminLoading } = useSuperAdmin();

  const hasEverCompletedScan = useRef(false);
  if (brands.some((b) => b.scanStatus === "completed")) {
    hasEverCompletedScan.current = true;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  const hasExistingBrand = brands.length > 0;
  if (!isAdminProvisioned && !isSuperAdmin && billingLoaded && !brandsLoading && !hasSubscription && !hasEverHadSubscription.current && !billingFetching && !isPlanFlow && !hasExistingBrand) {
    return (
      <Switch>
        <Route path="/select-plan" component={SelectPlan} />
        <Route path="/checkout" component={Checkout} />
        <Route>
          <Redirect to="/select-plan" />
        </Route>
      </Switch>
    );
  }

  if (!isSuperAdmin && isTrialExpired && !isPlanFlow) {
    return (
      <Switch>
        <Route path="/select-plan" component={SelectPlan} />
        <Route path="/checkout" component={Checkout} />
        <Route>
          <Redirect to="/select-plan?expired=true" />
        </Route>
      </Switch>
    );
  }

  const brandsLoaded = !brandsLoading && brands.length >= 0;
  const hasAnyCompletedBrand = brands.some((b) => b.scanStatus === "completed");
  const hasCompletedScan = activeBrand?.scanStatus === "completed";
  const hasScanRunning = activeBrand?.scanStatus?.startsWith("running") ?? false;
  const isOnboarding = currentPath === "/onboarding";
  const needsOnboarding = !isAdminProvisioned && brandsLoaded && !hasAnyCompletedBrand && !hasScanRunning;
  const canShowWelcomeVideo = user?.seenWelcomeVideo === false;

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0 bg-background">
          <header className="flex h-14 sm:h-16 items-center gap-2 sm:gap-4 border-b border-border px-3 sm:px-6 bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1" />
            <div className="hidden sm:block">
              {hasPermission("manageUsers") && <InviteTeamDialog />}
            </div>
            <SuperAdminSwitcher />
            <BrandSwitcher />
          </header>
          <SuperAdminBanner />
          {isAdminProvisioned && <ProvisionedTrialBanner billingData={billingData} />}
          <AiUsageCapBanner />
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-background">
            {hasScanRunning && !isOnboarding && activeBrandId && (
              <ScanProgressOverlay
                brandId={activeBrandId}
                mode={hasEverCompletedScan.current ? "term" : "full"}
              />
            )}
            <Switch>
              <Route path="/select-plan" component={SelectPlan} />
              <Route path="/checkout" component={Checkout} />
              <Route path="/onboarding" component={Onboarding} />
              {/* An invite/trial signup link can land here if the browser already has an
                  unrelated session (e.g. the admin who provisioned the trial). Render the
                  form as-is; signup.tsx clears the stale session only if the user submits. */}
              <Route path="/signup" component={Signup} />
              <Route path="/brand-settings" component={BrandSettings} />
              <Route path="/terms/:id" component={TermDetail} />
              <Route path="/terms" component={Terms} />
              <Route path="/runs/:id" component={RunDetail} />
              <Route path="/billing" component={Billing} />
              <Route path="/actions" component={Actions} />
              <Route path="/team" component={Team} />
              <Route path="/dashboard">
                {needsOnboarding ? <Redirect to="/onboarding" /> : <Dashboard />}
              </Route>
              <Route path="/">
                {needsOnboarding ? <Redirect to="/onboarding" /> : <Dashboard />}
              </Route>
              <Route path="/trial"><Redirect to="/" /></Route>
              <Route path="/perception" component={Perception} />
              <Route path="/coverage" component={Coverage} />
              <Route path="/competitors" component={Competitors} />
              <Route path="/audit" component={Audit} />
              <Route path="/web-vitals" component={WebVitals} />
              <Route path="/visibility-report" component={VisibilityReport} />
              <Route path="/alerts" component={Alerts} />
              <Route path="/reports" component={Reports} />
              <Route path="/resources" component={Resources} />
              <Route path="/user-guide" component={UserGuide} />
              <Route path="/admin/news">
                {superAdminLoading ? <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : (user?.role === "admin" || isSuperAdmin) ? <AdminNews /> : <Redirect to="/dashboard" />}
              </Route>
              <Route path="/admin/reviews">
                {superAdminLoading ? <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : (user?.role === "admin" || isSuperAdmin) ? <AdminReviews /> : <Redirect to="/dashboard" />}
              </Route>
              <Route path="/admin/accounts">
                {superAdminLoading ? <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : isSuperAdmin ? <AdminAccounts /> : <Redirect to="/dashboard" />}
              </Route>
              <Route path="/admin/system-config">
                {superAdminLoading ? <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : isSuperAdmin ? <AdminSystemConfig /> : <Redirect to="/dashboard" />}
              </Route>
              <Route path="/news" component={News} />
              <Route path="/news/:slug" component={NewsArticle} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
        {canShowWelcomeVideo && <WelcomeVideoModal />}
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  document.documentElement.classList.add('dark');

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <ScrollToTop />
          <AppContent />
          <Toaster />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
