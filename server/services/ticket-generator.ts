import type { IStorage } from "../storage";
import type { ActionTicket, Brand } from "@shared/schema";
import type { FreshDataBundle } from "./data-freshness";
import { executeAiCall, type AiUsageContext } from "./ai-usage";
import { usageFromGemini } from "./llm-provider/gemini/usage";
import { fakeAiSleep, isFakeAiEnabled, maybeThrowFakeAiError } from "./fake-ai";

interface RawFinding {
  source: string;
  sourceRef: string;
  title: string;
  description: string;
  priority: string;
}

interface ConsolidatedTicket {
  title: string;
  description: string;
  priority: string;
  source: string;
  sourceRefs: string[];
  workStream: string;
}

async function consolidateWithAI(findings: RawFinding[], brandName: string, usage?: AiUsageContext): Promise<ConsolidatedTicket[]> {
  if (isFakeAiEnabled()) {
    await fakeAiSleep();
    try {
      maybeThrowFakeAiError("ticket consolidation");
    } catch (error) {
      // Mirror the real path: AI failures degrade to rule-based grouping.
      console.error("FAKE_AI consolidation failed, falling back to rule-based grouping:", error);
    }
    // The rule-based path is the schema-valid fallback the real AI path
    // degrades to, so it doubles as the deterministic fake.
    return ruleBasedConsolidation(findings);
  }
  if (findings.length <= 3) {
    return findings.map(f => ({
      title: f.title,
      description: f.description,
      priority: f.priority,
      source: f.source,
      sourceRefs: [f.sourceRef],
      workStream: f.source,
    }));
  }

  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const findingsList = findings.map((f, i) =>
    `[${i}] Source: ${f.source} | Priority: ${f.priority} | Title: ${f.title}\nDetails: ${f.description.substring(0, 300)}`
  ).join("\n\n");

  const prompt = `You are a project manager consolidating improvement findings for the brand "${brandName}" into actionable work tickets.

Below are ${findings.length} individual findings from various audits. Many overlap or relate to the same type of work. Your job is to group them into logical work streams — each work stream should represent a distinct, actionable piece of work that one person could own.

RULES:
- Group findings that require the same type of work (e.g. all schema markup issues together, all content freshness issues together, all performance issues together)
- Aim for 4-10 tickets total depending on how diverse the findings are. Never create more than 12.
- Never create just 1 ticket — the work streams ARE genuinely different categories
- Each ticket title should clearly describe the work stream (e.g. "Implement Structured Data Markup" not "Fix issues")
- The description should summarise all the grouped findings into a clear brief: what needs doing, what the current state is, and what the fix involves
- Set priority to the highest priority among the grouped findings (critical > high > medium > low)
- Include ALL finding indices — every finding must appear in exactly one ticket

FINDINGS:
${findingsList}

Respond with valid JSON only — an array of objects with these fields:
- "title": string (clear work stream title, max 80 chars)
- "description": string (combined brief covering all grouped findings, 100-400 words)  
- "priority": "critical" | "high" | "medium" | "low"
- "workStream": string (short category label e.g. "structured_data", "content_authority", "site_performance", "ai_visibility", "content_gaps")
- "findingIndices": number[] (indices of the original findings grouped into this ticket)

JSON array only, no markdown fences or extra text.`;

  try {
    const response = await executeAiCall(
      usage,
      "gemini",
      "gemini-2.5-flash",
      () => client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { temperature: 0.2 },
      }),
      usageFromGemini,
    );

    let text: string;
    if (typeof response.text === "function") {
      const result = response.text();
      text = result instanceof Promise ? await result : result;
    } else {
      text = String((response as any).text ?? "");
    }

    if (!text || text.trim().length === 0) {
      throw new Error("AI returned empty response");
    }

    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned) as Array<{
      title: string;
      description: string;
      priority: string;
      workStream: string;
      findingIndices: number[];
    }>;

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("AI returned empty or invalid array");
    }

    const validPriorities = new Set(["critical", "high", "medium", "low"]);
    const usedIndices = new Set<number>();

    const consolidated: ConsolidatedTicket[] = [];
    for (const ticket of parsed) {
      if (!ticket.title || !Array.isArray(ticket.findingIndices)) continue;

      const dedupedIndices = [...new Set(ticket.findingIndices)]
        .filter(i => i >= 0 && i < findings.length && !usedIndices.has(i));

      if (dedupedIndices.length === 0) continue;

      dedupedIndices.forEach(i => usedIndices.add(i));

      const groupedFindings = dedupedIndices.map(i => findings[i]);
      const sources = [...new Set(groupedFindings.map(f => f.source))];
      const sourceRefs = groupedFindings.map(f => f.sourceRef);

      consolidated.push({
        title: ticket.title.substring(0, 100),
        description: ticket.description || groupedFindings.map(f => f.description).join("\n\n"),
        priority: validPriorities.has(ticket.priority) ? ticket.priority : "medium",
        source: sources.length === 1 ? sources[0] : "consolidated",
        sourceRefs,
        workStream: ticket.workStream || "general",
      });
    }

    for (let i = 0; i < findings.length; i++) {
      if (!usedIndices.has(i)) {
        consolidated.push({
          title: findings[i].title,
          description: findings[i].description,
          priority: findings[i].priority,
          source: findings[i].source,
          sourceRefs: [findings[i].sourceRef],
          workStream: findings[i].source,
        });
      }
    }

    if (consolidated.length > 12) {
      console.log(`AI produced ${consolidated.length} tickets, falling back to rule-based grouping`);
      return ruleBasedConsolidation(findings);
    }

    return consolidated;
  } catch (error) {
    console.error("AI consolidation failed, falling back to rule-based grouping:", error);
    return ruleBasedConsolidation(findings);
  }
}

