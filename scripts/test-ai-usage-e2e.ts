/**
 * End-to-end check of the AI usage pipeline:
 *  1. loadSystemConfig seeds/loads config; a stale usd_gbp_rate triggers the
 *     passive live re-fetch from frankfurter.app and re-persists.
 *  2. A real Gemini call through callGeminiWithRetry with a usage context
 *     writes a measured ai_usage_logs row (real token counts + cost).
 *
 * Run with: tsx --env-file=.env scripts/test-ai-usage-e2e.ts <userId>
 */
import { GoogleGenAI } from "@google/genai";
import { loadSystemConfig, getUsdToGbpRate, getModelPricing } from "../server/services/system-config";
import { callGeminiWithRetry } from "../server/services/gemini-retry";
import { db, pool } from "../server/db";
import { aiUsageLogs } from "@shared/schema";
import { desc } from "drizzle-orm";

async function main() {
  const userId = process.argv[2];
  if (!userId) throw new Error("pass a userId");

  await loadSystemConfig();

  // 1. FX: entry was backdated 4h (> 3h TTL) — this read should refresh live
  const rate = await getUsdToGbpRate();
  console.log("usd_gbp_rate after stale read:", rate, rate === 0.79 ? "(still fallback — check refresh!)" : "(live-fetched ✓)");

  const pricing = await getModelPricing("gemini", "gemini-2.5-flash");
  console.log("gemini-2.5-flash pricing:", pricing);
  const unknown = await getModelPricing("gemini", "some-unknown-model");
  console.log("unknown model falls back to:", unknown);

  // 2. Real Gemini call with usage context
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await callGeminiWithRetry(client, {
    model: "gemini-2.5-flash",
    contents: "Reply with exactly one word: pineapple.",
    label: "e2e-test",
    usage: { userId, brandId: null, feature: "other" },
  });
  console.log("gemini replied:", response.text?.trim());

  // Fire-and-forget insert needs a beat to land
  await new Promise((r) => setTimeout(r, 3000));

  const rows = await db.select().from(aiUsageLogs).orderBy(desc(aiUsageLogs.id)).limit(3);
  console.log("latest ai_usage_logs rows:");
  for (const row of rows) {
    console.log(
      `  #${row.id} ${row.provider}/${row.model} feature=${row.feature} in=${row.inputTokens} out=${row.outputTokens} think=${row.thinkingTokens} cost=$${(row.costMicroUsd / 1_000_000).toFixed(6)} user=${row.userId.slice(0, 8)}…`,
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
