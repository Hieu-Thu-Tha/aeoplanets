import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PageShell,
  EmptyState,
  DataBadge,
  FilterBar,
} from "@/components/ui/enterprise";
import {
  Bell,
  CheckCheck,
  Users,
  TrendingDown,
  TrendingUp,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBrand } from "@/contexts/BrandContext";
import type { ChangeAlert } from "@shared/schema";

const alertTypeConfig: Record<
  string,
  {
    label: string;
    variant:
      | "appeared"
      | "missing"
      | "positive"
      | "negative"
      | "neutral"
      | "warning";
    icon: React.ElementType;
  }
> = {
  new_competitor: { label: "New Competitor", variant: "warning", icon: Users },
  brand_disappeared: {
    label: "Brand Disappeared",
    variant: "negative",
    icon: TrendingDown,
  },
  sentiment_change: {
    label: "Sentiment Change",
    variant: "neutral",
    icon: TrendingUp,
  },
  model_shift: { label: "Model Shift", variant: "neutral", icon: Cpu },
};

function formatRelativeTime(dateStr: string | Date | null): string {
  if (!dateStr) return "Unknown";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function AlertItem({
  alert,
  onMarkRead,
  isMarkingRead,
}: {
  alert: ChangeAlert;
  onMarkRead: (id: number) => void;
  isMarkingRead: boolean;
}) {
  const config = alertTypeConfig[alert.type] ?? {
    label: alert.type,
    variant: "neutral" as const,
    icon: Bell,
  };
  const Icon = config.icon;

  return (
    <Card
      className={`transition-colors ${!alert.isRead ? "bg-card border-border" : "bg-muted/30 border-transparent"}`}
      data-testid={`card-alert-${alert.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div
            className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${!alert.isRead ? "bg-primary/10" : "bg-muted"}`}
          >
            <Icon
              className={`w-4 h-4 ${!alert.isRead ? "text-primary" : "text-muted-foreground"}`}
            />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <DataBadge
                variant={config.variant}
                data-testid={`badge-alert-type-${alert.id}`}
              >
                {config.label}
              </DataBadge>
              {!alert.isRead && (
                <span
                  className="inline-block w-2 h-2 rounded-full bg-primary"
                  data-testid={`dot-unread-${alert.id}`}
                />
              )}
              <span
                className="text-xs text-muted-foreground ml-auto"
                data-testid={`text-alert-time-${alert.id}`}
              >
                {formatRelativeTime(alert.createdAt)}
              </span>
            </div>
            <p
              className="text-sm text-foreground leading-relaxed"
              data-testid={`text-alert-message-${alert.id}`}
            >
              {alert.message}
            </p>
          </div>
          {!alert.isRead && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onMarkRead(alert.id)}
              disabled={isMarkingRead}
              data-testid={`button-mark-read-${alert.id}`}
              className="flex-shrink-0 text-xs text-muted-foreground"
            >
              Mark read
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AlertsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Alerts() {
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { activeBrandId: brandId } = useBrand();

  const { data: alerts, isLoading } = useQuery<ChangeAlert[]>({
    queryKey: ["/api/brands", brandId, "alerts"],
    enabled: !!brandId,
  });

  const unreadCount = alerts?.filter((a) => !a.isRead).length ?? 0;

  const markReadMutation = useMutation({
    mutationFn: async (alertId: number) => {
      return await apiRequest("PATCH", `/api/alerts/${alertId}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/brands", brandId, "alerts"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
    },
    onError: () => {
      toast({ title: "Failed to mark alert as read", variant: "destructive" });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(
        "POST",
        `/api/brands/${brandId}/alerts/mark-all-read`,
        {},
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/brands", brandId, "alerts"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({ title: "All alerts marked as read" });
    },
    onError: () => {
      toast({
        title: "Failed to mark all alerts as read",
        variant: "destructive",
      });
    },
  });

  const filteredAlerts = alerts
    ? showUnreadOnly
      ? alerts.filter((a) => !a.isRead)
      : alerts
    : [];

  return (
    <PageShell
      title="Change Monitoring Alerts"
      subtitle="Track changes in how AI models reference your brand over time"
      actions={
        unreadCount > 0 ? (
          <Button
            variant="outline"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="w-4 h-4 mr-2" />
            Mark all read
          </Button>
        ) : undefined
      }
    >
      <FilterBar>
        <div className="flex items-center gap-2">
          <Button
            variant={!showUnreadOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowUnreadOnly(false)}
            data-testid="button-filter-all"
          >
            All
          </Button>
          <Button
            variant={showUnreadOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowUnreadOnly(true)}
            data-testid="button-filter-unread"
          >
            Unread
            {unreadCount > 0 && (
              <span
                className="ml-1.5 inline-flex items-center justify-center rounded-full bg-primary-foreground text-primary text-xs font-medium w-fit min-w-5 px-1 h-5"
                data-testid="text-unread-count"
              >
                {unreadCount}
              </span>
            )}
          </Button>
        </div>
      </FilterBar>

      {!brandId ? (
        <EmptyState
          icon={Bell}
          heading="No brand configured"
          description="Complete onboarding to start monitoring AI model changes."
        />
      ) : isLoading ? (
        <AlertsSkeleton />
      ) : filteredAlerts.length === 0 ? (
        <EmptyState
          icon={Bell}
          heading={showUnreadOnly ? "No unread alerts" : "No alerts yet"}
          description={
            showUnreadOnly
              ? "You have read all your alerts."
              : "Alerts will appear here as AI model outputs change over time. Run a scan to start monitoring."
          }
        />
      ) : (
        <div className="space-y-3" data-testid="list-alerts">
          {filteredAlerts.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onMarkRead={(id) => markReadMutation.mutate(id)}
              isMarkingRead={markReadMutation.isPending}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
