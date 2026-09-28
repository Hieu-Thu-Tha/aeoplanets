import { useState } from "react";

export type CostCurrency = "USD" | "GBP";

const STORAGE_KEY = "admin_cost_currency";

/**
 * Admin dashboard currency preference for AI cost display. Costs are always
 * stored and served in USD; GBP is a display-time conversion using the live
 * rate the API returns alongside the data. Preference persists per browser.
 */
export function useCurrencyPreference() {
  const [currency, setCurrencyState] = useState<CostCurrency>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "GBP" ? "GBP" : "USD";
  });

  const setCurrency = (next: CostCurrency) => {
    localStorage.setItem(STORAGE_KEY, next);
    setCurrencyState(next);
  };

  const formatCost = (usdAmount: number, usdGbpRate: number): string => {
    const amount = currency === "GBP" ? usdAmount * usdGbpRate : usdAmount;
    const symbol = currency === "GBP" ? "£" : "$";
    if (amount !== 0 && Math.abs(amount) < 0.01) return `${symbol}${amount.toFixed(4)}`;
    return `${symbol}${amount.toFixed(2)}`;
  };

  return { currency, setCurrency, formatCost };
}
