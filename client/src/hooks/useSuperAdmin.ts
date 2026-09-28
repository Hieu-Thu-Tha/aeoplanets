import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useCallback } from "react";

interface ViewingAccount {
  userId: string;
  name: string;
  email: string;
}

interface SuperAdminStatus {
  isSuperAdmin: boolean;
  viewingAccount: ViewingAccount | null;
}

interface AccountBrand {
  id: number;
  domain: string;
  companyName: string | null;
  scanStatus: string;
}

interface Account {
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
  plan: string;
  planDisplayName: string;
  isProtectedAccount: boolean;
  brands: AccountBrand[];
}

interface AccountsResponse {
  accounts: Account[];
}

export function useSuperAdmin() {
  const { data: status, isLoading: statusLoading } = useQuery<SuperAdminStatus>({
    queryKey: ["/api/auth/super-admin-status"],
    staleTime: 30000,
  });

  const { data: accountsData, isLoading: accountsLoading } = useQuery<AccountsResponse>({
    queryKey: ["/api/super-admin/accounts"],
    enabled: !!status?.isSuperAdmin,
    staleTime: 60000,
  });

  const switchToAccount = useCallback(async (accountOwnerId: string) => {
    await apiRequest("POST", "/api/super-admin/switch-account", { accountOwnerId });
    queryClient.invalidateQueries();
  }, []);

  const exitAccount = useCallback(async () => {
    await apiRequest("POST", "/api/super-admin/exit-account");
    queryClient.invalidateQueries();
  }, []);

  const deactivateAccount = useCallback(async (accountOwnerId: string) => {
    const res = await apiRequest("POST", "/api/super-admin/deactivate-account", { accountOwnerId });
    const data = await res.json();
    queryClient.invalidateQueries({ queryKey: ["/api/super-admin/accounts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/super-admin/account-management"] });
    return data;
  }, []);

  return {
    isSuperAdmin: status?.isSuperAdmin ?? false,
    viewingAccount: status?.viewingAccount ?? null,
    accounts: accountsData?.accounts ?? [],
    isLoading: statusLoading || accountsLoading,
    switchToAccount,
    exitAccount,
    deactivateAccount,
  };
}
