import {
  Fragment,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  BarChart2,
  Bell,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Eye,
  FileText,
  Gauge,
  Home,
  Library,
  Play,
  Search,
  Settings2,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { PageShell } from "@/components/ui/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  getPageGuideMockData,
  WELCOME_GUIDE_VIDEO_URL,
} from "@/lib/page-guide-mock-data";

interface UserGuideItem {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  kind?: "guide" | "video";
}

const WELCOME_VIDEO: UserGuideItem = {
  id: "welcome-video",
  title: "Welcome Video",
  subtitle:
    "Rewatch the short orientation to learn where to find insights, reports, and recommended actions in AEOSTARS.",
  icon: Play,
  kind: "video",
};

const GUIDES: UserGuideItem[] = [
  {
    id: "my-actions",
    title: "My Actions",
    subtitle: "AI-generated improvement tickets and manual tasks",
    icon: ClipboardList,
  },
  {
    id: "dashboard",
    title: "Dashboard",
    subtitle: "AI Visibility Overview",
    icon: Home,
  },
  {
    id: "visibility-report",
    title: "Visibility Report",
    subtitle:
      "Detailed question-by-question AI visibility analysis across all models",
    icon: Search,
  },
  {
    id: "perception-mirror",
    title: "Perception Mirror",
    subtitle: "How AI models perceive and describe your brand",
    icon: Eye,
  },
  {
    id: "coverage-analysis",
    title: "Coverage Analysis",
    subtitle: "Topic clusters and content gap analysis across AI models",
    icon: BarChart2,
  },
  {
    id: "competitor-map",
    title: "Competitor Map",
    subtitle: "See where competitors appear in AI responses without you",
    icon: Users,
  },
  {
    id: "technical-brand-audit",
    title: "Technical Brand Audit",
    subtitle:
      "AI-powered technical assessment of your site's structure, schema, and AI visibility signals",
    icon: CheckCircle,
  },
  {
    id: "core-web-vitals",
    title: "Core Web Vitals",
    subtitle: "Analyse your site performance against competitors",
    icon: Gauge,
  },
  {
    id: "alerts",
    title: "Alerts",
    subtitle: "Track changes in how AI models reference your brand over time",
    icon: Bell,
  },
  {
    id: "reports",
    title: "Reports",
    subtitle:
      "AI-powered intelligence reports with visual charts and actionable insights",
    icon: FileText,
  },
  {
    id: "resource-library",
    title: "Resource Library",
    subtitle:
      "Step-by-step guides and downloadable templates to improve your brand's AI visibility and machine readability",
    icon: Library,
  },
  {
    id: "brand-settings",
    title: "Brand Settings",
    subtitle:
      "Configure your brand profile, manage competitors, and set the key terms AI monitors for you.",
    icon: Settings2,
  },
  {
    id: "team",
    title: "Team",
    subtitle: "Manage your team members and their permissions",
    icon: UsersRound,
  },
  {
    id: "billing",
    title: "Billing",
    subtitle: "Manage your plan, usage, and invoices",
    icon: CreditCard,
  },
];

const WELCOME_TITLE = "Get oriented in under four minutes";
const WELCOME_DESCRIPTION =
  "See how your AI visibility score connects to reports, opportunities, and the actions your team can take next.";

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(" ");
  if (isValidElement(node)) return extractText((node.props as any)?.children);
  return "";
}

function highlightNodes(node: ReactNode, query: string): ReactNode {
  const q = query.trim();
  if (!q) return node;
  const needle = q.toLowerCase();
  if (typeof node === "string") {
    const lower = node.toLowerCase();
    const out: ReactNode[] = [];
    let i = 0;
    let k = 0;
    let found = false;
    while (i < node.length) {
      const at = lower.indexOf(needle, i);
      if (at === -1) {
        out.push(node.slice(i));
        break;
      }
      found = true;
      if (at > i) out.push(node.slice(i, at));
      out.push(
        <mark
          key={k++}
          className="bg-warning-muted text-warning rounded px-0.5"
        >
          {node.slice(at, at + needle.length)}
        </mark>,
      );
      i = at + needle.length;
    }
    return found ? out : node;
  }
  if (typeof node === "number" || node == null || typeof node === "boolean")
    return node;
  if (Array.isArray(node)) {
    return node.map((child, idx) => (
      <Fragment key={idx}>{highlightNodes(child, query)}</Fragment>
    ));
  }
  if (isValidElement(node)) {
    const tag = (node as any).type;
    if (tag === "iframe" || tag === "video") return node;
    const children = (node.props as any)?.children;
    if (children == null) return node;
    return cloneElement(node, {} as any, highlightNodes(children, query));
  }
  return node;
}

