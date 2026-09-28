import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Sparkles, Plus } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  featureLabel: string;
  currentLimit?: number;
  growthLimit?: number | null;
};

export function UpgradeModal({ isOpen, onClose, featureLabel, currentLimit, growthLimit }: Props) {
  const showAddonHint = featureLabel === "brands" || featureLabel === "brand profiles" || featureLabel === "competitors";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <Badge variant="outline" className="text-primary border-primary/40">
              More capacity available
            </Badge>
          </div>
          <DialogTitle className="text-lg" data-testid="text-upgrade-modal-title">
            You've used all your {featureLabel}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm mt-1">
            Your current plan includes {currentLimit !== undefined ? `${currentLimit} ${featureLabel}` : `a limited number of ${featureLabel}`}. You can expand your capacity or upgrade to a higher plan.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {currentLimit !== undefined && (
            <div className="rounded-md bg-muted/50 p-3 sm:p-4 space-y-2 text-sm">
              <div className="flex flex-wrap justify-between gap-1">
                <span className="text-muted-foreground">Current plan</span>
                <span className="font-medium">{currentLimit} {featureLabel}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-1">
                <span className="text-muted-foreground">Growth plan</span>
                <span className="font-medium text-green-400">
                  {growthLimit === null ? "Unlimited" : `${growthLimit} ${featureLabel}`}
                </span>
              </div>
            </div>
          )}
          {showAddonHint && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 sm:p-4 text-sm">
              <div className="flex items-start gap-2.5">
                <Plus className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Add-on packs available</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {featureLabel === "competitors"
                      ? "Add 5 extra competitor slots from £15/month."
                      : "Add an extra brand profile from £25/month."}
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="flex-1" asChild onClick={onClose} data-testid="button-upgrade-modal-billing">
              <Link href="/select-plan">
                View Options
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" onClick={onClose} data-testid="button-upgrade-modal-dismiss">
              Not now
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
