import { storage } from "./storage";

export const changeMonitor = {
  async detectChanges(brandId: number): Promise<void> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const recentRuns = await storage.getVisibilityRunsSince(brandId, yesterday);
    const previousRuns = (await storage.getVisibilityRunsByBrand(brandId)).filter(
      r => r.runDate && new Date(r.runDate) >= twoDaysAgo && new Date(r.runDate) < yesterday
    );

    if (recentRuns.length === 0 || previousRuns.length === 0) {
      console.log(`Not enough data to detect changes for brand ${brandId}`);
      return;
    }

    // Check for brand disappearance: was appearing before, not now
    const recentByPrompt = new Map<string, typeof recentRuns[0]>();
    for (const run of recentRuns) {
      const key = `${run.promptText}:${run.modelId}`;
      recentByPrompt.set(key, run);
    }

    for (const prevRun of previousRuns) {
      const key = `${prevRun.promptText}:${prevRun.modelId}`;
      const currentRun = recentByPrompt.get(key);

      if (!currentRun) continue;

      // Brand disappeared
      if (prevRun.appeared && !currentRun.appeared) {
        await storage.createChangeAlert({
          brandId,
          type: "brand_disappeared",
          message: `Your brand disappeared from "${prevRun.promptText}" on ${prevRun.modelId} where it previously appeared.`,
          metadata: { promptText: prevRun.promptText, modelId: prevRun.modelId },
          isRead: false,
        });
      }

      // Sentiment change
      if (prevRun.appeared && currentRun.appeared && prevRun.sentiment && currentRun.sentiment && prevRun.sentiment !== currentRun.sentiment) {
        await storage.createChangeAlert({
          brandId,
          type: "sentiment_change",
          message: `Sentiment for "${prevRun.promptText}" on ${prevRun.modelId} changed from ${prevRun.sentiment} to ${currentRun.sentiment}.`,
          metadata: {
            promptText: prevRun.promptText,
            modelId: prevRun.modelId,
            previousSentiment: prevRun.sentiment,
            currentSentiment: currentRun.sentiment,
          },
          isRead: false,
        });
      }

      // New competitor appeared
      const prevCompetitors = (prevRun.competitorsMentioned as string[]) || [];
      const currCompetitors = (currentRun.competitorsMentioned as string[]) || [];
      const newCompetitors = currCompetitors.filter(c => !prevCompetitors.includes(c));

      for (const competitor of newCompetitors) {
        await storage.createChangeAlert({
          brandId,
          type: "new_competitor",
          message: `New competitor "${competitor}" now appears in "${prevRun.promptText}" on ${prevRun.modelId}.`,
          metadata: {
            promptText: prevRun.promptText,
            modelId: prevRun.modelId,
            competitor,
          },
          isRead: false,
        });
      }
    }

    console.log(`Change detection complete for brand ${brandId}`);
  },
};
