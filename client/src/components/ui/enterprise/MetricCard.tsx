import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  icon?: LucideIcon;
  label: string;
  value: string | number;
  delta?: number;
  description?: string;
  className?: string;
}

export function MetricCard({ icon: Icon, label, value, delta, description, className }: MetricCardProps) {
  const isPositive = delta !== undefined && delta >= 0;
  const isNegative = delta !== undefined && delta < 0;

  return (
    <Card className={cn("p-6", className)}>
      <CardContent className="p-0 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-label text-muted-foreground">{label}</span>
          {Icon && (
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
              <Icon className="w-4 h-4 text-primary" />
            </div>
          )}
        </div>
        <div className="flex items-end gap-3">
          <span className="text-display text-foreground">{value}</span>
          {delta !== undefined && (
            <div className={cn("flex items-center gap-1 text-xs font-medium mb-1", isPositive ? "text-success" : "text-destructive")}>
              {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <span>{isPositive ? "+" : ""}{delta.toFixed(1)}%</span>
            </div>
          )}
        </div>
        {description && (
          <p className="text-body text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
