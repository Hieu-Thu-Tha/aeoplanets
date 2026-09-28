import logoDark from "@assets/aeo_logo_1776331540235.png";
import logoLight from "@assets/AEOMRBOBBLELOGO_1776332792451.png";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "dark" | "light";
}

export function Logo({ className = "", size = "md", variant = "light" }: LogoProps) {
  const sizeClasses = {
    sm: "h-7",
    md: "h-9",
    lg: "h-12",
  };

  const src = variant === "dark" ? logoDark : logoLight;

  return (
    <img
      src={src}
      alt="AEO by Mr Bobble"
      className={`${sizeClasses[size]} w-auto ${className}`}
      data-testid="logo"
      loading="lazy"
      decoding="async"
    />
  );
}
