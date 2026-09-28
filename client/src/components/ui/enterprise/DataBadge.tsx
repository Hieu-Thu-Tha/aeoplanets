import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DataBadgeVariant = "appeared" | "missing" | "positive" | "negative" | "neutral" | "warning";

interface DataBadgeProps {
  variant: DataBadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<DataBadgeVariant, string> = {
  appeared: "bg-success-muted text-success border-transparent",
  missing: "bg-destructive/10 text-destructive border-transparent",
  positive: "bg-success-muted text-success border-transparent",
  negative: "bg-destructive/10 text-destructive border-transparent",
  neutral: "bg-muted text-muted-foreground border-transparent",
  warning: "bg-warning-muted text-warning border-transparent",
};

export function DataBadge({ variant, children, className }: DataBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(variantStyles[variant], className)}
    >
      {children}
    </Badge>
  );
}
