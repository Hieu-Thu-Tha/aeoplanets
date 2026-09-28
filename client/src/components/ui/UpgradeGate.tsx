import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useSubscription, type PlanLimits } from "@/hooks/useSubscription";

type Props = {
  feature: keyof PlanLimits;
  featureLabel?: string;
  children: React.ReactNode;
};

export function UpgradeGate({ feature, featureLabel, children }: Props) {
  const { canAccess, isLoading } = useSubscription();

  if (isLoading) return <>{children}</>;

  if (canAccess(feature)) return <>{children}</>;

  const label = featureLabel ?? feature;

  return (
    <div className="relative">
      <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4" data-testid="banner-upgrade-gate">
        <div className="flex items-start sm:items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5 sm:mt-0" />
          <div>
            <p className="text-sm font-medium">Unlock {label}</p>
            <p className="text-xs text-muted-foreground mt-0.5 break-words">
              This feature is available on the Growth plan and above. Upgrade to get access.
            </p>
          </div>
        </div>
        <Button size="sm" asChild className="self-start sm:self-auto flex-shrink-0" data-testid="button-upgrade-gate">
          <Link href="/select-plan">View Plans</Link>
        </Button>
      </div>
      <div className="pointer-events-none select-none opacity-40 blur-sm">
        {children}
      </div>
    </div>
  );
}
