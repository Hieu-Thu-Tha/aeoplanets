import assert from "node:assert/strict";
import test from "node:test";

import {
  getPageGuideMockData,
  WELCOME_GUIDE_VIDEO_URL,
} from "../../../client/src/lib/page-guide-mock-data";

const publishedVideoIds: Record<string, string> = {
  Dashboard: "Ct-9UjOPWHk",
  "Visibility Report": "KJ0okIikLoA",
  "Perception Mirror": "LZIfdSuzBY8",
  "Coverage Analysis": "mDpaymcqQCo",
  "Competitor Map": "5tHUgyv2pPQ",
  "Technical Brand Audit": "K46BXBLDFcU",
  "Core Web Vitals": "iRQCo_6Y2Sg",
  "My Actions": "ZOJ9Z4rgU8A",
  Alerts: "3b5gaQzIjCA",
  Reports: "ZdQqYstZF9s",
  "Resource Library": "kUn7Wlb_w6M",
  "Brand Settings": "HIzsswxaudU",
  "Team Management": "T76j-hQwmQE",
  "Billing & Plans": "-qfEJNusz1Y",
};

test("uses the published YouTube embeds for completed feature videos", () => {
  for (const [feature, videoId] of Object.entries(publishedVideoIds)) {
    assert.equal(
      getPageGuideMockData(feature)?.videoEmbedUrl,
      `https://www.youtube-nocookie.com/embed/${videoId}`,
    );
  }
});

test("shares the published welcome video across both welcome surfaces", () => {
  assert.equal(
    WELCOME_GUIDE_VIDEO_URL,
    "https://www.youtube-nocookie.com/embed/mcyymJi30-o",
  );
  assert.equal(
    getPageGuideMockData("Welcome Video")?.videoEmbedUrl,
    WELCOME_GUIDE_VIDEO_URL,
  );
});
