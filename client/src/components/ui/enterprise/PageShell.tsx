import { cn } from "@/lib/utils";
import { PageHeading, type PageGuide } from "./PageHeading";

interface PageShellProps {
  title?: string;
  subtitle?: string;
  guide?: PageGuide;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function PageShell({ title, subtitle, guide, actions, children, className }: PageShellProps) {
  return (
    <div className={cn("max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          {title && (
            <PageHeading
              title={title}
              subtitle={subtitle}
              guide={guide}
              className="space-y-1"
              headingClassName="text-display text-foreground"
              subtitleClassName="text-body text-muted-foreground"
            />
          )}
          {!title && subtitle && <p className="text-body text-muted-foreground">{subtitle}</p>}
          {actions && (
            <div className="flex items-center gap-3 shrink-0">{actions}</div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
