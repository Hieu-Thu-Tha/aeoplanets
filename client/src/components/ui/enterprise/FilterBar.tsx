import { cn } from "@/lib/utils";

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 px-4 py-3 bg-card border border-card-border rounded-md", className)}>
      {children}
    </div>
  );
}
