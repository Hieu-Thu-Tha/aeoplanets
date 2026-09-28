import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban } from "lucide-react";

type UsageWindow = {
  spendGbp: number;
  capGbp: number;
  ratio: number;
  resetsAt?: string;
  cadence?: "daily" | "weekly" | "monthly";
};

type AiUsageCapStatus = {
  enabled: boolean;
  status: "disabled" | "ok" | "warning" | "blocked";
  blockedBy: Array<"refresh" | "monthly">;
  refresh?: UsageWindow;
  monthly?: UsageWindow;
};

function percent(ratio: number): string {
  const num = Math.min(100, Math.max(0, ratio * 100));
  return num.toFixed(2);
}

export function AiUsageCapBanner() {
  const { data } = useQuery<AiUsageCapStatus>({
    queryKey: ["/api/ai-usage/status"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  if (!data?.enabled || data.status === "ok" || data.status === "disabled") return null;

  const refresh = data.refresh!;
  const monthly = data.monthly!;
  const isBlocked = data.status === "blocked";
  const limitingWindow = isBlocked && data.blockedBy.includes("monthly")
    ? monthly
    : refresh.ratio >= monthly.ratio ? refresh : monthly;
  const isRefreshWindow = limitingWindow === refresh;
  const label = isRefreshWindow ? `${refresh.cadence} allowance` : "monthly allowance";

  return (
    <div
      className={isBlocked
        ? "border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-900 dark:text-red-100"
        : "border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-100"}
      data-testid={`banner-ai-usage-${data.status}`}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 text-center">
        {isBlocked ? <Ban className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
        <span>
          {isBlocked
            ? `AI actions and scheduled refreshes are paused: your ${label} has reached its limit.`
            : `You have used ${percent(limitingWindow.ratio)}% of your ${label}.`}
          {!isBlocked ? " Scheduled refreshes use the same allowance." : ""}
          {isBlocked && limitingWindow.resetsAt
            ? ` Access refreshes ${new Date(limitingWindow.resetsAt).toLocaleString(undefined, { timeZoneName: "short" })}.`
            : ""}
        </span>
        <a href="/select-plan" className="shrink-0 font-medium underline underline-offset-2">
          View plans
        </a>
      </div>
    </div>
  );
}
