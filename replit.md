# AEOSTARS — AI Representation & Visibility Intelligence Platform

## Overview
AEOSTARS is an AI Representation & Visibility Intelligence platform designed to help brands understand and enhance their presence in responses from major Large Language Models (LLMs). It conducts multi-model AI interrogations, assesses brand visibility, generates narrative perception profiles, identifies competitor positioning gaps, and provides actionable content recommendations to improve AI visibility.

## User Preferences
- Enterprise-grade, professional UI (Linear/Supabase aesthetic)
- Data-dense, analytical dashboard style
- Dark mode by default (enterprise dark slate, not neon/gaming)
- Comprehensive error handling and loading states
- Production-ready code quality

## System Architecture
The AEOSTARS platform is built with a React + TypeScript + Vite frontend and an Express.js + Node.js backend, utilizing Drizzle ORM and PostgreSQL for data management.

**Key Architectural Decisions & Features:**

*   **Authentication:** LinkedIn OAuth (primary) with email/password fallback. Email/password is at `/login` and `/signup`. LinkedIn OAuth is at `/api/auth/linkedin`. For testing, always use email/password.
    *   **Email Verification:** Email signups require email confirmation before accessing the app. A verification email is sent via Resend on signup with a 24-hour token. The `isAuthenticated` middleware blocks unverified users (403 with `EMAIL_NOT_VERIFIED` code). LinkedIn OAuth users and admin-provisioned invite users skip verification (already verified by provider). Resend verification is rate-limited to 1/minute. The frontend redirects unverified users to `/verify-email`. Email address becomes a locked field after verification — no API endpoint allows email changes.
    *   **Key endpoints:** `GET /api/auth/verify-email` (token validation + redirect), `POST /api/auth/resend-verification`, `GET /api/auth/verification-status` (polling).
*   **Enterprise Design System:** Leverages shadcn/ui components and Tailwind CSS with a custom dark slate theme for a consistent UI/UX. All pages are mobile-responsive and adapt to various screen sizes.
*   **Core Product Features:**
    *   **Onboarding & Initial Assessment:** AI-powered flow for brand research (extracts company details from website), territory/location selection, competitor identification, and question generation. Progress is saved and restored.
    *   **AI Visibility Dashboard:** Displays key metrics like AI Share of Voice, Commercial Recommendation Score, Category Authority Score, and Core Web Vitals. Includes competitor insights and brand weakness counters.
    *   **AI Perception Mirror:** Provides an AI positioning summary, score gauges, actionable improvement suggestions, and brand weakness analysis.
    *   **Competitor AI Positioning Map:** Summarizes competitor frequency, identifies missed prompts, and offers competitive intelligence.
    *   **Semantic Coverage Gap Analysis:** Visualizes topic clusters and recommends actions to fill brand coverage gaps.
    *   **Technical Brand Audit:** An AI-powered on-demand audit performing 12 structured checks via live web search with detailed findings and fixes.
    *   **Core Web Vitals Page (`/web-vitals`):** Dedicated page pulling comprehensive data from Google PageSpeed Insights API, including competitor benchmark reports and AI-generated comparisons.
    *   **Actions Board (Kanban):** A Jira-style Kanban board for managing tasks, featuring AI-powered ticket generation for consolidating findings, manual ticket creation, commenting, and AI-suggested fixes.
    *   **Team Management:** Account owners can invite team members with granular permissions, managed by plan limits.
    *   **Change Monitoring & Alerts:** Provides an alert feed for significant changes in brand visibility.
    *   **Reports:** Generates PDF reports (Executive Snapshot, Marketing Action Report, Competitive Intelligence).
    *   **Brand Settings Page:** Unified settings for Brand Profile, Competitors management, and Key Terms management.
    *   **Key Terms Management:** Allows users to add, pause, resume, and delete tracked terms, with usage tracking.
    *   **Resource Library:** Downloadable sample files and code templates for improving AI visibility.
