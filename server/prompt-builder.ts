import type { Brand } from "@shared/schema";

export interface PromptBatch {
  promptText: string;
  promptType: "awareness" | "consideration" | "commercial";
}

export function getBrandDisplayName(brand: { companyName?: string | null; domain: string }): string {
  if (brand.companyName?.trim()) return brand.companyName.trim();
  return brand.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

export function getDomainName(domain: string): string {
  return domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

export function buildPrompts(brand: Brand): PromptBatch[] {
  const { domain, category, targetAudience, problemStatement, competitors, territory, location, products } = brand;
  const brandName = getBrandDisplayName(brand);
  const domainName = getDomainName(domain);

  const isRegional = territory === "regional" && location?.trim();
  const locationSuffix = isRegional ? ` in ${location!.trim()}` : "";

  if (!category) {
    console.warn(`Brand ${brandName} has no category — prompts will be limited`);
  }

  const prompts: PromptBatch[] = [];

  prompts.push({
    promptText: `Tell me about ${brandName}`,
    promptType: "awareness",
  });
  prompts.push({
    promptText: `What does ${brandName} do and who is it for?`,
    promptType: "awareness",
  });

  if (brandName !== domainName) {
    prompts.push({
      promptText: `Tell me about ${domainName}`,
      promptType: "awareness",
    });
  }

  if (category) {
    prompts.push({
      promptText: `What are the best ${category} tools${targetAudience ? ` for ${targetAudience}` : ""}${locationSuffix}?`,
      promptType: "consideration",
    });
    prompts.push({
      promptText: `Who are the leading ${category} providers${locationSuffix}?`,
      promptType: "consideration",
    });
  }

  const topCompetitor = (competitors && competitors.length > 0)
    ? competitors[0].replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
    : null;

  if (topCompetitor) {
    prompts.push({
      promptText: `What are the best alternatives to ${topCompetitor}${locationSuffix}?`,
      promptType: "commercial",
    });
  }

  if (category) {
    prompts.push({
      promptText: `Which ${category} solution should I choose${targetAudience ? ` for ${targetAudience}` : ""}${locationSuffix}?`,
      promptType: "commercial",
    });
  }

  if (problemStatement) {
    const cleanedProblem = problemStatement.toLowerCase().replace(/^we help /, "").replace(/^helps? /, "");
    prompts.push({
      promptText: `How do I ${cleanedProblem}${locationSuffix}?`,
      promptType: "awareness",
    });
    prompts.push({
      promptText: `What tools help with ${cleanedProblem}${locationSuffix}?`,
      promptType: "consideration",
    });
  } else if (category) {
    prompts.push({
      promptText: `What problems does ${category} solve?`,
      promptType: "awareness",
    });
  }

  if (products?.trim() && category) {
    prompts.push({
      promptText: `What tools offer ${products.trim()}${targetAudience ? ` for ${targetAudience}` : ""}${locationSuffix}?`,
      promptType: "consideration",
    });
  }

  return prompts;
}
