import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { validateStripeEnvAtBoot, isStripeConfigured, runStripeSeedSingleFlight, getStripeMode, warnOnMissingLookupKeys } from "./stripe";
import { setupVite, serveStatic, log } from "./vite";
import { isCrawler, shouldCheckForCrawler } from "./crawler-detector";
import { SSRRenderer } from "./ssr-renderer";
import { registerSeoRoutes } from "./seo-routes";

const app = express();
let ssrRenderer: SSRRenderer | null = null;

const isProd = process.env.NODE_ENV === "production";
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    frameguard: isProd ? { action: "sameorigin" } : false,
    hsts: isProd ? { maxAge: 63072000, includeSubDomains: true } : false,
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
  }),
);

declare module 'http' {
  interface IncomingMessage {
    rawBody?: Buffer
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

// Production domain redirect middleware
app.use((req, res, next) => {
  const primaryDomain = process.env.CANONICAL_REDIRECT_DOMAIN;

  // Only redirect in production and only if a canonical domain is configured
  if (process.env.NODE_ENV === 'production' && primaryDomain) {
    const host = req.get('host');
    const allowedHosts = [primaryDomain, `www.${primaryDomain}`];

    if (host && (host.includes('.replit.app') || host.includes('.replit.dev')) &&
        !allowedHosts.includes(host)) {
      const newUrl = `https://${primaryDomain}${req.originalUrl}`;
      return res.redirect(301, newUrl);
    }
  }

  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Register SEO routes (sitemap.xml, robots.txt) - MUST come first
  registerSeoRoutes(app);

  // SSR middleware for crawlers - MUST come before registerRoutes
  // This intercepts crawler requests and serves pre-rendered HTML
  app.use(async (req, res, next) => {
    const userAgent = req.get('user-agent');
    const path = req.path;
    
    // Check if this request needs crawler detection
    if (!shouldCheckForCrawler(path)) {
      return next();
    }
    
    // Check if it's a crawler
    if (!isCrawler(userAgent)) {
      return next();
    }
    
    // Crawler detected! Render SSR HTML
    try {
      console.log(`[SSR] Crawler detected (${userAgent?.slice(0, 50)}...) - rendering ${path}`);
      
      if (!ssrRenderer) {
        const { storage } = await import('./storage');
        ssrRenderer = new SSRRenderer(storage);
      }
      
      const html = await ssrRenderer.renderPage(req.originalUrl);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (error) {
      console.error('[SSR] Failed to render for crawler:', error);
      // Fall back to normal SPA serving
      next();
    }
  });

  validateStripeEnvAtBoot();

  // Auto-seed Stripe products + prices on boot so the very first checkout
  // never throws "No active Stripe price found". Runs out-of-band so a
  // Stripe outage cannot block the server starting. Idempotent — re-runs
  // are no-ops once Products + Prices already exist.
  if (isStripeConfigured()) {
    // Make it impossible to miss in startup logs that the legacy non-Stripe
    // billing routes are now closed off — every paid mutation MUST go
    // through Stripe. If any of these endpoints get hit by a stale client
    // they'll return 503 STRIPE_REQUIRED.
    console.log(
      "[stripe] Legacy billing endpoints now guarded (return 503 STRIPE_REQUIRED): " +
        [
          "POST /api/billing/subscribe",
          "POST /api/billing/confirm-plan",
          "POST /api/billing/upgrade",
          "POST /api/billing/addons",
          "POST /api/billing/addons/:id/quantity",
        ].join(", "),
    );
    setImmediate(async () => {
      try {
        const result = await runStripeSeedSingleFlight();
        const created = result.items.filter((i) => i.created).length;
        const expectedWebhookHost = process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "(your-domain)"}`;
        console.log(
          `[stripe] Boot seed complete (${getStripeMode()} mode): ${result.items.length} prices ready, ${created} created.`,
        );
        // Surface any expected lookup_keys still missing in Stripe so ops
        // (Adam) sees explicitly which Prices need creating in the Dashboard
        // before checkout will succeed for new self-serve plans/add-ons.
        await warnOnMissingLookupKeys();
        console.log(
          `[stripe] Webhook URL to register in Stripe Dashboard: ${expectedWebhookHost}/api/stripe/webhook  (STRIPE_WEBHOOK_SECRET ${process.env.STRIPE_WEBHOOK_SECRET ? "set" : "MISSING"})`,
        );
      } catch (err) {
        console.error("[stripe] Boot-time seed failed (will retry on first checkout):", (err as Error).message);
      }
    });
  }

  // Load dynamic system config (pricing, quotas, FX rate, cut-over timestamp)
  // into memory and seed any missing keys before anything reads it.
  const { loadSystemConfig } = await import('./services/system-config');
  await loadSystemConfig();

  const server = await registerRoutes(app);

  const { startAiJobReservationCleanup } = await import('./services/ai-jobs/reservation-cleanup');
  startAiJobReservationCleanup();

  // Start daily scheduler for visibility monitoring
  const { startDailyScheduler } = await import('./daily-scheduler');
  startDailyScheduler();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    if (status >= 500) {
      console.error("[express] Unhandled error:", err);
    }
  });

  process.on("uncaughtException", (err) => {
    console.error("[process] Uncaught exception:", err);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[process] Unhandled rejection:", reason);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    ...(process.platform === "linux" ? { reusePort: true } : {}),
  }, () => {
    log(`serving on port ${port}`);
  });
})();
