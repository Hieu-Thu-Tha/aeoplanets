export const chartColors = [
  "hsl(217 91% 60%)",
  "hsl(142 76% 36%)",
  "hsl(262 83% 58%)",
  "hsl(31 97% 60%)",
  "hsl(339 82% 56%)",
  "hsl(187 85% 43%)",
  "hsl(45 93% 47%)",
  "hsl(292 60% 50%)",
  "hsl(160 84% 39%)",
  "hsl(10 78% 54%)",
];

export const chartTooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--card-border))",
  borderRadius: "6px",
  color: "hsl(var(--card-foreground))",
  fontSize: "0.875rem",
};

export const chartAxisStyle = {
  tick: { fill: "hsl(var(--muted-foreground))", fontSize: 12 },
  axisLine: { stroke: "hsl(var(--border))" },
  tickLine: false as const,
};

export const chartGridStyle = {
  stroke: "hsl(var(--border))",
  strokeDasharray: "4 4",
  vertical: false,
};

export const defaultLineProps = {
  strokeWidth: 2,
  dot: false,
  activeDot: { r: 4, strokeWidth: 0 },
};

export const defaultCartesianGridProps = {
  strokeDasharray: "4 4",
  stroke: "hsl(var(--border) / 0.5)",
  vertical: false,
};

export const defaultXAxisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fill: "hsl(var(--muted-foreground))", fontSize: 12 },
};

export const defaultYAxisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fill: "hsl(var(--muted-foreground))", fontSize: 12 },
};
