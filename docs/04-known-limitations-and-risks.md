# AEOSTARS — Known Limitations & Risks

## 1. External API Dependencies

### 1.1 LLM Provider Availability
| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenAI, Anthropic, or Google Gemini API outage | Visibility scans return partial or no results | System uses 3 independent providers; partial results are still usable. Scans use `Promise.allSettled` so one provider failure does not block others. |
| API rate limit exhaustion during high concurrency | Scan requests queued or rejected by provider | Assessment engine processes scans in batches. No internal queue/retry system beyond batch-level error handling. |
| LLM model deprecation or behavioural changes | Scan results may shift in quality or format | Model identifiers are centralised in `llm-runner.ts` for single-point updates. Response parsing includes fallback handling for unexpected formats. |

### 1.2 Cost Exposure
| Risk | Impact | Mitigation |
|------|--------|------------|
| AI token costs scale with user count and tracked terms | Uncontrolled cost growth as user base expands | Plan-based term limits cap per-user consumption. AI cache layer prevents redundant calls. Daily scheduler runs once per 24 hours per brand. Admin can deactivate accounts to halt scans. |
| Web search add-ons on LLM calls increase per-query cost | Each scan invokes web search across 3 models | Anthropic search limited to 3 uses per call. Question generation uses Gemini only (single provider). |

### 1.3 Third-Party Service Dependencies
| Service | Risk | Impact |
|---------|------|--------|
| Google PageSpeed Insights API | Rate limits or API changes | Web Vitals page returns errors; does not affect core visibility features |
| LinkedIn OAuth | Service disruption | Users cannot log in via LinkedIn; email/password fallback available |
| Resend (Email) | Service disruption | Team invitations and email alerts delayed; core functionality unaffected |
| Lift OS (CRM) | Service disruption | New signups not sent to CRM; signup process itself unaffected |
| Neon PostgreSQL | Database outage | Full application outage; managed service with high availability SLA |

## 2. Scalability Considerations

### 2.1 Request Processing
| Limitation | Detail | Future Consideration |
|------------|--------|---------------------|
| Monolith architecture | All services run in a single Node.js process | Works well for current scale; consider service extraction if concurrent brand count exceeds hundreds |
| Long-running AI requests | Some scans take 30-90 seconds within Express request-response cycle | Acceptable for current usage patterns; a job queue (e.g., BullMQ) would be needed for high-volume processing |
| Single daily scheduler instance | Scheduler runs in-process with `node-cron` | Sufficient for single-instance deployment; would need distributed scheduling for multi-instance |

### 2.2 Database
| Limitation | Detail | Future Consideration |
|------------|--------|---------------------|
| `visibility_runs` table growth | Each scan generates one row per question per model (3 rows per question) | Archive or aggregate historical data if table exceeds millions of rows |
| No read replicas | All reads and writes go to primary database | Neon supports read replicas if query load requires it |

## 3. Feature Limitations

### 3.1 Billing & Payments
| Limitation | Detail |
|------------|--------|
| Manual payment processing | No integrated payment gateway (Stripe, etc.); invoices are generated and payment is collected manually |
| Subscription renewal on page visit | Monthly renewal check runs when the user visits the billing page; does not auto-renew in background |
| Immediate data deletion on cancellation | Cancelling a subscription immediately removes all brand and term data with no grace period or data export |

### 3.2 Authentication & Security
| Limitation | Detail |
|------------|--------|
| Password reset not email-enabled | Forgot-password endpoint generates a token but does not send the reset email; requires manual intervention |
| CSRF protection scope | CSRF tokens enforced on authentication routes; other data-modifying routes rely on session authentication only |
| Session-based authentication | No JWT/token-based API access; all API calls require an active browser session |

### 3.3 AI Analysis Quality
| Limitation | Detail |
|------------|--------|
| LLM response variability | Different runs of the same query may produce different results due to LLM non-determinism; mitigated by multi-model cross-referencing |
| Hallucination risk | System prompts instruct models to be factual, but no automated cross-referencing verifies AI-generated claims |
| 7-day data freshness window | Data is considered "fresh" for 7 days; users wanting daily granularity see a refresh only on the nightly scan cycle |
| Web search result quality | LLM web search capabilities vary by provider; results depend on each provider's search index and recency |

### 3.4 Reporting
| Limitation | Detail |
|------------|--------|
| PDF-only report format | Reports are generated as PDFs; no CSV, Excel, or API export options |
| Report types restricted by plan | Starter plan limited to Executive reports only; Growth/Enterprise get all three types |

## 4. Operational Risks

### 4.1 Deployment
| Risk | Detail | Mitigation |
|------|--------|------------|
| Single-instance deployment | Application runs as one instance on Replit | Replit managed infrastructure provides automatic restarts; no multi-region failover |
| Post-merge script dependency | Deployment relies on `scripts/post-merge.sh` for dependency setup | Script is tested and version-controlled; failures are logged |

### 4.2 Monitoring & Observability
| Limitation | Detail |
|------------|--------|
| Console-based logging | Errors logged to `console.error`; no structured logging or external log aggregation |
| No application performance monitoring | No APM tool (Datadog, New Relic, etc.) integrated |
| No uptime monitoring | No external health checks or status page beyond hosting platform defaults |

### 4.3 Data Protection
| Consideration | Detail |
|---------------|--------|
| Data residency | Database hosted on Neon (cloud); AI queries sent to US-based API providers (OpenAI, Anthropic, Google) |
| Data retention | No automated data retention policy or GDPR right-to-erasure workflow beyond account cancellation |
| Backup strategy | Managed deployments require an encrypted, verified `pg_dump` upload to S3-compatible storage before migrations; Neon managed recovery remains the primary point-in-time recovery layer |

## 5. Risk Summary Matrix

| # | Risk | Likelihood | Impact | Severity |
|---|------|-----------|--------|----------|
| 1 | LLM provider API outage (one of three) | Medium | Low (partial results still available) | Low |
| 2 | All LLM providers unavailable simultaneously | Very Low | High | Medium |
| 3 | API cost overrun from user growth | Medium | Medium | Medium |
| 4 | Database outage (Neon) | Low | Critical | Medium |
| 5 | Password reset gap causes support load | Medium | Low | Low |
| 6 | Manual billing limits conversion rate | High | Medium | Medium |
| 7 | Data deletion on cancel causes user complaints | Low | Medium | Low |
| 8 | LLM hallucination in reports | Medium | Medium | Medium |
| 9 | Single-instance scalability ceiling | Low (current scale) | High (if growth exceeds capacity) | Low |
| 10 | No structured logging hampers debugging | Medium | Low | Low |
