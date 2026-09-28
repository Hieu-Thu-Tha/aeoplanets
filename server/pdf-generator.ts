import PDFDocument from "pdfkit";
import type {
  ExecutiveReportContent,
  MarketingActionReportContent,
  CompetitiveIntelReportContent,
} from "./report-generator";

type ReportContent = ExecutiveReportContent | MarketingActionReportContent | CompetitiveIntelReportContent;

interface PDFGeneratorOptions {
  report: ReportContent;
  brandDomain: string;
}

const COLORS = {
  primary: "#3b82f6",
  primaryDark: "#2563eb",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textDark: "#1e293b",
  background: "#0f172a",
  cardBg: "#1e293b",
  border: "#334155",
  white: "#ffffff",
  barColors: ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444", "#22c55e", "#ec4899", "#14b8a6"],
};

export class ReportPDFGenerator {
  private doc: PDFKit.PDFDocument;
  private pageWidth = 495;
  private leftMargin = 50;

  constructor(private options: PDFGeneratorOptions) {
    this.doc = new PDFDocument({
      size: "A4",
      margin: 50,
      bufferPages: true,
    });
  }

  async generate(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.doc.on("data", (chunk) => chunks.push(chunk));
      this.doc.on("end", () => resolve(Buffer.concat(chunks)));
      this.doc.on("error", reject);

      try {
        this.addCoverPage();
        const r = this.options.report as any;

        if (r.summary && r.sections && !r.executiveSummary) {
          this.addLegacyContent(r);
        } else if (r.reportType === "executive") {
          this.addExecutiveContent(r as ExecutiveReportContent);
        } else if (r.reportType === "marketing") {
          this.addMarketingContent(r as MarketingActionReportContent);
        } else if (r.reportType === "competitive") {
          this.addCompetitiveContent(r as CompetitiveIntelReportContent);
        }
        this.addFooters();
        this.doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private ensureSpace(needed: number) {
    if (this.doc.y + needed > 720) {
      this.doc.addPage();
      this.doc.y = 50;
    }
  }

  private addCoverPage() {
    this.doc.rect(0, 0, 595.28, 841.89).fill(COLORS.background);

    this.doc.rect(0, 0, 595.28, 4).fill(COLORS.primary);

    this.doc.fontSize(10).fillColor(COLORS.primary)
      .text("AEO STARS", this.leftMargin, 50)
      .moveDown(0.5);

    this.doc.strokeColor(COLORS.border).lineWidth(0.5)
      .moveTo(this.leftMargin, this.doc.y)
      .lineTo(this.leftMargin + this.pageWidth, this.doc.y)
      .stroke();

    const reportLabels: Record<string, string> = {
      executive: "Executive Snapshot",
      marketing: "Marketing Action Report",
      competitive: "Competitive Intelligence Report",
    };

    this.doc.moveDown(6);
    this.doc.fontSize(32).fillColor(COLORS.white)
      .text(reportLabels[this.options.report.reportType] || "Report", this.leftMargin, this.doc.y, { width: this.pageWidth });

    this.doc.moveDown(1);
    this.doc.fontSize(16).fillColor(COLORS.textMuted)
      .text(this.options.brandDomain, this.leftMargin, this.doc.y, { width: this.pageWidth });

    this.doc.moveDown(0.5);
    const date = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
    this.doc.fontSize(11).fillColor(COLORS.textMuted)
      .text(`Generated ${date}`, this.leftMargin, this.doc.y, { width: this.pageWidth });

    this.doc.moveDown(3);
    this.doc.strokeColor(COLORS.border).lineWidth(0.5)
      .moveTo(this.leftMargin, this.doc.y)
      .lineTo(this.leftMargin + this.pageWidth, this.doc.y)
      .stroke();

    this.doc.moveDown(1.5);
    this.doc.fontSize(9).fillColor(COLORS.textMuted)
      .text("AI Representation & Visibility Intelligence Platform", this.leftMargin, this.doc.y, { width: this.pageWidth });

    this.doc.addPage();
  }

  private newContentPage() {
    this.doc.rect(0, 0, 595.28, 841.89).fill(COLORS.background);
    this.doc.rect(0, 0, 595.28, 2).fill(COLORS.primary);
    this.doc.y = 50;
  }

  private addSectionTitle(title: string) {
    this.ensureSpace(40);
    this.doc.moveDown(0.5);
    this.doc.fontSize(16).fillColor(COLORS.primary)
      .text(title, this.leftMargin, this.doc.y, { width: this.pageWidth });
    this.doc.moveDown(0.3);
    this.doc.strokeColor(COLORS.primary).lineWidth(1)
      .moveTo(this.leftMargin, this.doc.y)
      .lineTo(this.leftMargin + 80, this.doc.y)
      .stroke();
    this.doc.moveDown(0.8);
  }

  private addSubsectionTitle(title: string) {
    this.ensureSpace(30);
    this.doc.fontSize(12).fillColor(COLORS.white)
      .text(title, this.leftMargin, this.doc.y, { width: this.pageWidth });
    this.doc.moveDown(0.4);
  }

  private addParagraph(text: string) {
    this.ensureSpace(60);
    this.doc.fontSize(10).fillColor(COLORS.textMuted)
      .text(text, this.leftMargin, this.doc.y, { width: this.pageWidth, align: "left", lineGap: 3 });
    this.doc.moveDown(0.6);
  }

  private addBulletPoint(text: string, indent = 0) {
    this.ensureSpace(20);
    const x = this.leftMargin + 10 + indent;
    this.doc.fontSize(10).fillColor(COLORS.textMuted)
      .text(`\u2022  ${text}`, x, this.doc.y, { width: this.pageWidth - 10 - indent, lineGap: 2 });
    this.doc.moveDown(0.2);
  }

  private drawScoreCard(x: number, y: number, width: number, label: string, value: string, subtext: string, color: string) {
    const height = 70;
    this.drawRoundedRect(x, y, width, height, COLORS.cardBg);
    this.doc.rect(x, y, 3, height).fill(color);

    this.doc.fontSize(9).fillColor(COLORS.textMuted)
      .text(label, x + 14, y + 10, { width: width - 24 });

    this.doc.fontSize(22).fillColor(COLORS.white)
      .text(value, x + 14, y + 25, { width: width - 24 });

    this.doc.fontSize(8).fillColor(COLORS.textMuted)
      .text(subtext, x + 14, y + 52, { width: width - 24 });
  }

  private drawRoundedRect(x: number, y: number, w: number, h: number, fill: string) {
    this.doc.rect(x, y, w, h).fill(fill);
  }

  private drawHorizontalBar(x: number, y: number, width: number, percentage: number, label: string, valueLabel: string, color: string) {
    const barHeight = 14;
    const labelY = y;
    this.doc.fontSize(9).fillColor(COLORS.textMuted)
      .text(label, x, labelY, { width: width * 0.55 });

    this.doc.fontSize(9).fillColor(COLORS.white)
      .text(valueLabel, x + width * 0.75, labelY, { width: width * 0.25, align: "right" });

    const barY = y + 16;
    this.doc.rect(x, barY, width, barHeight).fill(COLORS.border);
    const filled = Math.max(0, Math.min(percentage / 100, 1)) * width;
    if (filled > 0) {
      this.doc.rect(x, barY, filled, barHeight).fill(color);
    }

    return barY + barHeight + 8;
  }

  private drawPieChart(cx: number, cy: number, radius: number, data: { label: string; value: number; color: string }[]) {
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) return;

    let startAngle = -Math.PI / 2;
    for (const d of data) {
      const sliceAngle = (d.value / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;

      this.doc.save();
      this.doc.moveTo(cx, cy);
      const steps = Math.max(20, Math.ceil(sliceAngle * 20));
      for (let i = 0; i <= steps; i++) {
        const angle = startAngle + (sliceAngle * i) / steps;
        const px = cx + radius * Math.cos(angle);
        const py = cy + radius * Math.sin(angle);
        if (i === 0) this.doc.lineTo(px, py);
        else this.doc.lineTo(px, py);
      }
      this.doc.lineTo(cx, cy);
      this.doc.fill(d.color);
      this.doc.restore();

      startAngle = endAngle;
    }

    let legendY = cy - (data.length * 16) / 2;
    const legendX = cx + radius + 20;
    for (const d of data) {
      const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
      this.doc.rect(legendX, legendY, 10, 10).fill(d.color);
      this.doc.fontSize(8).fillColor(COLORS.textMuted)
        .text(`${d.label} (${pct}%)`, legendX + 14, legendY + 1, { width: 160 });
      legendY += 16;
    }
  }

  private drawCirclePath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
    const steps = Math.max(20, Math.ceil(Math.abs(endAngle - startAngle) * 15));
    this.doc.moveTo(cx + radius * Math.cos(startAngle), cy + radius * Math.sin(startAngle));
    for (let i = 1; i <= steps; i++) {
      const angle = startAngle + ((endAngle - startAngle) * i) / steps;
      this.doc.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    }
  }

  private drawScoreGauge(x: number, y: number, score: number, label: string) {
    const size = 50;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const radius = size / 2 - 4;

    const color = score >= 70 ? COLORS.success : score >= 40 ? COLORS.warning : COLORS.danger;

    this.doc.save();
    this.doc.lineWidth(6).strokeColor(COLORS.border);
    this.drawCirclePath(cx, cy, radius, 0, Math.PI * 2);
    this.doc.stroke();
    this.doc.restore();

    if (score > 0) {
      const startAngle = -Math.PI / 2;
      const endAngle = (score / 100) * Math.PI * 2 - Math.PI / 2;
      this.doc.save();
      this.doc.lineWidth(6).strokeColor(color);
      this.drawCirclePath(cx, cy, radius, startAngle, endAngle);
      this.doc.stroke();
      this.doc.restore();
    }

    this.doc.fontSize(14).fillColor(COLORS.white)
      .text(String(score), cx - 12, cy - 7, { width: 24, align: "center" });

    this.doc.fontSize(7).fillColor(COLORS.textMuted)
      .text(label, x - 10, y + size + 4, { width: size + 20, align: "center" });
  }

  private addLegacyContent(report: { summary: string; sections: Array<{ title: string; content: string }>; reportType: string }) {
    this.newContentPage();

    this.addSectionTitle("Summary");
    this.addParagraph(report.summary || "No summary available.");

    if (Array.isArray(report.sections)) {
      for (const section of report.sections) {
        this.ensureSpace(80);
        this.addSectionTitle(section.title || "Section");
        this.addParagraph(section.content || "");
      }
    }
  }

  private addExecutiveContent(report: ExecutiveReportContent) {
    this.newContentPage();

    this.addSectionTitle("Executive Summary");
    this.addParagraph(report.executiveSummary || "No executive summary available.");

    this.addSectionTitle("AI Visibility Scorecard");
    const cardWidth = (this.pageWidth - 30) / 4;
    const cardY = this.doc.y;
    const modelBreakdown = report.modelBreakdown || [];
    const totalAppeared = modelBreakdown.reduce((s, m) => s + (m.appeared || 0), 0);
    const totalRuns = modelBreakdown.reduce((s, m) => s + (m.total || 0), 0);
    this.drawScoreCard(this.leftMargin, cardY, cardWidth, "Share of Voice", `${report.overallShareOfVoice ?? 0}%`, `${totalAppeared} of ${totalRuns} prompts`, COLORS.primary);
    this.drawScoreCard(this.leftMargin + cardWidth + 10, cardY, cardWidth, "Commercial Score", `${report.commercialScore ?? 0}%`, "Commercial intent", COLORS.success);
    this.drawScoreCard(this.leftMargin + (cardWidth + 10) * 2, cardY, cardWidth, "Category Score", `${report.categoryScore ?? 0}%`, "Category comparisons", COLORS.warning);
    this.drawScoreCard(this.leftMargin + (cardWidth + 10) * 3, cardY, cardWidth, "Readability", `${report.readabilityScore ?? 0}`, "Machine readability", (report.readabilityScore ?? 0) >= 60 ? COLORS.success : COLORS.danger);

    this.doc.y = cardY + 85;

    this.addSectionTitle("Visibility by AI Model");
    let barY = this.doc.y;
    for (const mb of modelBreakdown) {
      barY = this.drawHorizontalBar(
        this.leftMargin, barY, this.pageWidth,
        mb.percentage, mb.model, `${mb.percentage}% (${mb.appeared}/${mb.total})`,
        COLORS.primary
      );
    }
    this.doc.y = barY + 5;

    this.addSectionTitle("Visibility by Prompt Type");
    barY = this.doc.y;
    const promptColors = [COLORS.primary, COLORS.warning, COLORS.success, COLORS.barColors[2]];
    const promptTypeBreakdown = report.promptTypeBreakdown || [];
    promptTypeBreakdown.forEach((pt, i) => {
      barY = this.drawHorizontalBar(
        this.leftMargin, barY, this.pageWidth,
        pt.percentage, pt.type, `${pt.percentage}% (${pt.appeared}/${pt.total})`,
        promptColors[i % promptColors.length]
      );
    });
    this.doc.y = barY + 5;

    const competitorFrequency = report.competitorFrequency || [];
    if (competitorFrequency.length > 0) {
      this.ensureSpace(200);
      this.addSectionTitle("Competitor AI Prominence");

      const pieData = competitorFrequency.slice(0, 6).map((c, i) => ({
        label: c.name,
        value: c.mentions,
        color: COLORS.barColors[i % COLORS.barColors.length],
      }));
      const pieY = this.doc.y + 10;
      this.drawPieChart(this.leftMargin + 80, pieY + 60, 55, pieData);
      this.doc.y = pieY + 140;
    }

    const perceptionScores = report.perceptionScores || { positioning: 0, authority: 0, proof: 0, differentiation: 0 };
    this.ensureSpace(180);
    this.addSectionTitle("Perception Scores");
    const gaugeY = this.doc.y + 5;
    const gaugeSpacing = (this.pageWidth - 40) / 4;
    this.drawScoreGauge(this.leftMargin + 20, gaugeY, perceptionScores.positioning ?? 0, "Positioning");
    this.drawScoreGauge(this.leftMargin + 20 + gaugeSpacing, gaugeY, perceptionScores.authority ?? 0, "Authority");
    this.drawScoreGauge(this.leftMargin + 20 + gaugeSpacing * 2, gaugeY, perceptionScores.proof ?? 0, "Proof");
    this.drawScoreGauge(this.leftMargin + 20 + gaugeSpacing * 3, gaugeY, perceptionScores.differentiation ?? 0, "Differentiation");
    this.doc.y = gaugeY + 80;

    this.doc.addPage();
    this.newContentPage();

    this.addSectionTitle("Key Strengths");
    for (const s of (report.strengths || []).slice(0, 5)) {
      this.addBulletPoint(s);
    }

    this.addSectionTitle("Key Weaknesses");
    for (const w of (report.weaknesses || []).slice(0, 5)) {
      this.addBulletPoint(w);
    }

    this.addSectionTitle("Strategic Actions");
    for (const action of (report.strategicActions || [])) {
      this.ensureSpace(60);
      const priorityColor = action.priority === "critical" ? COLORS.danger : action.priority === "high" ? COLORS.warning : COLORS.primary;
      this.doc.fontSize(10).fillColor(COLORS.white)
        .text(`[${(action.priority || "medium").toUpperCase()}] ${action.action}`, this.leftMargin, this.doc.y, { width: this.pageWidth });
      this.doc.moveDown(0.2);
      this.doc.fontSize(9).fillColor(COLORS.textMuted)
        .text(action.reasoning, this.leftMargin + 10, this.doc.y, { width: this.pageWidth - 20, lineGap: 2 });
      this.doc.moveDown(0.5);
    }

    if (report.competitorPositioning) {
      this.ensureSpace(100);
      this.addSectionTitle("Competitor Positioning Analysis");
      this.addParagraph(report.competitorPositioning);
    }

    if (report.progressIndicators) {
      this.ensureSpace(100);
      this.addSectionTitle("Progress Indicators");
      this.addParagraph(report.progressIndicators);
    }
  }

  private addMarketingContent(report: MarketingActionReportContent) {
    this.newContentPage();

    this.addSectionTitle("Strategy Overview");
    this.addParagraph(report.executiveSummary || "No strategy overview available.");

    const actionItems = report.actionItems || [];
    for (let i = 0; i < actionItems.length; i++) {
      const item = actionItems[i];
      this.doc.addPage();
      this.newContentPage();

      const priorityColor = item.priority === "critical" ? COLORS.danger : item.priority === "high" ? COLORS.warning : COLORS.primary;

      this.doc.fontSize(9).fillColor(priorityColor)
        .text(`ACTION ${i + 1} OF ${actionItems.length}  |  ${(item.priority || "MEDIUM").toUpperCase()} PRIORITY`, this.leftMargin, 50, { width: this.pageWidth });
      this.doc.moveDown(0.5);

      this.doc.fontSize(18).fillColor(COLORS.white)
        .text(item.title, this.leftMargin, this.doc.y, { width: this.pageWidth });
      this.doc.moveDown(0.3);
      this.doc.strokeColor(COLORS.primary).lineWidth(1)
        .moveTo(this.leftMargin, this.doc.y)
        .lineTo(this.leftMargin + 60, this.doc.y)
        .stroke();
      this.doc.moveDown(1);

      this.addSubsectionTitle("Why This Matters");
      this.addParagraph(item.reasoning);

      this.addSubsectionTitle("Implementation Steps");
      for (const step of item.steps || []) {
        this.addBulletPoint(step);
      }

      if (item.exampleContent) {
        this.ensureSpace(100);
        this.addSubsectionTitle("Example Content");
        this.ensureSpace(80);
        const boxY = this.doc.y;
        this.doc.rect(this.leftMargin, boxY, this.pageWidth, 2).fill(COLORS.primary);
        this.drawRoundedRect(this.leftMargin, boxY + 2, this.pageWidth, 0, COLORS.cardBg);

        this.doc.fontSize(9).fillColor(COLORS.text)
          .text(item.exampleContent, this.leftMargin + 12, boxY + 12, {
            width: this.pageWidth - 24,
            lineGap: 3,
          });
        const textBottom = this.doc.y + 12;
        this.drawRoundedRect(this.leftMargin, boxY + 2, this.pageWidth, textBottom - boxY - 2, COLORS.cardBg);
        this.doc.fontSize(9).fillColor(COLORS.text)
          .text(item.exampleContent, this.leftMargin + 12, boxY + 12, {
            width: this.pageWidth - 24,
            lineGap: 3,
          });
        this.doc.y = textBottom + 5;
      }

      if (item.wordsToUse && item.wordsToUse.length > 0) {
        this.ensureSpace(50);
        this.addSubsectionTitle("Key Phrases to Include");
        const phrases = item.wordsToUse.join("  |  ");
        this.doc.fontSize(9).fillColor(COLORS.primary)
          .text(phrases, this.leftMargin + 10, this.doc.y, { width: this.pageWidth - 20 });
        this.doc.moveDown(0.6);
      }

      if (item.expectedImpact) {
        this.ensureSpace(40);
        this.addSubsectionTitle("Expected Impact");
        this.addParagraph(item.expectedImpact);
      }
    }

    if (report.faqStrategy && report.faqStrategy.questions?.length > 0) {
      this.doc.addPage();
      this.newContentPage();
      this.addSectionTitle("FAQ Strategy");

      this.addSubsectionTitle("Questions to Answer");
      for (const q of report.faqStrategy.questions) {
        this.addBulletPoint(q);
      }

      if (report.faqStrategy.implementation) {
        this.addSubsectionTitle("Implementation Guide");
        this.addParagraph(report.faqStrategy.implementation);
      }
    }

    if (report.comparisonPages && report.comparisonPages.length > 0) {
      this.doc.addPage();
      this.newContentPage();
      this.addSectionTitle("Comparison Pages to Create");

      for (const cp of report.comparisonPages) {
        this.ensureSpace(120);
        this.addSubsectionTitle(cp.pageTitle || `${report.brandDomain} vs ${cp.competitor}`);

        if (cp.sampleHeadings?.length > 0) {
          this.doc.fontSize(9).fillColor(COLORS.textMuted)
            .text("Suggested headings:", this.leftMargin + 10, this.doc.y, { width: this.pageWidth - 20 });
          this.doc.moveDown(0.2);
          for (const h of cp.sampleHeadings) {
            this.addBulletPoint(h, 10);
          }
        }

        if (cp.keyPoints?.length > 0) {
          this.doc.moveDown(0.2);
          this.doc.fontSize(9).fillColor(COLORS.textMuted)
            .text("Key comparison points:", this.leftMargin + 10, this.doc.y, { width: this.pageWidth - 20 });
          this.doc.moveDown(0.2);
          for (const p of cp.keyPoints) {
            this.addBulletPoint(p, 10);
          }
        }
        this.doc.moveDown(0.5);
      }
    }

    if (report.contentCalendar) {
      this.ensureSpace(120);
      this.addSectionTitle("Content Calendar");
      this.addParagraph(report.contentCalendar);
    }
  }

  private addCompetitiveContent(report: CompetitiveIntelReportContent) {
    this.newContentPage();

    this.addSectionTitle("Intelligence Summary");
    this.addParagraph(report.executiveSummary || "No summary available.");

    const competitorProminence = report.competitorProminence || [];
    if (competitorProminence.length > 0) {
      this.ensureSpace(250);
      this.addSectionTitle("Competitor AI Prominence");

      let barY = this.doc.y;
      const maxMentions = Math.max(...competitorProminence.map(c => c.mentions), 1);
      competitorProminence.forEach((comp, i) => {
        const pct = (comp.mentions / maxMentions) * 100;
        barY = this.drawHorizontalBar(
          this.leftMargin, barY, this.pageWidth,
          pct, comp.name,
          `${comp.mentions} mentions (${comp.percentage}%)`,
          COLORS.barColors[i % COLORS.barColors.length]
        );
      });
      this.doc.y = barY + 10;

      const pieData = competitorProminence.slice(0, 6).map((c, i) => ({
        label: c.name,
        value: c.mentions,
        color: COLORS.barColors[i % COLORS.barColors.length],
      }));

      this.ensureSpace(160);
      const pieY = this.doc.y + 10;
      this.drawPieChart(this.leftMargin + 80, pieY + 60, 55, pieData);
      this.doc.y = pieY + 140;
    }

    const competitorDominancePrompts = report.competitorDominancePrompts || [];
    if (competitorDominancePrompts.length > 0) {
      this.doc.addPage();
      this.newContentPage();
      this.addSectionTitle("Where Competitors Dominate");

      for (const d of competitorDominancePrompts) {
        this.ensureSpace(60);
        this.doc.fontSize(9).fillColor(COLORS.white)
          .text(`"${d.prompt}"`, this.leftMargin, this.doc.y, { width: this.pageWidth });
        this.doc.moveDown(0.2);
        this.doc.fontSize(8).fillColor(COLORS.textMuted)
          .text(`Competitors present: ${d.competitors.join(", ")}`, this.leftMargin + 10, this.doc.y, { width: this.pageWidth - 20 });
        if (d.analysis) {
          this.doc.moveDown(0.15);
          this.doc.fontSize(8).fillColor(COLORS.textMuted)
            .text(d.analysis, this.leftMargin + 10, this.doc.y, { width: this.pageWidth - 20 });
        }
        this.doc.moveDown(0.6);
      }
    }

    if (report.competitorStrategies && report.competitorStrategies.length > 0) {
      this.doc.addPage();
      this.newContentPage();
      this.addSectionTitle("Competitor AI Strategies");

      for (const cs of report.competitorStrategies) {
        this.ensureSpace(120);
        this.addSubsectionTitle(cs.competitor);
        this.addParagraph(cs.aiStrategy);

        if (cs.keyPhrases?.length > 0) {
          this.doc.fontSize(9).fillColor(COLORS.primary)
            .text(`Key phrases: ${cs.keyPhrases.join("  |  ")}`, this.leftMargin + 10, this.doc.y, { width: this.pageWidth - 20 });
          this.doc.moveDown(0.3);
        }

        if (cs.dominantAreas?.length > 0) {
          this.doc.fontSize(9).fillColor(COLORS.textMuted)
            .text(`Dominant in: ${cs.dominantAreas.join(", ")}`, this.leftMargin + 10, this.doc.y, { width: this.pageWidth - 20 });
          this.doc.moveDown(0.6);
        }
      }
    }

    if (report.differentiationOpportunities && report.differentiationOpportunities.length > 0) {
      this.ensureSpace(100);
      this.addSectionTitle("Differentiation Opportunities");

      for (let i = 0; i < report.differentiationOpportunities.length; i++) {
        const opp = report.differentiationOpportunities[i];
        this.ensureSpace(80);
        this.doc.fontSize(10).fillColor(COLORS.white)
          .text(`${i + 1}. ${opp.opportunity}`, this.leftMargin, this.doc.y, { width: this.pageWidth });
        this.doc.moveDown(0.2);
        this.doc.fontSize(9).fillColor(COLORS.textMuted)
          .text(opp.reasoning, this.leftMargin + 10, this.doc.y, { width: this.pageWidth - 20, lineGap: 2 });
        this.doc.moveDown(0.2);
        this.doc.fontSize(9).fillColor(COLORS.text)
          .text(`How to implement: ${opp.implementation}`, this.leftMargin + 10, this.doc.y, { width: this.pageWidth - 20, lineGap: 2 });
        this.doc.moveDown(0.6);
      }
    }

    if (report.aiClaimsRepeated && report.aiClaimsRepeated.length > 0) {
      this.ensureSpace(100);
      this.addSectionTitle("AI Claims Repeated");

      for (const claim of report.aiClaimsRepeated) {
        this.ensureSpace(40);
        this.doc.fontSize(9).fillColor(COLORS.white)
          .text(`"${claim.claim}"`, this.leftMargin, this.doc.y, { width: this.pageWidth });
        this.doc.moveDown(0.15);
        this.doc.fontSize(8).fillColor(COLORS.textMuted)
          .text(`Source: ${claim.source} | Frequency: ${claim.frequency}`, this.leftMargin + 10, this.doc.y, { width: this.pageWidth - 20 });
        this.doc.moveDown(0.5);
      }
    }

    if (report.threatAssessment) {
      this.ensureSpace(100);
      this.addSectionTitle("Threat Assessment");
      this.addParagraph(report.threatAssessment);
    }
  }

  private addFooters() {
    const pageCount = this.doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      this.doc.switchToPage(i);
      if (i === 0) continue;

      // Draw in the bottom margin (below the printable area) with
      // lineBreak disabled so pdfkit's LineWrapper never auto-paginates
      // (which previously spawned one blank page per footer).
      this.doc.fontSize(7).fillColor(COLORS.textMuted);
      const footerText = `AEO STARS  |  ${this.options.brandDomain}  |  Page ${i} of ${pageCount - 1}`;
      const footerX = this.leftMargin + (this.pageWidth - this.doc.widthOfString(footerText)) / 2;
      this.doc.text(footerText, footerX, this.doc.page.height - 40, { lineBreak: false });
    }
  }
}
