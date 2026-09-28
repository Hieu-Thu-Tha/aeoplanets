# AEOSTARS — Data Flow Diagram

## 1. High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            USER (Browser)                               │
└────────┬────────────────────┬────────────────────┬──────────────────────┘
         │ Onboarding         │ Manual Actions      │ Views Dashboards
         ▼                    ▼                      ▼
┌────────────────┐   ┌────────────────┐   ┌──────────────────────────────┐
│ Brand Setup    │   │ Scan / Audit   │   │ Dashboard / Reports /        │
│ Flow           │   │ Requests       │   │ Kanban / Settings            │
└────────┬───────┘   └────────┬───────┘   └──────────────┬───────────────┘
         │                    │                           │
         ▼                    ▼                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        EXPRESS API LAYER                                │
│   Authentication | Route Handlers | Validation | Rate Limiting          │
└────────┬───────────────────┬────────────────────────────┬──────────────┘
         │                   │                             │
         ▼                   ▼                             ▼
┌────────────────┐  ┌────────────────────┐  ┌──────────────────────────┐
│ Storage Layer  │  │ AI Service Layer   │  │ External Integrations    │
│ (Drizzle ORM)  │  │ (LLM Runner)       │  │ (Email, CRM, PageSpeed)  │
└────────┬───────┘  └────────┬───────────┘  └──────────────────────────┘
         │                   │
         ▼                   ▼
┌────────────────┐  ┌────────────────────────────────────────┐
│  PostgreSQL    │  │ OpenAI | Anthropic | Google Gemini      │
│  Database      │  │ (with live web search)                  │
└────────────────┘  └────────────────────────────────────────┘
```

## 2. User Onboarding & Brand Creation

```
User enters website URL
        │
        ▼
┌───────────────────────┐
│ POST /api/brands/     │
│       research        │──────────► Google Gemini API
│                       │◄────────── (scrapes & analyses site)
└───────────┬───────────┘
            │ Returns: brandName, category,
            │ products, description, territories
            ▼
┌───────────────────────┐
│ User reviews &        │
│ confirms brand profile│
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ POST /api/brands      │──────────► brands table (INSERT)
│ (Create brand)        │──────────► tracked_terms table (auto-generated)
│                       │──────────► user_questions table (AI-generated)
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Competitor Research   │──────────► Google Gemini API
│ POST /api/brands/     │◄────────── (identifies competitors)
│   research-competitors│──────────► brands table (competitor records)
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Question Generation   │──────────► Google Gemini 3.1 Pro Preview
│ (one-time per brand)  │◄────────── (generates search queries)
│                       │──────────► user_questions table (INSERT)
└───────────────────────┘
```

## 3. AI Visibility Scan (Core Data Flow)

```
Trigger: Manual scan OR Daily Scheduler (midnight)
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│                    ASSESSMENT ENGINE                              │
│                                                                  │
│  1. Gather active tracked_terms for brand                        │
│  2. Gather user_questions linked to each term                    │
│  3. Determine context level:                                     │
│     - "Brand Sentiment" questions → full brand context           │
│     - Other questions → minimal context (to avoid bias)          │
└───────────┬──────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────┐
│                      LLM RUNNER                                   │
│                                                                   │
│  Parallel queries to 3 models:                                    │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │ OpenAI          │  │ Anthropic       │  │ Google Gemini     │  │
│  │ GPT-4o-mini     │  │ Claude Haiku 4  │  │ 2.0 Flash         │  │
│  │ (search preview)│  │ (web search     │  │ (Google Search    │  │
│  │                 │  │  tool, max 3)   │  │  grounding)       │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬──────────┘  │
│           │                    │                     │             │
│           └────────────────────┼─────────────────────┘             │
│                                │                                   │
│                                ▼                                   │
│                    Response Parsing (extractInfo)                   │
│                    - Brand appeared? (yes/no)                       │
│                    - Position / rank                                │
│                    - Sentiment (positive/neutral/negative)          │
│                    - Competitors mentioned                          │
│                    - Recommendation context                         │
└────────────────────────────────┬──────────────────────────────────┘
                                 │
                                 ▼
                    ┌──────────────────────┐
                    │ visibility_runs      │
                    │ table (INSERT)       │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────────┐
              │                │                     │
              ▼                ▼                     ▼