export function ruleBasedConsolidation(findings: RawFinding[]): ConsolidatedTicket[] {
  const groups: Record<string, RawFinding[]> = {};

  for (const f of findings) {
    let key: string;
    const title = f.title.toLowerCase();

    if (f.source === "readability" && (title.includes("schema") || title.includes("json-ld"))) {
      key = "structured_data";
    } else if (f.source === "readability" && (title.includes("meta") || title.includes("canonical"))) {
      key = "on_page_seo";
    } else if (f.source === "readability" && (title.includes("author") || title.includes("e-e-a-t") || title.includes("social proof"))) {
      key = "content_authority";
    } else if (f.source === "readability" && (title.includes("performance") || title.includes("speed"))) {
      key = "site_performance";
    } else if (f.source === "readability" && (title.includes("crawl") || title.includes("bot"))) {
      key = "ai_crawlability";
    } else if (f.source === "web_vitals") {
      key = "core_web_vitals";
    } else if (f.source === "perception") {
      key = "brand_perception";
    } else if (f.source === "coverage") {
      key = "content_coverage";
    } else {
      key = f.source + "_" + f.sourceRef.substring(0, 20);
    }

    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  }

  const workStreamLabels: Record<string, string> = {
    structured_data: "Implement Structured Data Markup",
    on_page_seo: "Fix On-Page SEO Signals",
    content_authority: "Build Content Authority & Trust Signals",
    site_performance: "Improve Site Performance",
    ai_crawlability: "Enable AI Bot Crawlability",
    core_web_vitals: "Optimise Core Web Vitals",
    brand_perception: "Address Brand Perception Gaps",
    content_coverage: "Fill Content Coverage Gaps",
  };

  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  return Object.entries(groups).map(([key, items]) => {
    const highestPriority = items.reduce((best, f) =>
      (priorityOrder[f.priority] ?? 3) < (priorityOrder[best] ?? 3) ? f.priority : best,
      "low"
    );

    const sources = [...new Set(items.map(f => f.source))];
    const description = items.map(f => {
      const lines = [`**${f.title}**`];
      if (f.description) lines.push(f.description);
      return lines.join("\n");
    }).join("\n\n---\n\n");

    return {
      title: workStreamLabels[key] || items[0].title,
      description,
      priority: highestPriority,
      source: sources.length === 1 ? sources[0] : "consolidated",
      sourceRefs: items.map(f => f.sourceRef),
      workStream: key,
    };
  });
}

