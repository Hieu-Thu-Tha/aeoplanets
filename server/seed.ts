import { storage } from "./storage";

const SYSTEM_USER_ID = "system-user-aeostars";

export async function ensureSystemUser(): Promise<string> {
  try {
    const existingUser = await storage.getUser(SYSTEM_USER_ID);
    if (existingUser) {
      return SYSTEM_USER_ID;
    }

    const userByEmail = await storage.getUserByEmail("system@aeostars.com");
    if (userByEmail) {
      return userByEmail.id;
    }

    const systemUser = await storage.upsertUser({
      id: SYSTEM_USER_ID,
      email: "system@aeostars.com",
      firstName: "AEOSTARS",
      lastName: "Editorial",
      authProvider: "email",
      role: "admin",
      isActive: true,
      emailVerified: true,
    });

    console.log("System user created for news articles");
    return systemUser.id;
  } catch (error) {
    console.error("Error creating system user:", error);
    throw error;
  }
}

export async function seedCustomerReviews() {
  try {
    const existingReviews = await storage.getApprovedCustomerReviews();

    if (existingReviews.length > 0) {
      console.log("Customer reviews already seeded");
      return;
    }

    const defaultReviews = [
      {
        name: "Sarah Chen",
        company: "TechCorp Solutions",
        position: "",
        rating: 5,
        testimonial: "Finally, a platform that understands AEO! I can't wait for the January launch. The preview demo showed exactly what I need to track my brand visibility across AI engines. Already registered the whole team!",
        isApproved: true,
        isFeatured: false,
      },
      {
        name: "Marcus Rodriguez",
        company: "Digital Growth Agency",
        position: "",
        rating: 5,
        testimonial: "Been following AEOSTARS since they announced. This is going to be a game-changer for digital marketing. The concept of tracking AI citations is exactly what's been missing. Can't wait for January 2026!",
        isApproved: true,
        isFeatured: false,
      },
      {
        name: "Emily Thompson",
        company: "CloudScale Inc",
        position: "",
        rating: 5,
        testimonial: "Just signed up for the early access list. The roadmap they've shared is incredible - multi-LLM monitoring, competitive analysis, AI recommendations. This is the future of SEO and I'm getting in early!",
        isApproved: true,
        isFeatured: false,
      },
      {
        name: "David Park",
        company: "InnovateSaaS",
        position: "",
        rating: 5,
        testimonial: "The pre-launch demo blew my mind. Seeing how AEOSTARS will track brand mentions across ChatGPT, Claude, and Gemini is exactly what we need. January can't come soon enough!",
        isApproved: true,
        isFeatured: false,
      },
      {
        name: "Lisa Martinez",
        company: "ContentFirst Media",
        position: "",
        rating: 5,
        testimonial: "As an early adopter, I'm thrilled to be on the pre-release list. The AEOSTARS team really understands where search is heading. Looking forward to the exclusive early bird pricing!",
        isApproved: true,
        isFeatured: false,
      },
      {
        name: "James Wilson",
        company: "StartupX",
        position: "",
        rating: 5,
        testimonial: "Registered our whole marketing team for early access. The visibility scoring concept they've previewed is revolutionary. This will change how we approach content optimization. Excited for launch!",
        isApproved: true,
        isFeatured: false,
      },
    ];

    for (const review of defaultReviews) {
      await storage.createCustomerReview(review);
    }

    console.log("Customer reviews seeded successfully");
  } catch (error) {
    console.error("Error seeding customer reviews:", error);
  }
}

export async function seedNewsArticles(systemUserId: string) {
  try {
    const existingArticles = await storage.getAllNewsArticles(true);

    if (existingArticles.length > 0) {
      console.log("News articles already seeded");
      return;
    }

    const defaultArticles = [
      {
        title: "AEO is the new SEO",
        slug: "aeo-is-the-new-seo",
        content: `The landscape of search is transforming before our eyes. While businesses have spent years mastering Search Engine Optimization (SEO) to rank on Google, a seismic shift is underway: Answer Engine Optimization (AEO) is the new SEO.

The Rise of Zero-Click Search

Traditional search engines showed you 10 blue links. You clicked, browsed, and found your answer. But Large Language Models (LLMs) like ChatGPT, Claude, and Gemini have changed everything. Today, over 60% of searches end without a click-the AI simply gives the answer directly.

This is the zero-click revolution, and it's fundamentally reshaping how brands must think about visibility.

SEO vs AEO: Understanding the Fundamental Shift

SEO focuses on rankings-getting your page to position #1 on Google's results page. AEO focuses on citations-getting your content directly referenced and quoted by AI models when they answer questions.

The fundamental difference: SEO gets you visibility in a list. AEO gets you authority in an answer.

The AEO Optimization Playbook

1. Structured Data is Your Best Friend - Implement Schema.org markup
2. Make Your Content Extractable - Direct answers, clear headings, bullet points
3. Optimize for Question-Answer Format
4. Build Topical Authority

Measuring AEO Success

Traditional SEO tracks keyword rankings. AEO requires different metrics:
- Citation Share of Voice
- Prompt Visibility Score
- Engine Coverage

The future of search has arrived. The question is: Will your brand be part of the answer?`,
        metaDescription: "Learn why AEO is replacing SEO. Discover how AI models are changing search and get practical strategies to dominate zero-click results.",
        keywords: ["AEO indexing", "AEO improvements", "AEO optimisation", "AEO listings", "answer engine optimization", "zero-click search", "AI search optimization"],
        questionsAnswered: [
          { question: "What is the difference between SEO and AEO?", answer: "SEO focuses on rankings—getting your page to position #1 on Google. AEO focuses on citations—getting your content directly referenced by AI models. SEO gets you visibility in a list, AEO gets you authority in an answer." },
          { question: "Why is AEO becoming more important than traditional SEO?", answer: "Over 60% of searches now end without a click because AI models like ChatGPT, Claude, and Gemini provide direct answers. This zero-click revolution means brands must optimize to be cited by AI, not just ranked by search engines." },
          { question: "How do I optimize my content for AEO?", answer: "Focus on structured data (Schema.org markup), extractable content (bullet points, tables, clear headings), direct answers in the first 50 words, question-answer format, and building topical authority across related subjects." }
        ],
        keyTakeaways: [
          "AEO focuses on AI citations while SEO focuses on search rankings",
          "Over 60% of searches are now zero-click, making AEO critical for visibility",
          "PageRank still matters as the gatekeeper, but AEO determines if AI uses your content",
          "Structured data, extractable content, and clear question-answer format are key to AEO success",
          "AEO results appear faster than SEO because AI uses live search (RAG) rather than cached rankings"
        ],
        authorId: systemUserId,
        isPublished: true,
        publishedAt: new Date("2025-11-11T07:56:34.792Z"),
      },
    ];

    for (const article of defaultArticles) {
      await storage.createNewsArticle(article);
    }

    console.log("News articles seeded successfully");
  } catch (error) {
    console.error("Error seeding news articles:", error);
  }
}

export async function seedAllData() {
  const systemUserId = await ensureSystemUser();
  await seedCustomerReviews();
  await seedNewsArticles(systemUserId);
}
