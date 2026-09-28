import { PowderExplosionBg } from "./PowderExplosionBg";
import { MeshBg } from "./MeshBg";

interface HeroBackdropProps {
  children: React.ReactNode;
  className?: string;
  variant?: "powder" | "mesh" | "both";
  powderOpacity?: number;
  meshOpacity?: number;
  powderPosition?: "center" | "top" | "bottom" | "left" | "right";
}

export function HeroBackdrop({ 
  children, 
  className = "",
  variant = "both",
  powderOpacity = 0.6,
  meshOpacity = 0.3,
  powderPosition = "center"
}: HeroBackdropProps) {
  if (variant === "powder") {
    return (
      <PowderExplosionBg 
        className={className} 
        opacity={powderOpacity}
        position={powderPosition}
      >
        {children}
      </PowderExplosionBg>
    );
  }

  if (variant === "mesh") {
    return (
      <MeshBg className={className} opacity={meshOpacity}>
        {children}
      </MeshBg>
    );
  }

  // Both powder and mesh layered
  return (
    <PowderExplosionBg 
      className={className} 
      opacity={powderOpacity}
      position={powderPosition}
    >
      <MeshBg opacity={meshOpacity}>
        {children}
      </MeshBg>
    </PowderExplosionBg>
  );
}
