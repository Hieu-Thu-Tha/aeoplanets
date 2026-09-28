import Perplexity from "@perplexity-ai/perplexity_ai";
import { executeAiCall } from "./services/ai-usage";
import { usageFromPerplexity } from "./services/llm-provider/perplexity/usage";
import { PERPLEXITY_SEARCH_WEB_METER } from "@shared/ai-billing";
import { perplexityOutputText } from "./services/llm-provider/perplexity/output";

interface GeneratedArticle {
  title: string;
  slug: string;
  content: string;
  metaDescription: string;
  keywords: string[];
  questionsAnswered: Array<{ question: string; answer: string }>;
  keyTakeaways: string[];
}

export class NewsGenerator {
  private _perplexity: Perplexity | null = null;

  private get perplexity(): Perplexity {
    if (!this._perplexity) {
      if (!process.env.PERPLEXITY_API_KEY) {
        throw new Error(
          "Missing PERPLEXITY_API_KEY environment variable. Please set it to use the news generator."
        );
      }
      this._perplexity = new Perplexity({
        apiKey: process.env.PERPLEXITY_API_KEY,
        // Measured news generation reaches ~113s (docs/08); 180s leaves real
        // margin for provider variance and longer valid articles.
        timeout: 180_000,
      });
    }
    return this._perplexity;
  }

  /**
   * Generate a complete SEO-optimized news article using GPT-4o
   * @param prompt Admin's topic/instruction for the article
   * @param targetKeywords Specific keywords to focus on (AEO indexing, improvements, optimisation, listings)
   */
  async generateArticle(
    prompt: string,
    targetKeywords: string[] = ["AEO indexing", "AEO improvements", "AEO optimisation", "AEO listings"],
    adminUserId?: string
  ): Promise<GeneratedArticle> {
    const systemPrompt = `You are an expert SEO content writer specializing in Answer Engine Optimization (AEO). Your task is to generate a comprehensive, SEO-optimized news article that will rank well across search engines and AI platforms like ChatGPT, Claude, and Gemini.

The article must be:
- 1,500-2,500 words in length
- Written in a professional, informative style
- Optimized for the target keywords: ${targetKeywords.join(", ")}
- Structured for maximum extractability by AI models
- Factual and valuable to readers

Generate the content in the following JSON format:
{
  "title": "SEO-optimized title (60-70 characters, include primary keyword)",
  "slug": "url-friendly-slug",
  "content": "Full article body in markdown format with proper headings (## H2, ### H3), bullet points, and clear sections. Use the target keywords naturally throughout.",
  "metaDescription": "Compelling meta description (155-160 characters) that includes primary keyword and encourages clicks",
  "keywords": ["array", "of", "5-8", "relevant", "keywords"],
  "questionsAnswered": [
    {
      "question": "What is...",
      "answer": "Comprehensive answer (100-200 words) that directly addresses the question with clear, extractable information"
    }
    // Include exactly 3 questions
  ],
  "keyTakeaways": [
    "Clear, actionable takeaway point 1",
    "Clear, actionable takeaway point 2",
    "Clear, actionable takeaway point 3",
    "Clear, actionable takeaway point 4",
    "Clear, actionable takeaway point 5"
  ]
}

Important guidelines:
1. The content should include practical examples and data when possible
2. Use clear headings phrased as questions where appropriate
3. Include tables or bullet points for better extractability
4. The questions should be the most important FAQs readers would ask
5. Key takeaways should be specific and actionable
6. Naturally incorporate the target keywords throughout the article
7. Write in a way that AI models can easily extract and cite specific facts`;

    const userPrompt = `Generate a comprehensive news article about: ${prompt}

Target keywords to focus on: ${targetKeywords.join(", ")}

Remember to:
- Make the article 1,500-2,500 words
- Include exactly 3 questions with comprehensive answers
- Include exactly 5 key takeaways
- Use the target keywords naturally throughout
- Structure content for AI extractability
- Return ONLY the JSON object, no additional text`;

    try {
      const response = await executeAiCall(
        adminUserId
          ? { userId: adminUserId, brandId: null, feature: "news", source: "system" }
          : undefined,
        "perplexity",
        "perplexity/sonar",
        () => this.perplexity.responses.create({
          preset: "low",
          model: "perplexity/sonar",
          instructions: systemPrompt,
          input: userPrompt,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "generated_article",
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  slug: { type: "string" },
                  content: { type: "string" },
                  metaDescription: { type: "string" },
                  keywords: { type: "array", items: { type: "string" } },
                  questionsAnswered: {
                    type: "array",
                    minItems: 3,
                    maxItems: 3,
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string" },
                        answer: { type: "string" },
                      },
                      required: ["question", "answer"],
                    },
                  },
                  keyTakeaways: { type: "array", minItems: 5, maxItems: 5, items: { type: "string" } },
                },
                required: ["title", "content", "metaDescription"],
              },
            },
          },
        }),
        usageFromPerplexity,
        { expectedMeters: [PERPLEXITY_SEARCH_WEB_METER] },
      );

      // Sonar may wrap the JSON in a markdown code fence.
      const responseContent = perplexityOutputText(response)
        .replace(/^```(?:json)?\s*/, "")
        .replace(/```\s*$/, "")
        .trim();
      if (!responseContent) {
        throw new Error("No response from Perplexity");
      }

      const article = JSON.parse(responseContent) as GeneratedArticle;

      // Validate the response has all required fields
      if (!article.title || !article.content || !article.metaDescription) {
        throw new Error("Generated article missing required fields");
      }

      // Ensure slug is URL-friendly
      if (!article.slug) {
        article.slug = this.generateSlug(article.title);
      }

      // Validate keywords array
      if (!Array.isArray(article.keywords)) {
        article.keywords = targetKeywords;
      }

      // Validate questions array
      if (!Array.isArray(article.questionsAnswered) || article.questionsAnswered.length !== 3) {
        console.warn("Generated article has invalid questionsAnswered array");
        article.questionsAnswered = [];
      }

      // Validate takeaways array - enforce exactly 5 items
      if (!Array.isArray(article.keyTakeaways) || article.keyTakeaways.length !== 5) {
        console.warn("Generated article has invalid keyTakeaways array - expected exactly 5");
        article.keyTakeaways = [];
      }

      return article;
    } catch (error) {
      console.error("Error generating article with Perplexity:", error);
      throw new Error(`Failed to generate article: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Generate a URL-friendly slug from a title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 100);
  }

  /**
   * Estimate word count from markdown content
   */
  estimateWordCount(content: string): number {
    // Remove markdown syntax and count words
    const plainText = content
      .replace(/#{1,6}\s/g, "") // Remove heading markers
      .replace(/\*\*([^*]+)\*\*/g, "$1") // Remove bold
      .replace(/\*([^*]+)\*/g, "$1") // Remove italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links
      .replace(/`([^`]+)`/g, "$1"); // Remove code blocks

    return plainText.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Calculate estimated read time (200 words per minute)
   */
  calculateReadTime(content: string): number {
    const wordCount = this.estimateWordCount(content);
    return Math.ceil(wordCount / 200);
  }
}

export const newsGenerator = new NewsGenerator();
