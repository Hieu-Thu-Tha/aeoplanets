import { useState } from "react";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useBrand } from "@/contexts/BrandContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Shield, ChevronDown, Search, Globe, LogOut, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function domainLabel(domain: string): string {
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

export function SuperAdminSwitcher() {
  const {
    isSuperAdmin,
    viewingAccount,
    accounts,
    switchToAccount,
    exitAccount,
    deactivateAccount,
  } = useSuperAdmin();
  const { setActiveBrandId } = useBrand();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [deactivateTarget, setDeactivateTarget] = useState<{ userId: string; email: string } | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  if (!isSuperAdmin) return null;

  const q = search.toLowerCase().trim();
  const filtered = q
    ? accounts.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.brands.some(
            (b) =>
              b.domain.toLowerCase().includes(q) ||
              (b.companyName || "").toLowerCase().includes(q)
          )
      )
    : accounts;

  async function handleSwitch(accountOwnerId: string, brandId?: number) {
    try {
      await switchToAccount(accountOwnerId);
      if (brandId) {
        setTimeout(() => setActiveBrandId(brandId), 100);
      }
    } catch {
      toast({ title: "Failed to switch account", variant: "destructive" });
    }
  }

  async function handleExit() {
    try {
      await exitAccount();
    } catch {
      toast({ title: "Failed to return to own account", variant: "destructive" });
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    setIsDeactivating(true);
    try {
      const result = await deactivateAccount(deactivateTarget.userId);
      toast({ title: "Account deactivated", description: result.message });
      setDeactivateTarget(null);
    } catch {
      toast({ title: "Failed to deactivate account", variant: "destructive" });
    } finally {
      setIsDeactivating(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="gap-2 max-w-[160px] sm:max-w-[220px] border-amber-500/40 text-amber-400"
            data-testid="dropdown-super-admin-switcher"
          >
            <Shield className="h-4 w-4 shrink-0" />
            <span className="truncate text-sm">
              {viewingAccount ? viewingAccount.name : "Admin"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[320px] max-h-[400px]" data-testid="menu-super-admin-accounts">
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search accounts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-super-admin-search"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          <DropdownMenuSeparator />
          <div className="overflow-y-auto max-h-[280px]">
            {filtered.map((account) => (
              <DropdownMenuGroup key={account.userId}>
                <DropdownMenuLabel className="flex items-center justify-between gap-2 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-xs font-medium">{account.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0 py-0">
                      {account.planDisplayName}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!account.isActive && (
                      <Badge variant="destructive" className="text-[10px] py-0">
                        Inactive
                      </Badge>
                    )}
                    {!account.isProtectedAccount && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeactivateTarget({ userId: account.userId, email: account.email });
                        }}
                        data-testid={`button-deactivate-${account.userId}`}
                      >
                        <Ban className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </DropdownMenuLabel>
                {account.brands.length > 0 ? (
                  account.brands.map((brand) => (
                    <DropdownMenuItem
                      key={brand.id}
                      onClick={() => handleSwitch(account.userId, brand.id)}
                      className="flex items-center gap-2 cursor-pointer pl-6"
                      data-testid={`menu-item-admin-brand-${brand.id}`}
                    >
                      <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">
                        {brand.companyName || domainLabel(brand.domain)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        {domainLabel(brand.domain)}
                      </span>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled className="pl-6 text-xs text-muted-foreground">
                    No brands
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-center text-sm text-muted-foreground">
                No accounts found
              </div>
            )}
          </div>
          {viewingAccount && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleExit}
                className="flex items-center gap-2 cursor-pointer text-amber-400"
                data-testid="menu-item-exit-account"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="text-sm">Return to own account</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Account</AlertDialogTitle>
            <AlertDialogDescription>
              This will pause all tracked terms and cancel the subscription for{" "}
              <span className="font-medium text-foreground">{deactivateTarget?.email}</span>.
              This action can be reversed manually later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-deactivate">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className="bg-destructive text-destructive-foreground"
              disabled={isDeactivating}
              data-testid="button-confirm-deactivate"
            >
              {isDeactivating ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function SuperAdminBanner() {
  const { isSuperAdmin, viewingAccount, exitAccount } = useSuperAdmin();
  const { toast } = useToast();

  if (!isSuperAdmin || !viewingAccount) return null;

  async function handleExit() {
    try {
      await exitAccount();
    } catch {
      toast({ title: "Failed to return to own account", variant: "destructive" });
    }
  }

  return (
    <div
      className="flex items-center justify-between gap-2 px-3 sm:px-6 py-1.5 bg-amber-500/10 border-b border-amber-500/20"
      data-testid="banner-super-admin-viewing"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Shield className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        <span className="text-xs text-amber-400 truncate">
          Viewing as <span className="font-medium">{viewingAccount.name}</span>{" "}
          <span className="text-amber-400/60">({viewingAccount.email})</span>
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleExit}
        className="shrink-0 text-amber-400 h-6 text-xs"
        data-testid="button-exit-account-banner"
      >
        <LogOut className="h-3 w-3 mr-1" />
        Exit
      </Button>
    </div>
  );
}
