import { useQuery } from "@tanstack/react-query";

interface Permissions {
  addBrands: boolean;
  billing: boolean;
  addCompetitors: boolean;
  manageUsers: boolean;
  createTickets: boolean;
  deleteTickets: boolean;
  editTickets: boolean;
}

interface PermissionsResponse {
  isOwner: boolean;
  permissions: Permissions;
}

export function usePermissions() {
  const { data, isLoading } = useQuery<PermissionsResponse>({
    queryKey: ["/api/team/permissions"],
    staleTime: 30000,
  });

  const hasPermission = (key: keyof Permissions): boolean => {
    if (!data) return false;
    if (data.isOwner) return true;
    return !!data.permissions[key];
  };

  return {
    isOwner: data?.isOwner ?? false,
    permissions: data?.permissions ?? {
      addBrands: false,
      billing: false,
      addCompetitors: false,
      manageUsers: false,
      createTickets: false,
      deleteTickets: false,
      editTickets: false,
    },
    hasPermission,
    isLoading,
  };
}
