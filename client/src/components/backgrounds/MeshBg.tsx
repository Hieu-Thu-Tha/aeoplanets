interface MeshBgProps {
  children: React.ReactNode;
  className?: string;
  opacity?: number;
}

export function MeshBg({ children, className = "", opacity = 0.3 }: MeshBgProps) {
  const lineAlpha = (opacity * 0.18).toFixed(3);
  return (
    <div className={`relative bg-black ${className}`}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,${lineAlpha}) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,${lineAlpha}) 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)",
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
