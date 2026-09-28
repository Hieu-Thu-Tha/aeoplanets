import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Calendar, Clock, ArrowLeft, ArrowRight, ChevronRight, Share2, Lightbulb, HelpCircle } from "lucide-react";
import { SiLinkedin } from "react-icons/si";
import type { NewsArticle } from "@shared/schema";
import { format } from "date-fns";
import { usePageMeta } from "@/hooks/usePageMeta";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import bobbleBannerBg from "@assets/bobble-homepage-banner_1776335377884.webp";
import { PageHeading } from "@/components/ui/enterprise";

interface FAQItem {
  question: string;
  answer: string;
}

export default function NewsArticlePage() {
  const { slug } = useParams();

  const { data: article, isLoading } = useQuery<NewsArticle>({
    queryKey: ["/api/news", slug],
    enabled: !!slug,
    staleTime: 60000,
  });

  const { data: relatedArticles = [] } = useQuery<NewsArticle[]>({
    queryKey: ["/api/news"],
    staleTime: 60000,
  });

  const estimateReadTime = (content: string): number => {
    const wordCount = content.split(/\s+/).length;
    return Math.ceil(wordCount / 200);
  };

  usePageMeta({
    title: article ? `${article.title} - AEOSTARS` : "Loading Article - AEOSTARS",
    description: article?.metaDescription || "Expert insights on Answer Engine Optimization and AI search visibility",
    keywords: article?.keywords?.join(", ") || "AEO, answer engine optimization",
    ogType: "article",
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#D6EEF8]">
        <Loader2 className="h-8 w-8 animate-spin text-[#00B8D4]" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-[#D6EEF8] text-[#0a2a3a]">
        <SiteHeader />
        <div className="container mx-auto px-4 py-20 text-center">
          <PageHeading title="Article Not Found" headingClassName="text-4xl font-bold mb-4 text-[#0a2a3a]" />
          <p className="text-[#1a3a4a]/60 mb-8">The article you're looking for doesn't exist.</p>
          <Button asChild className="bg-[#00B8D4] border-[#00B8D4] text-white">
            <Link href="/news">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to News
            </Link>
          </Button>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const related = relatedArticles
    .filter((a) => a.id !== article.id && a.isPublished)
    .slice(0, 3);

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.title,
    "description": article.metaDescription,
    "datePublished": article.publishedAt || article.createdAt,
    "author": {
      "@type": "Organization",
      "name": "AEOSTARS",
    },
    "publisher": {
      "@type": "Organization",
      "name": "AEOSTARS",
    },
    "keywords": article.keywords?.join(", ") || "",
  };

  const faqs = (article.questionsAnswered || []) as FAQItem[];
  
  const faqSchema = faqs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((qa) => ({
      "@type": "Question",
      "name": qa.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": qa.answer,
      },
    })),
  } : null;

  return (
    <div className="relative min-h-screen bg-[#D6EEF8] text-[#0a2a3a]">
      <div className="absolute inset-0">
        <img src={bobbleBannerBg} alt="" className="w-full h-full object-cover" aria-hidden="true" />
      </div>
      <div className="relative">
      <SiteHeader />

      <div className="border-b border-[#b8ddef]/30 bg-white">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center gap-2 text-sm text-[#1a3a4a]/60" data-testid="breadcrumbs">
            <Link href="/" className="hover:text-[#0a2a3a]">Home</Link>
            <ChevronRight className="h-4 w-4" />
            <Link href="/news" className="hover:text-[#0a2a3a]">News</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-[#0a2a3a]">{article.title}</span>
          </nav>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="grid lg:grid-cols-[1fr_300px] gap-12">
          <article className="space-y-8">
            <header className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                {article.keywords?.slice(0, 3).map((keyword, idx) => (
                  <Badge key={idx} variant="outline" className="border-[#00B8D4]/20 text-[#00B8D4]">
                    {keyword}
                  </Badge>
                ))}
              </div>
              <PageHeading
                title={article.title}
                headingClassName="text-4xl md:text-5xl font-bold tracking-tight text-[#0a2a3a]"
                headingTestId="text-article-title"
              />
              <p className="text-xl text-[#1a3a4a]/70">{article.metaDescription}</p>
              <div className="flex items-center gap-4 text-sm text-[#1a3a4a]/50">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {article.publishedAt ? format(new Date(article.publishedAt), "MMMM d, yyyy") : "Draft"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>{estimateReadTime(article.content)} min read</span>
                </div>
              </div>
              <Separator className="bg-[#b8ddef]/30" />
            </header>

            {article.keyTakeaways && article.keyTakeaways.length > 0 && (
              <div className="bg-[#00B8D4]/5 border border-[#00B8D4]/15 rounded-xl p-6" data-testid="card-takeaways">
                <h3 className="flex items-center gap-2 text-lg font-bold text-[#0a2a3a] mb-4">
                  <Lightbulb className="h-5 w-5 text-[#00B8D4]" />
                  Key Takeaways
                </h3>
                <ul className="space-y-2">
                  {article.keyTakeaways.map((takeaway, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span className="text-[#00B8D4] font-semibold">{idx + 1}.</span>
                      <span className="text-[#1a3a4a]/80">{takeaway}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="prose prose-lg max-w-none whitespace-pre-wrap text-[#1a3a4a]/80" data-testid="article-content">
              {article.content}
            </div>

            <div className="flex items-center gap-4 pt-8 border-t border-[#b8ddef]/30">
              <span className="text-sm font-medium text-[#0a2a3a]">Share this article:</span>
              <Button variant="outline" size="sm" data-testid="button-share-twitter" className="border-[#0a2a3a]/20 text-[#0a2a3a]">
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div>

            {related.length > 0 && (
              <div className="space-y-4 pt-8">
                <h3 className="text-2xl font-bold text-[#0a2a3a]">Related Articles</h3>
                <div className="grid gap-4">
                  {related.map((relatedArticle) => (
                    <Link key={relatedArticle.id} href={`/news/${relatedArticle.slug}`}>
                      <div className="marketing-card rounded-xl hover-elevate active-elevate-2 cursor-pointer p-6" data-testid={`card-related-${relatedArticle.id}`}>
                        <h4 className="text-lg font-bold text-[#0a2a3a] mb-1">{relatedArticle.title}</h4>
                        <p className="text-sm text-[#1a3a4a]/60 line-clamp-2">
                          {relatedArticle.metaDescription}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </article>

          <aside className="space-y-6">
            <div className="sticky top-20 space-y-6">
              <div className="marketing-card rounded-xl p-6" data-testid="card-cta-sidebar">
                <h3 className="text-xl font-bold text-[#0a2a3a] mb-3">Monitor Your Brand's AI Visibility</h3>
                <p className="text-sm text-[#1a3a4a]/60 mb-4">
                  See how ChatGPT, Claude, and Gemini represent your brand — and close the gaps your competitors are exploiting.
                </p>
                <Button size="lg" className="w-full bg-[#00B8D4] border-[#00B8D4] text-white" asChild data-testid="button-cta-signup-sidebar">
                  <a href="/api/auth/linkedin">
                    <SiLinkedin className="mr-2 h-4 w-4" />
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>

              {faqs.length > 0 && (
                <div className="marketing-card rounded-xl p-6" data-testid="faq-section">
                  <h3 className="text-lg font-bold text-[#0a2a3a] flex items-center gap-2 mb-4">
                    <HelpCircle className="h-5 w-5 text-[#00B8D4]" />
                    Frequently Asked Questions
                  </h3>
                  <Accordion type="single" collapsible className="w-full">
                    {faqs.map((qa, idx) => (
                      <AccordionItem key={idx} value={`faq-${idx}`} className="border-[#b8ddef]/20" data-testid={`accordion-faq-${idx}`}>
                        <AccordionTrigger className="text-left text-sm font-medium text-[#0a2a3a] hover:text-[#00B8D4] hover:no-underline">
                          {qa.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-[#1a3a4a]/60">
                          {qa.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      <SiteFooter />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      {faqSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      )}
      </div>
    </div>
  );
}
