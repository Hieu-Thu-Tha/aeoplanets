import { cn } from "@/lib/utils";

interface StatItem {
  label: string;
  value: string | number;
}

interface StatRowProps {
  stats: StatItem[];
  className?: string;
}

export function StatRow({ stats, className }: StatRowProps) {
  return (
    <div className={cn("flex flex-wrap gap-6", className)}>
      {stats.map((stat, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          <span className="text-label text-muted-foreground">{stat.label}</span>
          <span className="text-heading text-foreground">{stat.value}</span>
        </div>
      ))}
    </div>
  );
}
