# AEOSTARS — Third-Party Dependency List

## 1. External API Integrations

| Service | Purpose | Authentication | Usage |
|---------|---------|----------------|-------|
| **OpenAI** (`gpt-5-search-api`) | AI visibility scanning with web search | API Key (`OPENAI_DIRECT_KEY`) | Parallel LLM queries for brand mention detection |
| **Anthropic** (Claude Haiku 4) | AI visibility scanning with web search | API Key (`ANTHROPIC_API_KEY`) | Parallel LLM queries for brand mention detection |
| **Google Gemini** (2.0 Flash) | AI visibility scanning with Google Search grounding | API Key (`GEMINI_API_KEY`) | Parallel LLM queries + brand research + competitor research |
| **Google Gemini** (3.1 Pro Preview) | One-time question generation per brand | API Key (`GEMINI_API_KEY`) | Generates search queries for new tracked terms |
| **Google PageSpeed Insights** | Core Web Vitals and website performance data | API Key (`GOOGLE_PAGESPEED_API_KEY`) | On-demand website performance audits |
| **LinkedIn** | OAuth 2.0 / OpenID Connect authentication | Client ID + Secret (`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`) | Primary user login and registration |
| **Resend** | Transactional email delivery | API Key (via Replit integration) | Team invitations, report delivery, alerts |
| **Lift OS** | CRM lead management | API Key (`LIFT_OS_API_KEY`) | Sends new signups as leads (pipeline + stage tracking) |

## 2. Production NPM Dependencies

### AI & Machine Learning SDKs

| Package | Version | Purpose | Licence |
|---------|---------|---------|---------|
| `openai` | ^6.x | OpenAI API client (`gpt-5-search-api`) | Apache-2.0 |
| `@anthropic-ai/sdk` | ^0.x | Anthropic API client (Claude Haiku 4) | MIT |
| `@google/genai` | ^0.x | Google Gemini API client | Apache-2.0 |

### Backend Framework & Server

| Package | Version | Purpose | Licence |
|---------|---------|---------|---------|
| `express` | ^4.x | HTTP server framework | MIT |
| `express-session` | ^1.x | Session management middleware | MIT |
| `express-rate-limit` | ^7.x | API rate limiting | MIT |
| `csurf` | ^1.x | CSRF protection middleware | MIT |
| `cors` | ^2.x | Cross-origin resource sharing | MIT |
| `compression` | ^1.x | Response compression | MIT |
| `morgan` | ^1.x | HTTP request logging | MIT |

### Authentication

| Package | Version | Purpose | Licence |
|---------|---------|---------|---------|
| `passport` | ^0.7.x | Authentication middleware | MIT |
| `passport-local` | ^1.x | Email/password strategy | MIT |
| `passport-oauth2` | ^1.x | LinkedIn OAuth strategy | MIT |
| `@node-rs/argon2` | ^2.x | Password hashing (Argon2id) | MIT |

### Database & ORM

| Package | Version | Purpose | Licence |
|---------|---------|---------|---------|
| `drizzle-orm` | ^0.x | Type-safe SQL ORM | Apache-2.0 |
| `drizzle-zod` | ^0.x | Drizzle schema to Zod validation | Apache-2.0 |
| `@neondatabase/serverless` | ^0.x | Neon PostgreSQL serverless driver | MIT |
| `connect-pg-simple` | ^10.x | PostgreSQL session store for Express | MIT |

### Validation & Schema

| Package | Version | Purpose | Licence |
|---------|---------|---------|---------|
| `zod` | ^3.x | Runtime schema validation | MIT |
| `zod-validation-error` | ^3.x | User-friendly Zod error messages | MIT |

### Frontend Framework & UI

| Package | Version | Purpose | Licence |
|---------|---------|---------|---------|
| `react` | ^18.x | UI component framework | MIT |
| `react-dom` | ^18.x | React DOM renderer | MIT |
| `wouter` | ^3.x | Lightweight SPA router | ISC |
| `@tanstack/react-query` | ^5.x | Server state management | MIT |
| `react-hook-form` | ^7.x | Form state management | MIT |
| `@hookform/resolvers` | ^3.x | Zod resolver for react-hook-form | MIT |

### UI Components & Design

| Package | Version | Purpose | Licence |
|---------|---------|---------|---------|
| `@radix-ui/react-*` | Various | Headless UI component primitives | MIT |
| `class-variance-authority` | ^0.x | Component variant styling | Apache-2.0 |
| `clsx` | ^2.x | Conditional CSS class merging | MIT |
| `tailwind-merge` | ^2.x | Tailwind class deduplication | MIT |
| `cmdk` | ^1.x | Command palette component | MIT |
| `lucide-react` | ^0.x | Icon library | ISC |
| `react-icons` | ^5.x | Additional icon sets | MIT |

### Data Visualisation & Animation

| Package | Version | Purpose | Licence |
|---------|---------|---------|---------|
| `recharts` | ^2.x | Chart and graph components | MIT |
| `framer-motion` | ^11.x | Animation library | MIT |

### PDF & Content Processing

| Package | Version | Purpose | Licence |
|---------|---------|---------|---------|
| `pdfkit` | ^0.x | Server-side PDF generation | MIT |
| `cheerio` | ^1.x | Server-side HTML parsing / scraping | MIT |

### Email & Communication

| Package | Version | Purpose | Licence |
|---------|---------|---------|---------|
| `resend` | ^4.x | Transactional email API client | MIT |

### Scheduling

| Package | Version | Purpose | Licence |
|---------|---------|---------|---------|
| `node-cron` | ^3.x | Cron job scheduling | ISC |

### Utilities

| Package | Version | Purpose | Licence |
|---------|---------|---------|---------|
| `date-fns` | ^4.x | Date manipulation and formatting | MIT |
| `uuid` | ^11.x | UUID generation | MIT |
| `nanoid` | ^5.x | Short unique ID generation | MIT |
| `mime-types` | ^2.x | MIME type detection | MIT |

## 3. Development Dependencies

| Package | Version | Purpose | Licence |
|---------|---------|---------|---------|
| `vite` | ^5.x | Frontend build tool and dev server | MIT |
| `esbuild` | ^0.x | Backend TypeScript bundler | MIT |
| `tsx` | ^4.x | TypeScript execution (dev mode) | MIT |
| `typescript` | ^5.x | TypeScript compiler | Apache-2.0 |
| `tailwindcss` | ^3.x | Utility-first CSS framework | MIT |
| `autoprefixer` | ^10.x | CSS vendor prefixing | MIT |
| `postcss` | ^8.x | CSS transformation pipeline | MIT |
| `@tailwindcss/typography` | ^0.x | Prose content styling | MIT |
| `drizzle-kit` | ^0.x | Database migration tooling | Apache-2.0 |
| `@types/*` | Various | TypeScript type definitions | MIT |

## 4. Infrastructure & Hosting Services

| Service | Purpose | Notes |
|---------|---------|-------|
| **Replit** | Application hosting, deployment, secrets management | Managed cloud platform |
| **Neon** | PostgreSQL database hosting | Serverless, auto-scaling |

## 5. Licence Summary

All production dependencies use permissive open-source licences:
- **MIT** — majority of packages
- **Apache-2.0** — Drizzle ORM, OpenAI SDK, Google Gemini SDK
- **ISC** — Wouter, node-cron, Lucide icons

No copyleft (GPL/LGPL/AGPL) dependencies are included in the production bundle.
