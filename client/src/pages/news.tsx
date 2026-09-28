import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, Calendar, TrendingUp, Newspaper, ArrowRight } from "lucide-react";
import { SiLinkedin } from "react-icons/si";
import type { NewsArticle, CustomerReview } from "@shared/schema";
import { format } from "date-fns";
import { Link } from "wouter";
import { usePageMeta } from "@/hooks/usePageMeta";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ReviewsSection } from "@/components/ReviewsSection";
import blueBgPattern from "@assets/blue-background_1776335377885.webp";
import { PageHeading } from "@/components/ui/enterprise";

export default function NewsPage() {
  usePageMeta({
    title: "AEO News & Insights | Answer Engine Optimization Updates - AEOSTARS",
    description: "Stay updated with the latest AEO indexing strategies, improvements, and optimisation techniques. Expert insights on mastering AEO listings and AI search visibility.",
    keywords: "AEO news, AEO indexing, AEO improvements, AEO optimisation, AEO listings, answer engine optimization updates",
  });

  const [filter, setFilter] = useState<"latest" | "trending">("latest");

  const { data: articles = [], isLoading } = useQuery<NewsArticle[]>({
    queryKey: ["/api/news"],
    staleTime: 60000,
  });

  const { data: reviews = [] } = useQuery<CustomerReview[]>({
    queryKey: ["/api/reviews/approved"],
    staleTime: 60000,
  });

  const sortedArticles = [...articles].sort((a, b) => {
    if (filter === "latest") {
      const dateA = new Date(a.publishedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.publishedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    } else if (filter === "trending") {
      const questionsA = Array.isArray(a.questionsAnswered) ? a.questionsAnswered : [];
      const questionsB = Array.isArray(b.questionsAnswered) ? b.questionsAnswered : [];
      const scoreA = (a.keywords?.length || 0) * 10 + questionsA.length * 5;
      const scoreB = (b.keywords?.length || 0) * 10 + questionsB.length * 5;
      return scoreB - scoreA;
    }
    return 0;
  });

  const estimateReadTime = (content: string): number => {
    const wordCount = content.split(/\s+/).length;
    return Math.ceil(wordCount / 200);
  };

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": sortedArticles.map((article, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": "Article",
        "name": article.title,
        "url": `${typeof window !== 'undefined' ? window.location.origin : ''}/news/${article.slug}`,
        "datePublished": article.publishedAt,
        "description": article.metaDescription,
        "keywords": article.keywords?.join(", "),
      }
    }))
  };

  return (
    <div className="relative min-h-screen bg-[#D6EEF8] text-[#0a2a3a] overflow-x-hidden">
      <div className="absolute inset-0">
        <img src={blueBgPattern} alt="" className="w-full h-full object-cover" aria-hidden="true" />
      </div>
      <div className="relative">
      <SiteHeader />
      
      <div className="flex flex-col">
        <div className="relative bg-white border-b border-[#b8ddef]/30">
          <div className="container relative mx-auto px-4 py-20">
            <div className="max-w-3xl mx-auto text-center space-y-6">
              <Badge variant="outline" className="text-sm px-4 py-2 border-[#00B8D4]/20 text-[#00B8D4]">
                <Newspaper className="h-3 w-3 mr-2" />
                Latest News & Insights
              </Badge>
              <PageHeading
                title="Master Answer Engine Optimization"
                headingClassName="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[#0a2a3a]"
                headingTestId="text-hero-title"
              />
              <p className="text-xl text-[#1a3a4a]/70 max-w-2xl mx-auto">
                Discover expert strategies for <strong>AEO indexing</strong>, <strong>AEO improvements</strong>, <strong>AEO optimisation</strong>, and <strong>AEO listings</strong> to dominate AI-powered search results.
              </p>
              <div className="flex items-center justify-center gap-4 pt-4">
                <Button size="lg" asChild data-testid="button-cta-signup" className="bg-[#00B8D4] border-[#00B8D4] text-white">
                  <a href="/api/auth/linkedin" className="flex items-center gap-2">
                    <SiLinkedin className="h-4 w-4" />
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild data-testid="button-cta-login" className="border-[#0a2a3a]/20 text-[#0a2a3a]">
                  <a href="/login">Sign In</a>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-4 mb-8">
            <Button
              variant={filter === "latest" ? "default" : "outline"}
              onClick={() => setFilter("latest")}
              data-testid="button-filter-latest"
              className={`gap-2 ${filter === "latest" ? "bg-[#00B8D4] border-[#00B8D4] text-white" : "border-[#0a2a3a]/20 text-[#0a2a3a]"}`}
            >
              <Calendar className="h-4 w-4" />
              Latest
            </Button>
            <Button
              variant={filter === "trending" ? "default" : "outline"}
              onClick={() => setFilter("trending")}
              data-testid="button-filter-trending"
              className={`gap-2 ${filter === "trending" ? "bg-[#00B8D4] border-[#00B8D4] text-white" : "border-[#0a2a3a]/20 text-[#0a2a3a]"}`}
            >
              <TrendingUp className="h-4 w-4" />
              Trending
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#00B8D4]" />
            </div>
          ) : sortedArticles.length === 0 ? (
            <div className="text-center py-20">
              <Newspaper className="h-16 w-16 mx-auto text-[#1a3a4a]/30 mb-4" />
              <h3 className="text-2xl font-semibold mb-2 text-[#0a2a3a]">No articles yet</h3>
              <p className="text-[#1a3a4a]/60">Check back soon for expert insights on AEO!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedArticles.map((article) => (
                <Link key={article.id} href={`/news/${article.slug}`}>
                  <div
                    className="h-full marketing-card rounded-xl hover-elevate active-elevate-2 cursor-pointer overflow-hidden"
                    data-testid={`card-article-${article.id}`}
                  >
                    <div className="h-48 bg-gradient-to-br from-[#D6EEF8] to-[#e8f4fa] flex items-center justify-center border-b border-[#b8ddef]/20">
                      <Newspaper className="h-12 w-12 text-[#00B8D4]/30" />
                    </div>

                    <div className="p-6 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {article.keywords?.slice(0, 2).map((keyword, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs border-[#00B8D4]/20 text-[#00B8D4]">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                      <h3 className="line-clamp-2 text-xl font-bold text-[#0a2a3a]" data-testid={`text-article-title-${article.id}`}>
                        {article.title}
                      </h3>
                      <p className="line-clamp-3 text-sm text-[#1a3a4a]/60">
                        {article.metaDescription}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-[#1a3a4a]/50 pt-3 border-t border-[#b8ddef]/20">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{article.publishedAt ? format(new Date(article.publishedAt), "MMM d, yyyy") : "Draft"}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{estimateReadTime(article.content)} min read</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {sortedArticles.length > 0 && (
            <div className="mt-16 text-center bg-white rounded-xl p-8 border border-[#b8ddef]/30 shadow-sm">
              <h2 className="text-3xl font-bold mb-4 text-[#0a2a3a]">Start Monitoring Your Brand's AI Visibility</h2>
              <p className="text-[#1a3a4a]/60 mb-6 max-w-2xl mx-auto">
                See exactly how your brand appears in ChatGPT, Claude, and Gemini — and where competitors are beating you.
              </p>
              <Button size="lg" asChild data-testid="button-cta-bottom" className="bg-[#00B8D4] border-[#00B8D4] text-white">
                <a href="/api/auth/linkedin" className="flex items-center gap-2">
                  <SiLinkedin className="h-4 w-4" />
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          )}
        </div>

        <ReviewsSection 
          reviews={reviews}
          title="What People Are Saying About Us"
          subtitle="Early Supporters"
        />

        <SiteFooter />

        <script 
          type="application/ld+json" 
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} 
        />
        
        <script 
          type="application/ld+json" 
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://aeostars.com/" },
              { "@type": "ListItem", "position": 2, "name": "News & Insights", "item": "https://aeostars.com/news" }
            ]
          }) }} 
        />
      </div>
      </div>
    </div>
  );
}
