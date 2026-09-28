import { useQuery } from "@tanstack/react-query";

export type LivePrice = {
  unitAmount: number | null;
  currency: string;
  interval: "month" | "year" | null;
  productName: string | null;
};

export type PricesResponse = {
  configured: boolean;
  mode: "test" | "live" | null;
  prices: Record<string, LivePrice>;
};

const CURRENCY_SYMBOL: Record<string, string> = {
  gbp: "£",
  usd: "$",
  eur: "€",
};

export function formatMoney(unitAmount: number | null | undefined, currency = "gbp"): string | null {
  if (unitAmount == null) return null;
  const symbol = CURRENCY_SYMBOL[currency.toLowerCase()] ?? "";
  const major = unitAmount / 100;
  const formatted = Number.isInteger(major)
    ? major.toLocaleString("en-GB")
    : major.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

export function usePricing() {
  const query = useQuery<PricesResponse>({
    queryKey: ["/api/billing/prices"],
    staleTime: 60_000,
    retry: false,
  });

  function get(lookupKey: string): LivePrice | undefined {
    return query.data?.prices?.[lookupKey];
  }

  /**
   * Resolve a displayable price string for a lookup_key, falling back to the
   * provided hardcoded value if Stripe data is unavailable.
   */
  function display(lookupKey: string, fallback: string): string {
    const live = get(lookupKey);
    const formatted = formatMoney(live?.unitAmount, live?.currency ?? "gbp");
    return formatted ?? fallback;
  }

  /**
   * Compute a "/mo equivalent" string from an annual price.
   */
  function monthlyEquivalent(annualLookupKey: string, fallback: string): string {
    const live = get(annualLookupKey);
    if (live?.unitAmount == null) return fallback;
    const monthly = live.unitAmount / 12;
    const formatted = formatMoney(Math.round(monthly), live.currency);
    return formatted ?? fallback;
  }

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    configured: query.data?.configured ?? false,
    mode: query.data?.mode ?? null,
    get,
    display,
    monthlyEquivalent,
  };
}