function GuideDetail({ id, query }: { id: string; query: string }) {
  return <>{highlightNodes(detailContent(id), query)}</>;
}

function detailContent(id: string) {
  switch (id) {
    case "my-actions":
      return (
        <GuideBody>
          <p>
            My Actions is your prioritized to-do list, built from your latest AI
            visibility scan.
          </p>
          <p>
            <strong>Generate All Tickets</strong> — click this to have AI review
            your latest Technical Brand Audit, Perception Mirror, Coverage
            Analysis, and Competitor Map data, and automatically create a full
            batch of prioritized tasks in one pass (takes roughly 30–90
            seconds).
          </p>
          <p>
            <strong>Create Ticket</strong> — to add a task manually, click{" "}
            <strong>Create Ticket</strong> and fill in:
          </p>
          <ul>
            <li>
              <strong>Title</strong> (required)
            </li>
            <li>
              <strong>Description</strong> — details, context, acceptance
              criteria
            </li>
            <li>
              <strong>Priority</strong> — High, Medium, or Low
            </li>
            <li>
              <strong>Stage</strong> — which column the ticket starts in
            </li>
          </ul>
          <p>
            <strong>Tracking progress</strong> — tickets move through four
            stages: <strong>Approval → In Progress → Testing → Finished</strong>
            . Drag a card between columns as work progresses, or open it to
            update its stage directly.
          </p>
          <p>
            Each ticket shows a category tag (e.g. Readability, Multi-Source,
            Perception), a priority badge, and when it was created — so you can
            quickly see what needs attention first.
          </p>
        </GuideBody>
      );
    case "dashboard":
      return (
        <GuideBody>
          <p>
            Your Dashboard is the first thing you see after onboarding, and
            gives you an at-a-glance snapshot of your brand&apos;s AI
            visibility.
          </p>
          <p>
            <strong>Top metrics:</strong>
          </p>
          <ul>
            <li>
              <strong>AI Share of Voice</strong> — the percentage of tracked
              question runs where your brand appears in the AI&apos;s answer.
            </li>
            <li>
              <strong>Commercial Score</strong> — your appearance rate
              specifically on bottom-funnel, buying-intent questions.
            </li>
            <li>
              <strong>Category Authority</strong> — your appearance rate on
              category-comparison questions.
            </li>
          </ul>
          <p>
            <strong>AI Funnel Analysis</strong> breaks your visibility down by
            funnel stage — Awareness, Consideration, and Commercial — and
            separately for <strong>non-branded</strong> queries (where
            you&apos;re not named) vs. <strong>branded</strong> queries (where
            you are). This tells you whether people find you when they
            don&apos;t know your name yet, not just when they&apos;re already
            asking about you directly.
          </p>
          <p>
            <strong>Competitor AI Funnels</strong> shows the same three-stage
            breakdown for each of your tracked competitors side by side, so you
            can see exactly where you&apos;re outperforming — or losing to —
            each one.
          </p>
          <p>
            <strong>Discovered Competitors</strong> surfaces brands AI mentioned
            alongside yours that you aren&apos;t tracking yet — add them to keep
            monitoring, or dismiss if irrelevant.
          </p>
          <p>
            Further down, the <strong>30-Day Share of Voice Trend</strong> chart
            shows how your visibility has moved over the past month, and the{" "}
            <strong>Visibility Run Summary</strong> table gives you the full
            numeric breakdown — questions, total runs, appearances, appearance
            rate, sentiment, and estimated monthly search volume — per category.
          </p>
          <GuideCallout>
            📌 If you see &quot;Unable to load performance data&quot; under Core
            Web Vitals, this means your domain isn&apos;t fully configured yet
            for performance tracking — click Retry, or contact your account
            manager if it persists.
          </GuideCallout>
        </GuideBody>
      );
    case "visibility-report":
      return (
        <GuideBody>
          <p>
            Your Visibility Report gives you a detailed, question-by-question
            breakdown of your AI visibility.
          </p>
          <p>
            <strong>Brand Visibility</strong> shows two views side by side:
          </p>
          <ul>
            <li>
              <strong>Non-Brand Terms</strong> — how often your brand appears
              for generic, category-level queries where you aren&apos;t named.
            </li>
            <li>
              <strong>Brand Terms</strong> — how often your brand appears when
              someone asks about you directly by name.
            </li>
          </ul>
          <p>
            <strong>Sentiment Analysis</strong> shows how AI models describe
            your brand across all responses — Positive, Neutral, or Negative —
            for both query types.
          </p>
          <p>
            <strong>Visibility Results</strong> lists every tracked term with
            its question count, visibility percentage, and sentiment. Switch
            between the <strong>Non-Brand Terms Visibility</strong> and{" "}
            <strong>Brand Terms Visibility</strong> tabs to filter the list.
            Click any term to expand it and see:
          </p>
          <ul>
            <li>The exact questions asked</li>
            <li>Your visibility rate for that term</li>
            <li>Any competitors mentioned instead of you</li>
          </ul>
          <p>
            Use <strong>Manage Terms</strong> (top right) to add, remove, or
            edit the terms you&apos;re tracking at any time — changes take
            effect on your next scan.
          </p>
          <GuideCallout>
            📌 A term showing 0% visibility with competitors mentioned is a
            strong signal for where to focus content or technical improvements —
            check My Actions for AI-suggested next steps tied to these gaps.
          </GuideCallout>
        </GuideBody>
      );
    case "perception-mirror":
      return (
        <GuideBody>
          <p>
            Perception Mirror shows you how AI models actually perceive and
            describe your brand — not what you say about yourself, but what AI
            infers and repeats.
          </p>
          <p>
            <strong>AI Positioning Summary</strong> is a narrative paragraph
            describing how AI currently positions your brand, along with its
            inferred audience and market tier.
          </p>
          <p>
            <strong>Perception Scores</strong> (each out of 100):
          </p>
          <ul>
            <li>
              <strong>Positioning Clarity</strong> — how clearly AI describes
              your market position
            </li>
            <li>
              <strong>Authority Depth</strong> — depth of expertise and
              credibility AI perceives
            </li>
            <li>
              <strong>Proof Strength</strong> — evidence and testimonials AI
              associates with you
            </li>
            <li>
              <strong>Differentiation Clarity</strong> — how uniquely AI
              distinguishes you from competitors
            </li>
          </ul>
          <p>
            <strong>Strength Signals</strong> and{" "}
            <strong>Weakness Signals</strong> list the specific positive
            attributes AI associates with your brand, and the specific gaps or
            uncertainties in its understanding.
          </p>
          <p>
            <strong>Known Brand Weaknesses</strong> — click{" "}
            <strong>Research Brand Weaknesses</strong> to have AI search review
            platforms and forums for real complaints, negative reviews, and
            vulnerabilities associated with your brand, plus flags specific
            risks to address.
          </p>
          <p>
            <strong>Confusion Markers</strong> — click any marker to see an AI
            review of what it means and what &quot;good&quot; looks like for
            fixing it.
          </p>
          <p>
            <strong>Top 5 Improvements to Increase AI Inclusion</strong> gives
            you a prioritized, actionable list of the highest-impact changes to
            improve how AI represents your brand.
          </p>
        </GuideBody>
      );
    case "coverage-analysis":
      return (
        <GuideBody>
          <GuideCallout>
            📌 Available on <strong>Growth plan and above</strong>. Not included
            on Starter.
          </GuideCallout>
          <p>
            Coverage Analysis shows how well your brand covers the topics that
            matter in your category, compared to competitors.
          </p>
          <p>
            <strong>Summary cards</strong> at the top show your count of Strong,
            Weak, and Competitor-owned topics, plus how many are flagged as
            high-priority gaps.
          </p>
          <p>
            <strong>Topic Cluster Map</strong> is a visual bubble map — green
            bubbles are strong coverage, red are weak, gray are
            competitor-owned. Hover any bubble for the AI&apos;s analysis of
            that topic.
          </p>
          <p>
            <strong>Topic Coverage Detail</strong> lists every analyzed topic
            with its coverage status and a written explanation of why it&apos;s
            scored that way.
          </p>
          <p>
            <strong>Gap Analysis &amp; Recommendations</strong> compares your
            coverage against each tracked competitor topic-by-topic, with a
            severity rating (High/Medium) and a specific recommended content
            action for each gap.
          </p>
          <p>
            <strong>Missing Content Topics</strong> is a shortlist of topics you
            should consider creating content for, based on where your coverage
            is weakest.
          </p>
          <p>
            <strong>Competitor Topic Strengths</strong> shows a bar chart of how
            many strong topics each competitor has, with the specific topics
            they&apos;re strong in listed alongside.
          </p>
        </GuideBody>
      );
    case "competitor-map":
      return (
        <GuideBody>
          <GuideCallout>
            📌 Available on <strong>Growth plan and above</strong>. Not included
            on Starter.
          </GuideCallout>
          <p>
            Competitor Map shows you exactly where your tracked competitors are
            winning in AI responses — and where you have an opportunity to close
            the gap.
          </p>
          <p>
            <strong>Competitor Frequency</strong> is a bar chart showing how
            often each competitor appears in AI responses; click any competitor
            for an AI-generated intelligence briefing.
          </p>
          <p>
            <strong>Funnel Stage Coverage</strong> is a radar chart showing
            which stage of the buyer journey — Awareness, Consideration, or
            Commercial — each competitor dominates.
          </p>
          <p>
            <strong>By AI Model</strong> and <strong>Response Sentiment</strong>{" "}
            show which AI models surface your competitors most, and how
            positively they&apos;re described when they do.
          </p>
          <p>
            <strong>Competitive Intelligence</strong> has two tabs:
          </p>
          <ul>
            <li>
              <strong>Missed Prompts</strong> — the exact questions where
              competitors appeared and you didn&apos;t, which competitor(s)
              showed up, why they appeared, and a recommended action to improve
              your inclusion
            </li>
            <li>
              <strong>Competitor Weakness</strong> — select any tracked
              competitor to get an AI-researched summary of their known
              vulnerabilities, drawn from reviews and public feedback
            </li>
          </ul>
          <p>
            <strong>Manage Competitors</strong> (top right) lets you add, edit,
            or remove tracked competitors at any time — changes take effect on
            your next scan.
          </p>
        </GuideBody>
      );
    case "technical-brand-audit":
      return (
        <GuideBody>
          <p>
            Technical Brand Audit gives your site an overall AI-readiness score
            out of 100, based on 12 individual checks that matter for how well
            AI models can find, understand, and trust your content.
          </p>
          <p>
            <strong>The checklist covers:</strong> Organisation Schema, FAQ
            Schema, Article/Content Schema, Author &amp; E-E-A-T Signals,
            Internal Linking Structure, Canonical Tags &amp; URL Structure, Meta
            Descriptions &amp; Page Summaries, Comparison &amp; Alternative
            Pages, Content Freshness &amp; Update Frequency, Social Proof &amp;
            Trust Signals, Site Performance &amp; Core Web Vitals, and AI Bot
            Crawlability.
          </p>
          <p>Click any check to expand it and see:</p>
          <ul>
            <li>
              <strong>What is this</strong> — what the check measures and why it
              matters
            </li>
            <li>
              <strong>How it should work</strong> — best practice
            </li>
            <li>
              <strong>Where you are today</strong> — your site&apos;s current
              state, in plain English
            </li>
            <li>
              <strong>What to fix</strong> — a specific, actionable
              recommendation
            </li>
          </ul>
          <p>
            Click <strong>Run AI Audit</strong> to trigger a fresh assessment at
            any time (takes roughly 45–90 seconds).
          </p>
          <GuideCallout>
            📌 If your site is a React/Next.js single-page application, you may
            see a note that some checks can&apos;t fully inspect rendered
            content — this is expected and doesn&apos;t affect the accuracy of
            most checks.
          </GuideCallout>
          <GuideCallout>
            📌 Since most checks are evaluated live by AI against current search
            results, scores can shift slightly between runs even without site
            changes — this reflects real-world AI perception, not a bug.
          </GuideCallout>
        </GuideBody>
      );
    case "core-web-vitals":
      return (
        <GuideBody>
          <p>
            Core Web Vitals benchmarks your site&apos;s technical performance
            against your tracked competitors, using real Google PageSpeed data.
          </p>
          <p>
            Click <strong>Generate Report</strong> to run a fresh analysis —
            this fetches Performance, Accessibility, Best Practices, and SEO
            scores for your site and each competitor, on both{" "}
            <strong>Mobile</strong> and <strong>Desktop</strong>.
          </p>
          <p>
            <strong>Benchmark Comparison tables</strong> show all sites side by
            side across the four score categories, so you can immediately see
            where you stand.
          </p>
          <p>
            <strong>AI Performance Analysis</strong> gives you a written,
            plain-English summary of the most important takeaways from the
            comparison — written as if a web performance consultant reviewed the
            results for you.
          </p>
          <p>
            Use the <strong>site tabs</strong> (your domain + each competitor)
            to drill into any individual site&apos;s full metrics.
          </p>
          <GuideCallout>
            📌 If you see &quot;Unable to load performance data&quot; elsewhere
            in the platform (e.g. on your Dashboard), it means your domain
            isn&apos;t fully configured for performance tracking yet — this page
            is where you generate that data.
          </GuideCallout>
        </GuideBody>
      );
    case "alerts":
      return (
        <GuideBody>
          <p>
            Alerts notifies you whenever something meaningful changes in how AI
            models reference your brand.
          </p>
          <p>
            <strong>Two alert types:</strong>
          </p>
          <ul>
            <li>
              <strong>Sentiment Change</strong> — a tracked question&apos;s
              AI-generated sentiment shifted (e.g. from positive to neutral) on
              a specific model
            </li>
            <li>
              <strong>New Competitor</strong> — a competitor now appears in a
              tracked prompt where they didn&apos;t before
            </li>
          </ul>
          <p>
            Each alert shows the exact question, the AI model involved, the
            date, and what changed. Use the <strong>All</strong> /{" "}
            <strong>Unread</strong> tabs to filter, and click{" "}
            <strong>Mark read</strong> on individual alerts or{" "}
            <strong>Mark all read</strong> to clear your queue.
          </p>
          <GuideCallout>
            📌 New alerts are generated automatically as your scans run — no
            setup required.
          </GuideCallout>
        </GuideBody>
      );
    case "reports":
      return (
        <GuideBody>
          <p>
            Reports turns your platform data into polished, downloadable PDF
            reports — three types are available:
          </p>
          <ul>
            <li>
              <strong>Executive Snapshot</strong> — a high-level AI-powered
              briefing with visual scorecards, a competitor prominence pie
              chart, perception score gauges (positioning, authority, proof,
              differentiation), AI-generated strategic actions with priority
              levels, and a model-by-model visibility breakdown
            </li>
            <li>
              <strong>Marketing Action Report</strong> — a complete DIY guide
              with one page per recommended action, including real content
              examples (not generic templates), exact key phrases to use,
              step-by-step implementation instructions, competitor comparison
              page blueprints, an FAQ/schema strategy, and a 3-month content
              calendar
            </li>
            <li>
              <strong>Competitive Intelligence</strong> — visual competitor
              prominence charts, a per-competitor AI strategy analysis, key
              phrases competitors own in AI responses, specific differentiation
              opportunities, and a threat assessment
            </li>
          </ul>
          <p>
            Click <strong>Generate Report</strong> on any type — this takes
            roughly 30–60 seconds. Once ready, click{" "}
            <strong>Download Latest PDF</strong>, or find any past report in the{" "}
            <strong>Generated Reports</strong> history below, each marked with
            its generation date and a &quot;Ready&quot; status.
          </p>
        </GuideBody>
      );
    case "resource-library":
      return (
        <GuideBody>
          <p>
            Resource Library gives you practical, step-by-step guides for
            improving your brand&apos;s AI visibility and machine readability,
            organized into three sections.
          </p>
          <p>
            <strong>Structured Data Schemas</strong> — JSON-LD markup that tells
            AI models who you are:
          </p>
          <ul>
            <li>
              <strong>Organisation Schema</strong> — your brand&apos;s identity
              card; tells AI your company name, what you do, where you&apos;re
              based, and how to contact you
            </li>
            <li>
              <strong>FAQ Schema</strong> — helps AI quote your answers directly
              when someone asks a relevant question
            </li>
            <li>
              <strong>Article Schema</strong> — establishes authorship and
              E-E-A-T (Experience, Expertise, Authoritativeness,
              Trustworthiness) signals for your content
            </li>
          </ul>
          <p>
            <strong>SEO Essentials</strong> — HTML elements AI crawlers read
            when indexing your site:
          </p>
          <ul>
            <li>
              <strong>Canonical Tags</strong> — point every URL variant of a
              page to one &quot;official&quot; version, so AI doesn&apos;t get
              confused about which to cite
            </li>
            <li>
              <strong>Meta Descriptions &amp; Page Titles</strong> — often the
              first (sometimes only) text AI reads before deciding whether to
              dig deeper into your page
            </li>
          </ul>
          <p>
            <strong>AI &amp; Crawler Files</strong> — three configuration files
            at your site&apos;s root that gatekeep AI access:
          </p>
          <ul>
            <li>
              <strong>robots.txt</strong> — controls whether AI bots (GPTBot,
              ClaudeBot, etc.) can access your site at all
            </li>
            <li>
              <strong>ai.txt</strong> — controls what AI models are permitted to
              do with your content (quote, summarize, train)
            </li>
            <li>
              <strong>llms.txt</strong> — a structured markdown summary of your
              brand written specifically for AI models, like a Wikipedia entry
              optimized for machine reading
            </li>
          </ul>
          <GuideCallout>
            📌 If you only implement three things from this whole library, the
            platform recommends starting with the three AI &amp; Crawler Files —
            they&apos;re the most common reason brands score zero on AI
            visibility despite having great content.
          </GuideCallout>
        </GuideBody>
      );
    case "brand-settings":
      return (
        <GuideBody>
          <p>
            Brand Settings is where you manage the core inputs that power every
            AI scan on your account, across three tabs.
          </p>
          <p>
            <strong>Brand Profile</strong> — your company details, editable at
            any time:
          </p>
          <ul>
            <li>Company Name, Domain, Category, Target Audience, Territory</li>
            <li>
              Brand Positioning and Problem Statement — your value proposition,
              used in perception and competitor analysis
            </li>
            <li>
              Products/Services and Key Differentiators — used to generate
              product-aware questions and competitive analysis prompts
            </li>
            <li>Brand Tone — influences how AI interprets your messaging</li>
            <li>
              Key Topics — comma-separated topics your brand should be known
              for, used in Coverage Analysis gap detection
            </li>
          </ul>
          <p>
            Click <strong>Save Changes</strong> after editing. A{" "}
            <strong>Remove Brand</strong> option is available at the bottom —
            this permanently deletes all scan history, tracked terms, questions,
            and visibility data for that brand, and cannot be undone.
          </p>
          <p>
            <strong>Competitors</strong> — manage who you&apos;re tracked
            against (shown as a running count, e.g. &quot;4 / Unlimited&quot;
            depending on your plan). Click <strong>Add competitor</strong>,
            enter their URL, and AI researches and verifies the company before
            adding it to your list. Changes take effect on your next scan.
          </p>
          <p>
            <strong>Key Terms</strong> — manage the search terms AI monitors for
            you, split into two views:
          </p>
          <ul>
            <li>
              <strong>Non-Brand Terms Visibility</strong> — generic questions
              real people ask AI, where your brand should appear without being
              named
            </li>
            <li>
              <strong>Brand Terms Visibility</strong> — questions that directly
              reference your brand, testing whether AI knows about and
              recommends you
            </li>
          </ul>
          <p>
            Click <strong>Add Term</strong>, describe your brand in a{" "}
            <strong>Brand statement</strong> (e.g. &quot;best project management
            tools for remote teams&quot;) and optionally a{" "}
            <strong>Category</strong> — AI automatically generates both user
            questions and brand sentiment questions from it. Each active
            question is queried daily across ChatGPT, Claude Haiku, and Gemini,
            with results appearing on your Dashboard within 24 hours.
          </p>
        </GuideBody>
      );
    case "team":
      return (
        <GuideBody>
          <p>
            Team Management is where you invite teammates and control exactly
            what each person can do on your account.
          </p>
          <p>
            <strong>Team Seats</strong> shows how many seats you&apos;re using
            out of your plan&apos;s total (seat count varies by tier — e.g.
            Starter includes 2, Accelerate includes 5; higher tiers may include
            unlimited seats).
          </p>
          <p>
            To invite someone, click <strong>Invite</strong> and fill in:
          </p>
          <ul>
            <li>
              <strong>Full Name</strong>
            </li>
            <li>
              <strong>Email Address</strong>
            </li>
            <li>
              <strong>Permissions</strong> — check exactly what they can do:
            </li>
          </ul>
          <figure className="mt-2 overflow-x-auto rounded-md border border-border">
            <table>
              <thead>
                <tr>
                  <th>Permission</th>
                  <th>What it allows</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Add Brands</td>
                  <td>Create new brand profiles</td>
                </tr>
                <tr>
                  <td>Billing</td>
                  <td>View and manage billing</td>
                </tr>
                <tr>
                  <td>Add Competitors</td>
                  <td>Manage competitor tracking</td>
                </tr>
                <tr>
                  <td>Manage Users</td>
                  <td>Invite and manage team members</td>
                </tr>
                <tr>
                  <td>Create Tickets</td>
                  <td>Create action tickets (on by default)</td>
                </tr>
                <tr>
                  <td>Delete Tickets</td>
                  <td>Delete action tickets</td>
                </tr>
                <tr>
                  <td>Edit Tickets</td>
                  <td>Edit and move action tickets (on by default)</td>
                </tr>
              </tbody>
            </table>
          </figure>
          <p>
            Click <strong>Send Invite</strong> once you&apos;re done —
            they&apos;ll receive an email to join your account with exactly the
            access you&apos;ve selected.
          </p>
          <GuideCallout>
            📌 If the invite modal doesn&apos;t let you scroll to the Send
            Invite button, try resizing your browser window or zooming out.
          </GuideCallout>
        </GuideBody>
      );
    case "billing":
      return (
        <GuideBody>
          <GuideCallout>
            📌 What you see on this page depends on how your account is set up.
          </GuideCallout>
          <p>
            If your plan is{" "}
            <strong>managed directly by your account manager</strong>,
            you&apos;ll see a simplified view: your{" "}
            <strong>Current Plan</strong> badge and status, a note that billing
            is handled outside the app, and a <strong>Usage This Period</strong>{" "}
            summary (key terms, brand profiles, competitors, reports, and alerts
            used so far).
          </p>
          <p>
            If you&apos;re on <strong>self-serve billing</strong>, you&apos;ll
            additionally see:
          </p>
          <ul>
            <li>
              <strong>Change Plan</strong> — select a new tier from the pricing
              page
            </li>
            <li>
              <strong>Add-on Packs</strong> — browse additional capacity (extra
              brands, competitors, users, topics, or alerts)
            </li>
            <li>
              <strong>Invoice History</strong> — past invoices available for
              download
            </li>
          </ul>
          <p>
            If you&apos;re not sure which applies to you, or something looks
            different from what&apos;s described here, contact your account
            manager.
          </p>
          <GuideCallout title="⚠️ Important:">
            Cancelling your subscription permanently deletes all your brand
            profiles, competitor data, tracked key terms, AI scan results,
            reports, and alerts. This cannot be undone. If you intend to pause
            usage rather than cancel, contact support instead.
          </GuideCallout>
        </GuideBody>
      );
    default:
      return null;
  }
}