*   **Trial Expiry Enforcement:** Users are redirected to a plan selection page upon trial expiry.
*   **Marketing Pages:** Includes a comprehensive landing page and a pricing page.
*   **Billing System:** Implements a plan-based subscription model (Starter, Growth, Enterprise) with enforced limits and supports Add-on Packs.
*   **User Questions System:** Tracks "brand statements" and generates "User Questions" and "Brand Sentiment" questions, including search volume estimation.
*   **Super Admin System:** Privileged identities are defined once in `server/privileged-accounts.ts`. Explicitly allowlisted super admins and verified users from configured privileged-organization domains get estate-wide access to all accounts and brands, full admin privileges (News/Reviews/Account management), and account impersonation. Complimentary billing access is a separate policy in the same module. The `SuperAdminSwitcher` dropdown in the header allows switching into any account's context. Session-based (`req.session.superAdminViewingAs`) with a visible amber banner when viewing another account. Includes account deactivation capability, while protected organization accounts cannot be modified or deleted. API endpoints: `GET /api/auth/super-admin-status`, `GET /api/super-admin/accounts`, `POST /api/super-admin/switch-account`, `POST /api/super-admin/exit-account`, `POST /api/super-admin/deactivate-account`. The `isAuthenticated` middleware automatically overrides `req.accountOwnerId` when super admin mode is active, so all existing brand routes work without modification. The `isAdmin` middleware also grants access through the shared privileged-account policy.
*   **Multi-Brand Support:** Users can manage multiple brand profiles from a single account with a global `BrandContext` and `BrandSwitcher`.
*   **AI Cache System:** A persistent cache (`ai_cache` table) stores on-demand AI-generated results to prevent redundant AI calls.
*   **Data Freshness Service (`server/services/data-freshness.ts`):** Ensures all AI-generated data is fresh before report or ticket generation, using a 7-day staleness threshold.
*   **Admin Provisioned Trials:** Super admins can provision free trial accounts with a per-account duration and plan via the admin accounts page. New trials may use Starter (`starter_v2`), Growth (`growth_v2`), or Accelerate, defaulting to Starter. The immutable assigned plan and duration persist on `provisioned_accounts`; historical provisions retain legacy Starter behavior. The system runs a plan-sized scan pipeline and emails a plan-neutral invite with matching duration copy. Signup creates a zero-value local subscription with the assigned plan and an authoritative `subscriptions.trial_ends_at`; server access checks and client countdowns use that date. Existing legacy Starter trials retain their 15-competitor allowance, while new trials use exact selected-plan limits. Scheduled refreshes remain disabled for provisioned trials. Super admins can update a registered provisioned account's total trial duration, but not its assigned plan. Paid or manual conversion clears trial state and restores standard account behavior. Key endpoints: `POST /api/super-admin/provision-trial`, `PATCH /api/super-admin/accounts/:userId/trial`, `GET /api/provisioned-accounts`, `GET /api/auth/verify-invite-token/:token`.
*   **Database Schema:** Core tables include `users`, `brands`, `visibility_runs`, `perception_profiles`, `coverage_gaps`, `readability_audits`, `change_alerts`, `reports`, `subscriptions`, `subscription_addons`, `invoices`, `tracked_terms`, `user_questions`, `action_tickets`, `action_comments`, `team_invitations`, `team_members`, `ai_cache`, and `provisioned_accounts`.
*   **Contextual LLM System Prompts:** Utilizes two context levels for visibility scans: full brand context for brand sentiment questions and minimal context for non-brand questions to avoid bias.

## External Dependencies
*   **Large Language Models (all with live web search enabled):**
    *   OpenAI GPT-4o-mini (for visibility scans)
    *   Anthropic Claude Haiku 4.5 (claude-haiku-4-5) (for visibility scans with web search and perception analysis)
    *   Google Gemini 2.5 Flash (for visibility scans and background services)
    *   Google Gemini 3.1 Pro Preview (for one-time question generation)
*   **Database:** PostgreSQL (via Replit database)
*   **Email:** Resend (via Replit integration)
*   **CRM Integration:** Lift OS (for sending new signups as leads)
*   **Secrets Management:** Replit Secrets

## Configuration

*   **`TRIAL_DAYS`** — default free trial length in days and public marketing duration. Falls back to `30` when unset or not a positive number. Account entitlements are persisted at provisioning/signup and do not change when this environment value changes. `vite.config.ts` injects the value into the client bundle for marketing copy, so copy changes still require a frontend rebuild.
