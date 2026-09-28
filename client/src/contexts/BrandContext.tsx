import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

interface Brand {
  id: number;
  domain: string;
  category?: string;
  competitors?: string[];
  scanStatus: string;
  [key: string]: any;
}

interface BrandContextValue {
  brands: Brand[];
  activeBrand: Brand | null;
  activeBrandId: number | null;
  setActiveBrandId: (id: number) => void;
  isLoading: boolean;
}

const BrandContext = createContext<BrandContextValue>({
  brands: [],
  activeBrand: null,
  activeBrandId: null,
  setActiveBrandId: () => {},
  isLoading: true,
});

const STORAGE_KEY = "aeostars_active_brand_id";

function readStoredId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : null;
  } catch {
    return null;
  }
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(readStoredId);

  const { data: brands = [], isLoading } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
    enabled: !!user,
  });

  const activeBrand =
    brands.find((b) => b.id === selectedId) ||
    brands.find((b) => b.scanStatus === "completed") ||
    brands[0] ||
    null;

  const activeBrandId = activeBrand?.id ?? null;

  useEffect(() => {
    if (activeBrandId !== null && activeBrandId !== selectedId) {
      setSelectedId(activeBrandId);
      try { localStorage.setItem(STORAGE_KEY, String(activeBrandId)); } catch {}
    }
  }, [activeBrandId, selectedId]);

  const setActiveBrandId = useCallback((id: number) => {
    setSelectedId(id);
    try { localStorage.setItem(STORAGE_KEY, String(id)); } catch {}
  }, []);

  return (
    <BrandContext.Provider value={{ brands, activeBrand, activeBrandId, setActiveBrandId, isLoading }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}