┌──────────────────┐ ┌─────────────────┐ ┌────────────────────┐
│ Perception       │ │ Coverage        │ │ Change Monitor     │
│ Analyser         │ │ Analyser        │ │                    │
│                  │ │                 │ │ Compares with      │
│ Generates:       │ │ Identifies:     │ │ previous scans     │
│ - Positioning    │ │ - Semantic gaps │ │ Generates:         │
│   summary        │ │ - Topic clusters│ │ - change_alerts    │
│ - Sentiment      │ │ - Coverage %    │ │                    │
│   scores         │ │                 │ │                    │
│ - Improvements   │ │                 │ │                    │
└────────┬─────────┘ └────────┬────────┘ └────────┬───────────┘
         │                    │                     │
         ▼                    ▼                     ▼
┌─────────────────┐ ┌─────────────────┐  ┌─────────────────┐
│ perception_     │ │ coverage_gaps   │  │ change_alerts   │
│ profiles table  │ │ table           │  │ table           │
└─────────────────┘ └─────────────────┘  └─────────────────┘
```

## 4. Dashboard Data Retrieval

```
User opens Dashboard
        │
        ▼
┌────────────────────────────────────────────────────────────────┐
│ Frontend (TanStack Query)                                      │
│                                                                │
│ Parallel API calls:                                            │
│ GET /api/brands/:id/visibility-runs     → Scan history         │
│ GET /api/brands/:id/perception          → Perception profile   │
│ GET /api/brands/:id/coverage-gaps       → Coverage analysis    │
│ GET /api/brands/:id/readability-audit   → Technical scores     │
│ GET /api/brands/:id/change-alerts       → Alert feed           │
│ GET /api/brands/:id/competitors         → Competitor data      │
└───────────┬────────────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────────────┐
│ Dashboard Rendering                                             │
│                                                                 │
│ Computed Metrics:                                                │
│ - AI Share of Voice (% brand appearances across all scans)      │
│ - Commercial Recommendation Score (recommendation frequency)    │
│ - Category Authority Score (composite of visibility + sentiment)│
│ - Competitor visibility comparison                               │
│ - Trend charts (visibility over time via Recharts)               │
│ - Brand weakness counters                                        │
└─────────────────────────────────────────────────────────────────┘
```

## 5. Action Tickets & Kanban Board

```
┌──────────────────────────────────────────────────────────────┐
│ Ticket Sources                                                │
│                                                               │
│ ┌──────────────────────┐    ┌──────────────────────────────┐ │
│ │ AI-Generated         │    │ Manual Creation               │ │
│ │                      │    │                               │ │
│ │ POST /api/brands/:id/│    │ POST /api/brands/:id/        │ │
│ │ action-tickets/      │    │ action-tickets               │ │
│ │ generate             │    │                               │ │
│ │                      │    │ User fills in title,          │ │
│ │ Reads latest:        │    │ description, priority         │ │
│ │ - Perception profile │    │                               │ │
│ │ - Coverage gaps      │    │                               │ │
│ │ - Readability audit  │    │                               │ │
│ │ - Competitor data    │    │                               │ │
│ │                      │    │                               │ │
│ │ LLM consolidates    │    │                               │ │
│ │ into prioritised    │    │                               │ │
│ │ actionable tickets  │    │                               │ │
│ └──────────┬───────────┘    └──────────────┬───────────────┘ │
└────────────┼───────────────────────────────┼─────────────────┘
             │                               │
             └───────────────┬───────────────┘
                             │
                             ▼
                ┌──────────────────────┐
                │ action_tickets table │
                │ (stage, priority,    │
                │  assignee, etc.)     │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────────────────────────┐
                │ Kanban Board (Frontend)                   │
                │                                           │
                │ ┌──────────┐ ┌───────────┐ ┌───────────┐│
                │ │ Approval │ │In Progress│ │ Completed ││
                │ │          │ │           │ │           ││
                │ │ [Card]   │ │ [Card]    │ │ [Card]    ││
                │ │ [Card]   │ │           │ │           ││
                │ └──────────┘ └───────────┘ └───────────┘│
                │                                          │
                │ Drag & Drop → PATCH /api/action-tickets/ │
                │                :id (updates stage)       │
                └──────────────────────────────────────────┘
