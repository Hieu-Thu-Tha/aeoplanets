import { Home, Eye, BarChart2, Users, UsersRound, CheckCircle, Bell, FileText, Newspaper, MessageSquare, LogOut, Tag, CreditCard, Library, BookOpen, ClipboardList, Settings2, Gauge, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Logo } from "@/components/Logo";
import { useBrand } from "@/contexts/BrandContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";

const mainNavItems = [
  {
    title: "My Actions",
    url: "/actions",
    icon: ClipboardList,
    testId: "link-actions",
  },
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
    testId: "link-dashboard",
  },
  {
    title: "Visibility Report",
    url: "/visibility-report",
    icon: Search,
    testId: "link-visibility-report",
  },
  {
    title: "Perception Mirror",
    url: "/perception",
    icon: Eye,
    testId: "link-perception",
  },
  {
    title: "Coverage Analysis",
    url: "/coverage",
    icon: BarChart2,
    testId: "link-coverage",
  },
  {
    title: "Competitor Map",
    url: "/competitors",
    icon: Users,
    testId: "link-competitors",
  },
  {
    title: "Technical Brand Audit",
    url: "/audit",
    icon: CheckCircle,
    testId: "link-audit",
  },
  {
    title: "Core Web Vitals",
    url: "/web-vitals",
    icon: Gauge,
    testId: "link-web-vitals",
  },
  {
    title: "Alerts",
    url: "/alerts",
    icon: Bell,
    testId: "link-alerts",
    showUnreadBadge: true,
  },
  {
    title: "Reports",
    url: "/reports",
    icon: FileText,
    testId: "link-reports",
  },
  {
    title: "Resource Library",
    url: "/resources",
    icon: Library,
    testId: "link-resources",
  },
  {
    title: "User Guide",
    url: "/user-guide",
    icon: BookOpen,
    testId: "link-user-guide",
  },
  {
    title: "Brand Settings",
    url: "/brand-settings",
    icon: Settings2,
    testId: "link-brand-settings",
  },
  {
    title: "Team",
    url: "/team",
    icon: UsersRound,
    testId: "link-team",
    permissionRequired: "manageUsers" as const,
  },
  {
    title: "Billing",
    url: "/billing",
    icon: CreditCard,
    testId: "link-billing",
    permissionRequired: "billing" as const,
  },
];

const adminItems = [
  {
    title: "News Management",
    url: "/admin/news",
    icon: Newspaper,
    testId: "link-admin-news",
  },
  {
    title: "Reviews Management",
    url: "/admin/reviews",
    icon: MessageSquare,
    testId: "link-admin-reviews",
  },
  {
    title: "Account Management",
    url: "/admin/accounts",
    icon: ShieldCheck,
    testId: "link-admin-accounts",
    superAdminOnly: true,
  },
  {
    title: "System Config",
    url: "/admin/system-config",
    icon: SlidersHorizontal,
    testId: "link-admin-system-config",
    superAdminOnly: true,
  },
];

export function AppSidebar() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { hasPermission, isOwner } = usePermissions();
  const { isSuperAdmin } = useSuperAdmin();

  const initials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "U";

  const [location] = useLocation();
  const isItemActive = (url: string) =>
    url === "/" ? location === "/" : location === url || location.startsWith(url + "/");

  const { activeBrandId } = useBrand();
  const brandId = activeBrandId;

  const { data: alerts } = useQuery<any[]>({
    queryKey: ["/api/brands", brandId, "alerts"],
    enabled: !!brandId,
  });

  const unreadAlertCount = alerts?.filter((a: any) => !a.isRead).length || 0;

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/auth/logout", {});
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      window.location.href = "/login";
    },
  });

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarContent>
        {/* Logo/Brand */}
        <div className="flex h-16 items-center justify-center border-b border-sidebar-border px-6">
          <Logo size="md" variant="dark" />
        </div>

        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase text-xs tracking-wider px-3">
            Intelligence
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems
                .filter((item) => !item.permissionRequired || hasPermission(item.permissionRequired))
                .map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isItemActive(item.url)} className="data-[active=true]:bg-emerald-600 data-[active=true]:text-white data-[active=true]:font-semibold hover:bg-emerald-600/20">
                    <Link href={item.url} data-testid={item.testId} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </div>
                      {item.showUnreadBadge && unreadAlertCount > 0 && (
                        <Badge variant="default" className="ml-auto text-xs" data-testid="badge-unread-alerts">
                          {unreadAlertCount}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Section */}
        {(isAdmin || isSuperAdmin) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase text-xs tracking-wider px-3">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems
                  .filter((item) => {
                    if (item.superAdminOnly) return isSuperAdmin;
                    return isAdmin || isSuperAdmin;
                  })
                  .map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isItemActive(item.url)} className="data-[active=true]:bg-emerald-600 data-[active=true]:text-white data-[active=true]:font-semibold hover:bg-emerald-600/20">
                      <Link href={item.url} data-testid={item.testId} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* User Profile Footer */}
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-3 p-4">
          <Avatar className="h-9 w-9 border border-sidebar-border">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.email || "User"} />
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate text-sidebar-foreground">
              {user?.firstName && user?.lastName
                ? `${user.firstName} ${user.lastName}`
                : user?.email || "User"}
            </p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
