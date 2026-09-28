export interface PageGuideMockData {
  feature: string;
  productionOrder: number;
  prdRef: string;
  shortText: string;
  videoEmbedUrl?: string;
  recordingSourceUrl: string;
  notes: string;
  fullGuideUrl: string;
  guideId: string;
}

export const MOCK_GUIDE_VIDEO_URL =
  "https://www.youtube-nocookie.com/embed/ludmDmwn2AQ";

export const WELCOME_GUIDE_VIDEO_URL =
  "https://www.youtube-nocookie.com/embed/mcyymJi30-o";

export const pageGuideMockData: PageGuideMockData[] = [
  {
    feature: "Dashboard",
    productionOrder: 1,
    prdRef: "C2",
    shortText:
      "Your Dashboard shows your AI Share of Voice, Commercial Score, and Category Authority at a glance — plus how you and competitors show up across the buyer funnel.",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/Ct-9UjOPWHk",
    recordingSourceUrl:
      "https://drive.google.com/file/d/1JAmh4eKVF_A8kkDwmysN4HJTTLQfGFCq/view?usp=drive_link",
    notes: "",
    fullGuideUrl: "/user-guide#dashboard",
    guideId: "dashboard",
  },
  {
    feature: "Visibility Report",
    productionOrder: 2,
    prdRef: "C3",
    shortText:
      "See exactly which search terms show your brand — and which don't — split by branded vs. non-branded queries, with sentiment for every result.",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/KJ0okIikLoA",
    recordingSourceUrl:
      "https://drive.google.com/file/d/1SMXaVxlJC9UBsTJqWVzRyiIwzlyo9s5V/view?usp=drive_link",
    notes: "",
    fullGuideUrl: "/user-guide#visibility-report",
    guideId: "visibility-report",
  },
  {
    feature: "Perception Mirror",
    productionOrder: 3,
    prdRef: "C4",
    shortText:
      "See how AI actually perceives your brand — positioning, strengths, weaknesses, and the top 5 changes that would improve how AI describes you.",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/LZIfdSuzBY8",
    recordingSourceUrl:
      "https://drive.google.com/file/d/1ZUgq1ZaRJxpl7x7uhxIno4oEQrsAfh2C/view?usp=drive_link",
    notes: "",
    fullGuideUrl: "/user-guide#perception-mirror",
    guideId: "perception-mirror",
  },
  {
    feature: "Coverage Analysis",
    productionOrder: 4,
    prdRef: "C5",
    shortText:
      "See which topics you own, which are weak or competitor-owned — and exactly what content to create next to close each gap.",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/mDpaymcqQCo",
    recordingSourceUrl:
      "https://drive.google.com/file/d/1jR0xqEJh-qyQD5sh63eEDJ_i1J1Mx90S/view?usp=drive_link",
    notes: "Growth+ only - capture on a Growth+ or higher test account",
    fullGuideUrl: "/user-guide#coverage-analysis",
    guideId: "coverage-analysis",
  },
  {
    feature: "Competitor Map",
    productionOrder: 5,
    prdRef: "C6",
    shortText:
      "See exactly which prompts competitors win that you don't, which AI models favor them, and their researched weaknesses.",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/5tHUgyv2pPQ",
    recordingSourceUrl:
      "https://drive.google.com/file/d/1ENbr4nwTAtOY_U6ynlW5ikuCE-UHrHr1/view?usp=drive_link",
    notes: "Growth+ only - capture on a Growth+ or higher test account",
    fullGuideUrl: "/user-guide#competitor-map",
    guideId: "competitor-map",
  },
  {
    feature: "Technical Brand Audit",
    productionOrder: 6,
    prdRef: "C7",
    shortText:
      "Get an AI-powered audit of your site's technical AI-readiness, with a score and a specific fix for every failing check.",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/K46BXBLDFcU",
    recordingSourceUrl:
      "https://drive.google.com/file/d/18DCEEud3en_84w--RcvsbVasvuGQdm_L/view?usp=drive_link",
    notes: "",
    fullGuideUrl: "/user-guide#technical-brand-audit",
    guideId: "technical-brand-audit",
  },
  {
    feature: "Core Web Vitals",
    productionOrder: 7,
    prdRef: "C8",
    shortText:
      "Compare your site's performance, accessibility, and SEO scores against competitors on both mobile and desktop, with an AI breakdown.",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/iRQCo_6Y2Sg",
    recordingSourceUrl:
      "https://drive.google.com/file/d/1hB0sdJU4rscl4ynQ50X7mZHJd01Rxh1N/view?usp=drive_link",
    notes: "",
    fullGuideUrl: "/user-guide#core-web-vitals",
    guideId: "core-web-vitals",
  },
  {
    feature: "My Actions",
    productionOrder: 8,
    prdRef: "C9",
    shortText:
      "My Actions turns your latest scan into a prioritized to-do list — click Generate All Tickets for AI-built tasks, or add your own.",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/ZOJ9Z4rgU8A",
    recordingSourceUrl:
      "https://drive.google.com/file/d/1ws8TccGI8RBGTaTvpJQdZSxwGBt9quzy/view?usp=drive_link",
    notes: "",
    fullGuideUrl: "/user-guide#my-actions",
    guideId: "my-actions",
  },
  {
    feature: "Alerts",
    productionOrder: 9,
    prdRef: "C10",
    shortText:
      "Get notified whenever your AI sentiment shifts or a new competitor appears in your tracked questions.",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/3b5gaQzIjCA",
    recordingSourceUrl:
      "https://drive.google.com/file/d/1FWuN9_EOFlDlwU9kEm-ruhyJWWy5daag/view?usp=drive_link",
    notes: "",
    fullGuideUrl: "/user-guide#alerts",
    guideId: "alerts",
  },
  {
    feature: "Reports",
    productionOrder: 10,
    prdRef: "C11",
    shortText:
      "Generate AI-powered PDF reports — an executive snapshot, a DIY action guide, or competitive intelligence — in under a minute.",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/ZdQqYstZF9s",
    recordingSourceUrl:
      "https://drive.google.com/file/d/11PMOyLXwx0yzblZxVjzIvb4Ll9ZILYNA/view?usp=drive_link",
    notes: "",
    fullGuideUrl: "/user-guide#reports",
    guideId: "reports",
  },
  {
    feature: "Resource Library",
    productionOrder: 11,
    prdRef: "C12",
    shortText:
      "Step-by-step guides to structured data, SEO essentials, and AI crawler files — everything you need to improve how AI reads your site.",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/kUn7Wlb_w6M",
    recordingSourceUrl:
      "https://drive.google.com/file/d/1Y8Of4gCdJ1d2BQYOLJUBNnTJ8OkLTZV-/view?usp=drive_link",
    notes: "",
    fullGuideUrl: "/user-guide#resource-library",
    guideId: "resource-library",
  },
  {
    feature: "Brand Settings",
    productionOrder: 12,
    prdRef: "New (C20)",
    shortText:
      "Manage your brand profile, competitors, and tracked search terms — the core inputs that power every AI scan on your account.",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/HIzsswxaudU",
    recordingSourceUrl:
      "https://drive.google.com/file/d/1sZZFPcvVsnKqjUWuH581bpdb1Qc5_6bN/view?usp=drive_link",
    notes: "",
    fullGuideUrl: "/user-guide#brand-settings",
    guideId: "brand-settings",
  },
  {
    feature: "Team Management",
    productionOrder: 13,
    prdRef: "C14",
    shortText:
      "Invite teammates and control exactly what they can do — from adding brands to managing tickets — with granular permissions.",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/T76j-hQwmQE",
    recordingSourceUrl:
      "https://drive.google.com/file/d/1RxYD3QcqrZi2WL6GqhL3-k7tYYFp1jpt/view?usp=drive_link",
    notes: "",
    fullGuideUrl: "/user-guide#team",
    guideId: "team",
  },
  {
    feature: "Billing & Plans",
    productionOrder: 14,
    prdRef: "C13",
    shortText:
      "See your current plan and usage at a glance — and manage or upgrade your plan here, if you're on self-serve billing.",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/-qfEJNusz1Y",
    recordingSourceUrl:
      "https://drive.google.com/file/d/1LqcZlAW8xVql6YjNCfA2XJGzULy6TjjU/view?usp=drive_link",
    notes: "",
    fullGuideUrl: "/user-guide#billing",
    guideId: "billing",
  },
  {
    feature: "Welcome Video",
    productionOrder: 15,
    prdRef: "C19",
    shortText:
      "Get a quick introduction to the main AEOSTARS workflow and learn where to begin.",
    videoEmbedUrl: WELCOME_GUIDE_VIDEO_URL,
    recordingSourceUrl: "",
    notes:
      "Script and storyboard first, followed by the product tour and presenter recording.",
    fullGuideUrl: "/user-guide#welcome-video",
    guideId: "welcome-video",
  },
];

const featureAliases: Record<string, string> = {
  "AI Perception Mirror": "Perception Mirror",
  "Change Monitoring Alerts": "Alerts",
  "Competitor AI Positioning Map": "Competitor Map",
  "Key Term Visibility Report": "Visibility Report",
  "Semantic Coverage Analysis": "Coverage Analysis",
  Billing: "Billing & Plans",
  Team: "Team Management",
};

export function getPageGuideMockData(title: string) {
  const feature = featureAliases[title] ?? title;
  return pageGuideMockData.find((item) => item.feature === feature);
}

export function getPageGuideId(title: string) {
  return getPageGuideMockData(title)?.guideId;
}

export function getUserGuideUrl(title: string) {
  const guideId = getPageGuideId(title);
  return guideId ? `/user-guide#${guideId}` : "/user-guide";
}
