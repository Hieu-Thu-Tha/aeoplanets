import { newsGenerator } from "../server/news-generator";
import { storage } from "../server/storage";

async function createSampleArticle() {
  console.log("Generating sample article: 'AEO is the new SEO'...");
  
  const prompt = `Write a comprehensive 2000-word article titled "AEO is the new SEO" that explains why Answer Engine Optimization is becoming more important than traditional SEO. Cover:

1) How LLMs like ChatGPT, Claude, and Gemini are changing search behavior with zero-click searches
2) The key differences between SEO (optimizing for rankings) vs AEO (optimizing for citations and direct answers)
3) Why traditional SEO metrics like PageRank still matter but are no longer enough
4) Practical AEO optimization strategies including structured data, clear formatting, FAQ schema, and extractable content
5) How to measure AEO success through citation tracking and visibility scores
6) The future of search and why brands must adapt now

Include real statistics and examples. Target keywords: AEO indexing, AEO improvements, AEO optimisation, AEO listings.`;

  try {
    const generated = await newsGenerator.generateArticle(prompt);
    
    const article = await storage.createNewsArticle({
      title: generated.title,
      slug: generated.slug,
      content: generated.content,
      metaDescription: generated.metaDescription,
      keywords: generated.keywords,
      questionsAnswered: generated.questionsAnswered,
      keyTakeaways: generated.keyTakeaways,
      isPublished: true,
      publishedAt: new Date(),
    });
    
    console.log("\n✅ Article created successfully!");
    console.log(`Title: ${article.title}`);
    console.log(`Slug: ${article.slug}`);
    console.log(`Word count: ${generated.content.split(/\s+/).length} words`);
    console.log(`Keywords: ${article.keywords?.join(", ")}`);
    console.log(`Questions answered: ${article.questionsAnswered?.length || 0}`);
    console.log(`Key takeaways: ${article.keyTakeaways?.length || 0}`);
    console.log(`\nArticle published and ready to view!`);
  } catch (error) {
    console.error("Error creating article:", error);
    process.exit(1);
  }
}

createSampleArticle();
