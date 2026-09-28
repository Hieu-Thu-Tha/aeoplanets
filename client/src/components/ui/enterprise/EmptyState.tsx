import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  heading: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, heading, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-16 px-6 space-y-4", className)}>
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h3 className="text-heading text-foreground">{heading}</h3>
        {description && (
          <p className="text-body text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <Button onClick={action.onClick} variant="outline">
          {action.label}
        </Button>
      )}
    </div>
  );
}
