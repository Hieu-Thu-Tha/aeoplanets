import type { Express } from "express";
import { storage } from "./storage";

const BASE_URL = "https://aeostars.com";

interface SitemapUrl {
  loc: string;
  lastmod: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: number;
}

function formatDateW3C(date: Date): string {
  return date.toISOString().split('.')[0] + '+00:00';
}

function generateSitemapXml(urls: SitemapUrl[]): string {
  const urlEntries = urls.map(url => `
  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority.toFixed(1)}</priority>
  </url>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

export function registerSeoRoutes(app: Express): void {
  
  app.get('/robots.txt', (_req, res) => {
    const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;
    res.type('text/plain').send(robotsTxt);
  });

  app.get('/sitemap.xml', async (_req, res) => {
    try {
      const now = new Date();
      const urls: SitemapUrl[] = [];

      urls.push({
        loc: BASE_URL,
        lastmod: formatDateW3C(now),
        changefreq: "weekly",
        priority: 1.0
      });

      urls.push({
        loc: `${BASE_URL}/pricing`,
        lastmod: formatDateW3C(now),
        changefreq: "weekly",
        priority: 0.8
      });

      urls.push({
        loc: `${BASE_URL}/news`,
        lastmod: formatDateW3C(now),
        changefreq: "daily",
        priority: 0.8
      });

      urls.push({
        loc: `${BASE_URL}/signup`,
        lastmod: formatDateW3C(now),
        changefreq: "monthly",
        priority: 0.7
      });

      urls.push({
        loc: `${BASE_URL}/privacy`,
        lastmod: formatDateW3C(now),
        changefreq: "yearly",
        priority: 0.3
      });

      const articles = await storage.getAllNewsArticles(true);
      
      for (const article of articles) {
        const articleDate = article.publishedAt || article.createdAt || now;
        urls.push({
          loc: `${BASE_URL}/news/${article.slug}`,
          lastmod: formatDateW3C(new Date(articleDate)),
          changefreq: "monthly",
          priority: 0.6
        });
      }

      const sitemapXml = generateSitemapXml(urls);
      res.type('application/xml').send(sitemapXml);
      
    } catch (error) {
      console.error("Error generating sitemap:", error);
      res.status(500).send("Error generating sitemap");
    }
  });
}
