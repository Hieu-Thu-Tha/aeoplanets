import { useBrand } from "@/contexts/BrandContext";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Globe, Plus, Check, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/usePermissions";

function domainLabel(domain: string): string {
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

export function BrandSwitcher() {
  const { brands, activeBrand, activeBrandId, setActiveBrandId } = useBrand();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { hasPermission: hasPerm } = usePermissions();

  const { data: billingData } = useQuery<{ subscription: { plan: string } | null; planConfig?: { limits: { brands: number | null } } }>({
    queryKey: ["/api/billing/subscription"],
  });

  const brandLimit = billingData?.planConfig?.limits?.brands ?? null;
  const atBrandLimit = brandLimit !== null && brands.length >= brandLimit;

  const completedBrands = brands.filter((b) => b.scanStatus === "completed");
  const pendingBrands = brands.filter((b) => b.scanStatus !== "completed");

  function handleSwitchBrand(id: number) {
    if (id === activeBrandId) return;
    setActiveBrandId(id);
    queryClient.invalidateQueries();
  }

  function handleAddBrand() {
    if (atBrandLimit) {
      toast({
        title: "All brand slots in use",
        description: `Your plan includes ${brandLimit} brand${brandLimit === 1 ? "" : "s"}. Add an Extra Brand pack or upgrade your plan for more.`,
      });
      navigate("/billing");
      return;
    }
    navigate("/onboarding?new=true");
  }

  const triggerLabel = activeBrand ? domainLabel(activeBrand.domain) : "No brand";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 max-w-[160px] sm:max-w-[220px]" data-testid="dropdown-brand-switcher">
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm">{triggerLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[240px]" data-testid="menu-brand-list">
        {completedBrands.map((brand) => (
          <DropdownMenuItem
            key={brand.id}
            onClick={() => handleSwitchBrand(brand.id)}
            className="flex items-center justify-between gap-2 cursor-pointer"
            data-testid={`menu-item-brand-${brand.id}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm">{domainLabel(brand.domain)}</span>
            </div>
            {brand.id === activeBrandId && (
              <Check className="h-4 w-4 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}

        {pendingBrands.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {pendingBrands.map((brand) => (
              <DropdownMenuItem
                key={brand.id}
                onClick={() => {
                  setActiveBrandId(brand.id);
                  navigate("/onboarding");
                }}
                className="flex items-center gap-2 cursor-pointer opacity-60"
                data-testid={`menu-item-brand-pending-${brand.id}`}
              >
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm">{domainLabel(brand.domain)}</span>
                <span className="text-xs text-muted-foreground ml-auto">Setup</span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {hasPerm("addBrands") && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleAddBrand}
              className="flex items-center gap-2 cursor-pointer"
              data-testid="menu-item-add-brand"
            >
              {atBrandLimit ? (
                <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <Plus className="h-4 w-4 shrink-0" />
              )}
              <span className="text-sm">Add new brand</span>
              {atBrandLimit && (
                <span className="text-xs text-muted-foreground ml-auto">Upgrade</span>
              )}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