function WelcomeVideoSection() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Welcome video</h2>
      <Card id="guide-welcome-video" data-testid="section-welcome-video">
        <section
          className="grid overflow-hidden min-[900px]:grid-cols-[minmax(320px,520px)_1fr]"
          data-testid="welcome-video"
        >
          <div className="aspect-video w-full overflow-hidden bg-black min-[900px]:aspect-auto min-[900px]:min-h-[292px]">
            <iframe
              src={WELCOME_GUIDE_VIDEO_URL}
              title="Welcome to AEO Stars"
              className="h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
          <div className="flex flex-col justify-center">
            <div className="grid gap-1.5 p-6 pb-5">
              <Badge variant="secondary" className="w-fit">
                VIDEO
              </Badge>
              <h3 className="text-lg font-semibold leading-snug text-foreground">
                {WELCOME_TITLE}
              </h3>
              <p className="leading-relaxed text-muted-foreground">
                {WELCOME_DESCRIPTION}
              </p>
            </div>
          </div>
        </section>
      </Card>
    </div>
  );
}

function GuideBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-border px-5 py-5 [&>*:first-child]:mt-0 [&>div]:mt-6 [&>figure+p]:mt-2 [&>h4]:mt-6 [&>h4]:text-sm [&>h4]:font-semibold [&>h4]:text-foreground [&>h4]:leading-snug [&>p]:mt-6 [&>p]:text-sm [&>p]:leading-relaxed [&>p]:text-foreground/80 [&>ul]:mt-2 [&>ul]:list-disc [&>ul]:space-y-2 [&>ul]:pl-5 [&>ul]:text-sm [&>ul]:leading-relaxed [&>ul]:text-foreground/80 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_th]:border-b [&_th]:border-border [&_th]:bg-muted/30 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-foreground [&_td]:border-b [&_td]:border-border/60 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-[13px] [&_td]:leading-relaxed [&_td]:text-foreground/80 [&_tr:last-child_td]:border-b-0">
      {children}
    </div>
  );
}