export async function generateActionTickets(
  brandId: number,
  userId: string,
  storage: IStorage,
  freshBundle?: FreshDataBundle
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  const brand = await storage.getBrand(brandId);
  if (!brand) return { created, skipped };

  const rawFindings: RawFinding[] = [];

  const audit = freshBundle?.readabilityAudit ?? await storage.getReadabilityAudit(brandId);
  if (audit && Array.isArray(audit.checks)) {
    for (const check of audit.checks as any[]) {
      if (check.status === "fail" || check.status === "warning") {
        const desc = [
          check.currentState ? `Current state: ${check.currentState}` : "",
          check.whatToFix ? `What to fix: ${check.whatToFix}` : "",
          check.whatIsThis ? `About: ${check.whatIsThis}` : "",
        ].filter(Boolean).join("\n\n");

        rawFindings.push({
          source: "readability",
          sourceRef: check.name,
          title: `Readability: ${check.name}`,
          description: desc,
          priority: check.status === "fail" ? "high" : "medium",
        });
      }
    }
  }

  const profile = freshBundle?.perceptionProfile ?? await storage.getPerceptionProfile(brandId);
  if (profile) {
    const scores = [
      profile.positioningScore ?? 100,
      profile.authorityScore ?? 100,
      profile.proofScore ?? 100,
      profile.differentiationScore ?? 100,
    ];
    const minScore = Math.min(...scores);
    const priority = minScore < 50 ? "high" : minScore < 70 ? "medium" : "low";

    if (Array.isArray(profile.topImprovements)) {
      for (const improvement of profile.topImprovements) {
        rawFindings.push({
          source: "perception",
          sourceRef: improvement.substring(0, 80),
          title: `Perception: ${improvement.substring(0, 60)}`,
          description: improvement,
          priority,
        });
      }
    }

    if (Array.isArray(profile.weaknesses)) {
      for (const weakness of profile.weaknesses) {
        rawFindings.push({
          source: "perception",
          sourceRef: `weakness:${weakness.substring(0, 80)}`,
          title: `Weakness: ${weakness.substring(0, 60)}`,
          description: `Brand weakness identified by AI perception analysis: ${weakness}`,
          priority: priority === "low" ? "medium" : priority,
        });
      }
    }
  }

  const gaps = freshBundle?.coverageGap ?? await storage.getCoverageGap(brandId);
  if (gaps && Array.isArray(gaps.recommendations)) {
    for (const rec of gaps.recommendations as any[]) {
      if (rec.gapSeverity === "high" || rec.gapSeverity === "medium") {
        rawFindings.push({
          source: "coverage",
          sourceRef: rec.topic,
          title: `Coverage Gap: ${rec.topic}`,
          description: rec.recommendedAction || `Fill coverage gap for topic: ${rec.topic}. Brand coverage: ${rec.brand || "none"}.`,
          priority: rec.gapSeverity === "high" ? "high" : "medium",
        });
      }
    }
  }

  const brandAny = brand as any;
  if (brandAny.pagespeedCache) {
    const cache = typeof brandAny.pagespeedCache === "string"
      ? JSON.parse(brandAny.pagespeedCache)
      : brandAny.pagespeedCache;

    const metricNames: Record<string, string> = {
      fcp: "First Contentful Paint",
      lcp: "Largest Contentful Paint",
      cls: "Cumulative Layout Shift",
      tbt: "Total Blocking Time",
    };

    for (const strategy of ["mobile", "desktop"]) {
      const data = cache?.results?.[strategy];
      if (!data?.lab) continue;

      for (const [key, label] of Object.entries(metricNames)) {
        const metric = data.lab[key];
        if (metric && typeof metric.score === "number" && metric.score < 0.5) {
          rawFindings.push({
            source: "web_vitals",
            sourceRef: `${strategy}_${key}`,
            title: `Web Vitals: Improve ${label} (${strategy})`,
            description: `${label} score is ${Math.round(metric.score * 100)}/100 on ${strategy}. Current value: ${metric.display || "N/A"}.`,
            priority: metric.score < 0.25 ? "critical" : "high",
          });
        }
      }
    }
  }

  const competitorWeaknesses = freshBundle?.competitorWeaknesses || {};
  for (const [competitorName, weaknessData] of Object.entries(competitorWeaknesses)) {
    if (!weaknessData) continue;

    if (Array.isArray(weaknessData.complaints)) {
      for (const complaint of weaknessData.complaints) {
        if (complaint.severity === "high" || complaint.severity === "medium") {
          rawFindings.push({
            source: "competitor_weakness",
            sourceRef: `competitor:${competitorName}:${complaint.category}`,
            title: `Competitor Gap: ${competitorName} — ${complaint.category}`,
            description: `Competitor "${competitorName}" has a known weakness in ${complaint.category}: ${complaint.detail}. Source: ${complaint.source || "review site"}. This is an opportunity to differentiate by highlighting your strengths in this area.`,
            priority: complaint.severity === "high" ? "high" : "medium",
          });
        }
      }
    }

    if (Array.isArray(weaknessData.vulnerabilities)) {
      for (const vuln of weaknessData.vulnerabilities.slice(0, 2)) {
        rawFindings.push({
          source: "competitor_weakness",
          sourceRef: `competitor:${competitorName}:vuln:${vuln.substring(0, 50)}`,
          title: `Exploit Competitor Vulnerability: ${competitorName}`,
          description: `Competitor "${competitorName}" vulnerability: ${vuln}. Create content or messaging that positions your brand as the stronger alternative in this area.`,
          priority: "medium",
        });
      }
    }
  }

  if (rawFindings.length > 0) {
    const allExistingTickets = await storage.getActionTicketsByBrand(brandId);
    const activeTickets = allExistingTickets.filter(t =>
      t.stage !== "archived" && t.stage !== "completed" && !t.rejectedAt
    );
    const rejectedRefs = new Set(
      allExistingTickets.filter(t => t.rejectedAt).map(t => t.sourceRef).filter(Boolean)
    );
    const activeRefs = new Set(activeTickets.map(t => t.sourceRef).filter(Boolean));

    const consolidated = await consolidateWithAI(rawFindings, brand.name, { userId, brandId, feature: "ticket_generation" });

    for (const ticket of consolidated) {
      const compositeRef = `workstream:${ticket.workStream}`;

      if (rejectedRefs.has(compositeRef)) {
        skipped++;
        continue;
      }

      if (activeRefs.has(compositeRef)) {
        skipped++;
        continue;
      }

      const hasRejectedIndividual = ticket.sourceRefs.some(ref => rejectedRefs.has(ref));
      if (hasRejectedIndividual) {
        skipped++;
        continue;
      }

      const allIndividualsCovered = ticket.sourceRefs.length > 0 &&
        ticket.sourceRefs.every(ref => activeRefs.has(ref));
      if (allIndividualsCovered) {
        skipped++;
        continue;
      }

      await storage.createActionTicket({
        brandId,
        userId,
        title: ticket.title,
        description: ticket.description,
        source: ticket.source,
        sourceRef: compositeRef,
        stage: "approval",
        priority: ticket.priority,
        version: 1,
      });
      created++;
    }
  }

  const allTickets = await storage.getActionTicketsByBrand(brandId);
  const finishedTickets = allTickets.filter(t => t.stage === "finished");

  for (const ticket of finishedTickets) {
    if (!ticket.sourceRef || ticket.source === "manual") continue;

    let issueStillExists = false;

    if (ticket.source === "readability" && audit) {
      const checks = audit.checks as any[];
      const check = checks.find((c: any) => c.name === ticket.sourceRef);
      if (check && (check.status === "fail" || check.status === "warning")) {
        issueStillExists = true;
      }
    } else if (ticket.source === "perception" && profile) {
      const ref = ticket.sourceRef;
      if (ref.startsWith("weakness:")) {
        const text = ref.replace("weakness:", "");
        issueStillExists = (profile.weaknesses || []).some(w => w.substring(0, 80) === text);
      } else {
        issueStillExists = (profile.topImprovements || []).some(i => i.substring(0, 80) === ref);
      }
    } else if (ticket.source === "coverage" && gaps) {
      const recs = gaps.recommendations as any[];
      issueStillExists = recs.some((r: any) =>
        r.topic === ticket.sourceRef && (r.gapSeverity === "high" || r.gapSeverity === "medium")
      );
    }

    if (issueStillExists) {
      await storage.updateActionTicket(ticket.id, {
        stage: "approval",
        version: (ticket.version || 1) + 1,
      });
      created++;
    }
  }

  return { created, skipped };
}
