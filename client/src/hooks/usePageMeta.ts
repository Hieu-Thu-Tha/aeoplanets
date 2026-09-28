import { useEffect } from "react";

interface PageMetaProps {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: "website" | "article";
  keywords?: string;
}

export function usePageMeta({
  title,
  description,
  ogTitle,
  ogDescription,
  ogImage,
  ogType = "website",
  keywords,
}: PageMetaProps) {
  useEffect(() => {
    document.title = title;

    const setMeta = (name: string, content: string) => {
      let element = document.querySelector(`meta[name="${name}"]`);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute("name", name);
        document.head.appendChild(element);
      }
      element.setAttribute("content", content);
    };

    const setOgMeta = (property: string, content: string) => {
      let element = document.querySelector(`meta[property="${property}"]`);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute("property", property);
        document.head.appendChild(element);
      }
      element.setAttribute("content", content);
    };

    const setLinkTag = (rel: string, href: string) => {
      let element = document.querySelector(`link[rel="${rel}"]`);
      if (!element) {
        element = document.createElement("link");
        element.setAttribute("rel", rel);
        document.head.appendChild(element);
      }
      element.setAttribute("href", href);
    };

    // Set canonical URL - use aeostars.com in production, current host otherwise
    const canonicalPath = window.location.pathname + window.location.search;
    const currentHost = window.location.host;
    const canonicalHost = (currentHost.includes('.replit.app') || currentHost.includes('.replit.dev')) 
      ? 'aeostars.com' 
      : currentHost;
    setLinkTag("canonical", `https://${canonicalHost}${canonicalPath}`);

    setMeta("description", description);

    if (keywords) {
      setMeta("keywords", keywords);
    } else {
      const keywordsEl = document.querySelector('meta[name="keywords"]');
      if (keywordsEl) keywordsEl.remove();
    }

    setOgMeta("og:title", ogTitle || title);
    setOgMeta("og:description", ogDescription || description);
    setOgMeta("og:type", ogType);

    if (ogImage) {
      setOgMeta("og:image", ogImage);
    } else {
      const ogImageEl = document.querySelector('meta[property="og:image"]');
      if (ogImageEl) ogImageEl.remove();
    }

    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", ogTitle || title);
    setMeta("twitter:description", ogDescription || description);

    if (ogImage) {
      setMeta("twitter:image", ogImage);
    } else {
      const twitterImageEl = document.querySelector('meta[name="twitter:image"]');
      if (twitterImageEl) twitterImageEl.remove();
    }
  }, [title, description, ogTitle, ogDescription, ogImage, ogType, keywords]);
}