```

## 6. Background Services & Scheduled Tasks

```
┌──────────────────────────────────────────────────────────────────┐
│                     DAILY SCHEDULER                               │
│                   (node-cron, runs at midnight)                    │
│                                                                   │
│  For each brand with active tracked terms:                        │
│                                                                   │
│  1. Run LLM visibility scans for all active questions             │
│     └──► visibility_runs table                                    │
│                                                                   │
│  2. Detect changes vs. previous scans                             │
│     └──► change_alerts table                                      │
│                                                                   │
│  3. Refresh perception analysis                                   │
│     └──► perception_profiles table                                │
│                                                                   │
│  4. Refresh coverage gap analysis                                 │
│     └──► coverage_gaps table                                      │
│                                                                   │
│  5. Refresh readability audit                                     │
│     └──► readability_audits table                                 │
│                                                                   │
│  6. Update competitor weakness data                               │
│     └──► brands table (weakness counters)                         │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                   DATA FRESHNESS SERVICE                          │
│                   (on-demand, pre-report/ticket)                  │
│                                                                   │
│  Before generating reports or tickets:                            │
│  - Check if each data source is < 7 days old                     │
│  - If stale, trigger a targeted refresh                          │
│  - Proceed only when all data is fresh                           │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                   AI CACHE LAYER                                  │
│                                                                   │
│  - Intercepts on-demand AI generation requests                   │
│  - Checks ai_cache table for matching (brand + type + params)    │
│  - Returns cached result if fresh, otherwise regenerates         │
│  - Prevents redundant expensive LLM calls                        │
└──────────────────────────────────────────────────────────────────┘
```

## 7. Authentication & Session Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                            │
│                                                                  │
│  LinkedIn OAuth (Primary)                                        │
│  ─────────────────────────                                       │
│  User ──► /api/auth/linkedin ──► LinkedIn Authorisation          │
│                                      │                           │
│                                      ▼                           │
│  /api/auth/linkedin/callback ◄─── Access Token + Profile        │
│           │                                                      │
│           ├──► Find or create user in DB                         │
│           ├──► Create session (PostgreSQL store)                 │
│           ├──► Send lead to Lift OS CRM                          │
│           └──► Redirect to /dashboard                            │
│                                                                  │
│  Email/Password (Fallback)                                       │
│  ─────────────────────────                                       │
│  User ──► POST /api/auth/signup ──► Argon2id hash ──► users DB  │
│  User ──► POST /api/auth/login  ──► Verify hash   ──► Session   │
│                                                                  │
│  Session Validation                                              │
│  ──────────────────                                              │
│  Every API request ──► isAuthenticated middleware                │
│                   ──► Checks express-session cookie              │
│                   ──► Loads user from PostgreSQL session store   │
└──────────────────────────────────────────────────────────────────┘
```

## 8. Billing & Subscription Data Flow

```
User selects plan
        │
        ▼
┌───────────────────────┐
│ POST /api/billing/    │──────────► subscriptions table (INSERT)
│ confirm-plan          │──────────► invoices table (INSERT)
│                       │──────────► Resend API (confirmation email)
└───────────┬───────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────┐
│ Limit Enforcement (on every relevant API call)                │
│                                                               │
│ getEffectiveLimits(userId)                                    │
│ ├── Plan base limits (Starter / Growth / Enterprise)          │
│ ├── + Active add-on packs (extra brands, terms, competitors)  │
│ ├── x Brand count (for tracked terms scaling)                 │
│ └── = Effective limits enforced across all features            │
└───────────────────────────────────────────────────────────────┘
```

## 9. Report Generation Data Flow

```
User requests report
        │
        ▼
┌────────────────────────┐
│ Data Freshness Check   │
│ (all sources < 7 days) │
│                        │
│ If stale → refresh     │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────────────────────────────────┐
│ Report Generator                                    │
│                                                     │
│ Reads:                                              │
│ - visibility_runs (scan history)                    │
│ - perception_profiles (narrative analysis)          │
│ - coverage_gaps (semantic coverage)                 │
│ - readability_audits (technical scores)             │
│ - action_tickets (task progress)                    │
│                                                     │
│ Generates PDF via PDFKit                            │
│                                                     │
│ Report Types:                                       │
│ - Executive Snapshot                                │
│ - Marketing Action Report                           │
│ - Competitive Intelligence Report                   │
└───────────┬─────────────────────────────────────────┘
            │
            ▼
┌────────────────────────┐
│ reports table (INSERT) │
│ PDF stored as base64   │
└────────────────────────┘
```
