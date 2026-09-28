import { cn } from "@/lib/utils";

interface ScoreRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showLabel?: boolean;
}

function getColor(value: number): string {
  if (value < 40) return "hsl(0 84% 60%)";
  if (value < 70) return "hsl(38 92% 50%)";
  return "hsl(142 76% 36%)";
}

export function ScoreRing({ value, size = 120, strokeWidth = 10, className, showLabel = true }: ScoreRingProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;
  const center = size / 2;
  const color = getColor(clampedValue);

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-display leading-none" style={{ color }}>{clampedValue}</span>
          <span className="text-label text-muted-foreground mt-1">/ 100</span>
        </div>
      )}
    </div>
  );
}