function GuideCallout({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="rounded-md border border-border border-l-2 border-l-foreground/40 bg-muted/40 p-4">
      {title && (
        <p className="text-sm font-semibold text-foreground">{title}</p>
      )}
      <div className="text-sm leading-relaxed text-foreground/80">
        {children}
      </div>
    </div>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const found = lower.indexOf(needle, i);
    if (found === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (found > i) parts.push(text.slice(i, found));
    parts.push(
      <mark
        key={key++}
        className="bg-warning-muted text-warning rounded px-0.5"
      >
        {text.slice(found, found + needle.length)}
      </mark>,
    );
    i = found + needle.length;
  }
  return <>{parts}</>;
}

function getDeepLinkedGuideId(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  return WELCOME_VIDEO.id === hash || GUIDES.some((g) => g.id === hash)
    ? hash
    : null;
}

function GuideCard({
  item,
  query,
  expanded,
  onToggle,
}: {
  item: UserGuideItem;
  query: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const videoEmbedUrl = getPageGuideMockData(item.title)?.videoEmbedUrl;
  return (
    <Card id={`guide-${item.id}`} data-testid={`card-guide-${item.id}`}>
      <CardContent className="p-0">
        <button
          className="flex w-full items-start gap-4 p-5 text-left hover-elevate rounded-t-md"
          onClick={onToggle}
          aria-expanded={expanded}
          data-testid={`button-expand-${item.id}`}
        >
          <span className="mt-0.5 shrink-0 text-muted-foreground">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 flex-wrap">
              <item.icon
                className="h-4 w-4 shrink-0 text-foreground"
                aria-hidden="true"
              />
              <span className="text-sm font-semibold text-foreground">
                <HighlightedText text={item.title} query={query} />
              </span>
              {item.kind === "video" && (
                <Badge variant="secondary">Video</Badge>
              )}
            </span>
            <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
              <HighlightedText text={item.subtitle} query={query} />
            </span>
          </span>
        </button>

        {expanded && <GuideDetail id={item.id} query={query} />}
      </CardContent>
    </Card>
  );
}

export default function UserGuide() {
  const [query, setQuery] = useState("");
  const [deepLinkedId, setDeepLinkedId] = useState<string | null>(() =>
    getDeepLinkedGuideId(),
  );
  const [expandedGuideId, setExpandedGuideId] = useState<string | null>(() =>
    getDeepLinkedGuideId(),
  );

  useEffect(() => {
    const onHashChange = () => setDeepLinkedId(getDeepLinkedGuideId());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Jump to the deep-linked guide and leave it expanded.
  useEffect(() => {
    if (!deepLinkedId || query.trim()) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById(`guide-${deepLinkedId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [deepLinkedId, query]);

  const detailTexts = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of GUIDES)
      map.set(g.id, extractText(detailContent(g.id)).toLowerCase());
    return map;
  }, []);

  // Keep search and deep-link auto-expansion within the same single-open
  // accordion state used by manual toggles.
  useEffect(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      setExpandedGuideId(deepLinkedId);
      return;
    }

    const firstMatch = GUIDES.find((guide) =>
      `${guide.title} ${guide.subtitle} ${detailTexts.get(guide.id) ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
    setExpandedGuideId(firstMatch?.id ?? null);
  }, [query, deepLinkedId, detailTexts]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GUIDES;
    return GUIDES.filter((g) =>
      `${g.title} ${g.subtitle} ${detailTexts.get(g.id) ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [query, detailTexts]);

  const videoMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${WELCOME_VIDEO.title} ${WELCOME_VIDEO.subtitle} ${WELCOME_TITLE} ${WELCOME_DESCRIPTION}`
      .toLowerCase()
      .includes(q);
  }, [query]);

  return (
    <PageShell
      title="User Guide"
      subtitle="Get to know your workspace. Understand every feature and what to do next."
    >
      {videoMatches && <WelcomeVideoSection />}

      <Card data-testid="card-guide-search">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              Your guide to AI visibility
            </h2>
            <p className="mt-1 text-[13px] text-foreground">
              Choose a feature below to explore how it works.
            </p>
          </div>
          <div className="relative w-full max-w-md shrink-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search user guides"
              placeholder="Search features or keywords…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 pl-10 pr-10 focus-visible:ring-0 focus-visible:ring-offset-0"
              data-testid="input-search-guides"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                data-testid="button-clear-search"
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          Explore features{" "}
          <span
            className="ml-1 font-normal text-muted-foreground"
            aria-live="polite"
            data-testid="text-guide-count"
          >
            {visible.length} {visible.length === 1 ? "guide" : "guides"}
          </span>
        </h2>
      </div>

      {visible.length > 0 ? (
        <div className="space-y-4" data-testid="list-guides">
          {visible.map((item) => (
            <GuideCard
              key={item.id}
              item={item}
              query={query}
              expanded={item.id === expandedGuideId}
              onToggle={() =>
                setExpandedGuideId((currentId) =>
                  currentId === item.id ? null : item.id,
                )
              }
            />
          ))}
        </div>
      ) : videoMatches ? null : (
        <Card data-testid="empty-search">
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-semibold text-foreground">
              No matching guides
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a feature name or a keyword such as “visibility” or “terms”.
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              data-testid="button-reset-search"
              className="mt-4 rounded-md px-4 py-2.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              Clear search
            </button>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
