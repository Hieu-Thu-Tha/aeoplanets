import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, subtitle, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-border", className)}>
      <div className="space-y-1">
        <h2 className="text-heading text-foreground">{title}</h2>
        {subtitle && (
          <p className="text-body text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="flex items-center gap-2 shrink-0">{action}</div>
      )}
    </div>
  );
}
