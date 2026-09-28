interface PowderExplosionBgProps {
  children: React.ReactNode;
  className?: string;
  position?: "center" | "top" | "bottom" | "left" | "right";
  opacity?: number;
}

export function PowderExplosionBg({
  children,
  className = "",
  opacity = 0.6,
}: PowderExplosionBgProps) {
  return (
    <div className={`relative ${className}`}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 90% 55% at 50% 35%, rgba(0,200,255,${(opacity * 0.11).toFixed(3)}) 0%, rgba(0,120,255,${(opacity * 0.05).toFixed(3)}) 45%, transparent 70%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
