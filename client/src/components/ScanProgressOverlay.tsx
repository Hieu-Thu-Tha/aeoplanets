import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Loader2, CheckCircle2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface OverlayProps {
  brandId: number;
  mode?: "full" | "term";
  termText?: string;
}

function parseScanStatus(status: string | undefined): {
  phase: "querying" | "analyzing" | "completed" | "idle";
  completed: number;
  total: number;
} {
  if (!status) return { phase: "idle", completed: 0, total: 0 };
  if (status === "completed") return { phase: "completed", completed: 0, total: 0 };
  if (status === "running") return { phase: "querying", completed: 0, total: 0 };
  if (status === "running:analyzing") return { phase: "analyzing", completed: 0, total: 0 };

  const match = status.match(/^running:(\d+)\/(\d+)$/);
  if (match) {
    return { phase: "querying", completed: parseInt(match[1]), total: parseInt(match[2]) };
  }

  return { phase: "querying", completed: 0, total: 0 };
}

export function ScanProgressOverlay({ brandId, mode = "full", termText }: OverlayProps) {
  const [completed, setCompleted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { data: scanStatus } = useQuery<{ scanStatus: string }>({
    queryKey: ["/api/brands", brandId, "scan-status"],
    refetchInterval: completed ? false : 3000,
    staleTime: 0,
  });

  const parsed = parseScanStatus(scanStatus?.scanStatus);

  const handleComplete = useCallback(() => {
    if (!completed && scanStatus?.scanStatus === "completed") {
      setCompleted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-terms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "visibility-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "user-questions"] });
      setTimeout(() => setDismissed(true), 3000);
    }
  }, [scanStatus, completed, brandId]);

  useEffect(() => {
    handleComplete();
  }, [handleComplete]);

  if (dismissed) return null;
  const isRunning = scanStatus?.scanStatus?.startsWith("running");
  if (!isRunning && !completed) return null;

  let progress: number;
  let stepLabel = "";
  let questionProgress = "";

  if (completed) {
    progress = 100;
    stepLabel = "Scan complete";
  } else if (parsed.phase === "analyzing") {
    progress = 80;
    stepLabel = "Analysing results";
  } else if (parsed.phase === "querying" && parsed.total > 0) {
    const questionPct = parsed.completed / parsed.total;
    progress = Math.round(questionPct * 75);
    stepLabel = "Querying AI models";
    questionProgress = `${parsed.completed}/${parsed.total} questions`;
  } else {
    progress = 5;
    stepLabel = "Starting scan";
  }

  const title = mode === "term"
    ? `Scanning "${termText || "term"}"`
    : "Scanning all questions";

  return (
    <div
      className={`sticky top-0 z-40 w-full border-b border-border bg-card/95 backdrop-blur-sm transition-opacity duration-500 ${
        completed ? "opacity-80" : "opacity-100"
      }`}
      data-testid="banner-scan-progress"
    >
      <div className="px-4 sm:px-6 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {completed ? (
              <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
            ) : (
              <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />
            )}
            <span className="text-sm font-medium text-foreground truncate" data-testid="text-scan-title">
              {title}
            </span>
            <Badge
              variant="outline"
              className="text-[10px] no-default-hover-elevate no-default-active-elevate flex-shrink-0"
              data-testid="badge-scan-step"
            >
              {stepLabel}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            {questionProgress && !completed && (
              <span className="text-xs text-muted-foreground" data-testid="text-question-progress">
                {questionProgress}
              </span>
            )}
            <span className="text-xs font-medium text-muted-foreground">
              {Math.round(progress)}%
            </span>
            {completed && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setDismissed(true)}
                data-testid="button-dismiss-scan"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-out ${
              completed ? "bg-green-400" : "bg-primary"
            }`}
            style={{ width: `${progress}%` }}
            data-testid="progress-scan-bar"
          />
        </div>
      </div>
    </div>
  );
}
