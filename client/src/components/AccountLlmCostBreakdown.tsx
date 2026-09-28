import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AccountBrand {
  id: number;
  name: string;
}

interface AccountCostData {
  userId: string;
  brands: AccountBrand[];
  legacyEstimatedCost: number;
}

interface AiUsageBreakdownRow {
  group: string;
  calls: number;
  costUsd: number;
}

interface AiUsageBreakdownResponse {
  groupBy: "model" | "brand" | "feature";
  rows: AiUsageBreakdownRow[];
}

export type CostBreakdownTab = "model" | "brand" | "feature";

const BRAND_PREVIEW_LIMIT = 5;
const FEATURE_LABELS: Record<string, string> = {
  visibility_scan: "Visibility Scan",
  readability_audit: "Readability Audit",
  question_generation: "Question Generation",
  perception: "Perception Mirror",
  provisioning_research: "Provisioning Research",
  volume_estimation: "Volume Estimation",
  competitor_research: "Competitor Research",
  brand_research: "Brand Research",
  data_freshness: "Data Freshness",
  ticket_generation: "Ticket Generation",
  coverage: "Coverage Analysis",
  report: "Report",
  news: "News",
};

export function AccountLlmCostBreakdown({ account, activeTab, onTabChange, formatCost }: {
  account: AccountCostData;
  activeTab: CostBreakdownTab;
  onTabChange: (tab: CostBreakdownTab) => void;
  formatCost: (usdAmount: number) => string;
}) {
  const [showAllBrands, setShowAllBrands] = useState(false);
  const modelBreakdown = useQuery<AiUsageBreakdownResponse>({
    queryKey: [`/api/super-admin/ai-usage?userId=${encodeURIComponent(account.userId)}&groupBy=model`],
    enabled: activeTab === "model",
  });
  const brandBreakdown = useQuery<AiUsageBreakdownResponse>({
    queryKey: [`/api/super-admin/ai-usage?userId=${encodeURIComponent(account.userId)}&groupBy=brand`],
    enabled: activeTab === "brand",
  });
  const featureBreakdown = useQuery<AiUsageBreakdownResponse>({
    queryKey: [`/api/super-admin/ai-usage?userId=${encodeURIComponent(account.userId)}&groupBy=feature`],
    enabled: activeTab === "feature",
  });

  const brandUsageById = new Map((brandBreakdown.data?.rows ?? []).map((row) => [row.group, row]));
  const knownBrandIds = new Set(account.brands.map((brand) => String(brand.id)));
  const brandRows = account.brands.map((brand) => {
    const usage = brandUsageById.get(String(brand.id));
    return {
      key: String(brand.id),
      name: brand.name,
      calls: usage?.calls ?? 0,
      costUsd: usage?.costUsd ?? 0,
    };
  });
  const unattributedUsage = (brandBreakdown.data?.rows ?? [])
    .filter((row) => !knownBrandIds.has(row.group))
    .reduce(
      (total, row) => ({ calls: total.calls + row.calls, costUsd: total.costUsd + row.costUsd }),
      { calls: 0, costUsd: 0 },
    );
  if (unattributedUsage.calls > 0) {
    brandRows.push({ key: "unattributed", name: "Unattributed", ...unattributedUsage });
  }
  brandRows.sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls || a.name.localeCompare(b.name));

  const hiddenBrandRows = brandRows.slice(BRAND_PREVIEW_LIMIT);
  const visibleBrandRows = showAllBrands ? brandRows : brandRows.slice(0, BRAND_PREVIEW_LIMIT);
  const hiddenBrandTotals = hiddenBrandRows.reduce(
    (total, row) => ({ calls: total.calls + row.calls, costUsd: total.costUsd + row.costUsd }),
    { calls: 0, costUsd: 0 },
  );

  return (
    <div className="border-y border-border px-8 py-4">
      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as CostBreakdownTab)}>
        <TabsList className="grid h-auto w-full max-w-md grid-cols-3">
          <TabsTrigger value="model" data-testid={`tab-cost-model-${account.userId}`}>By model</TabsTrigger>
          <TabsTrigger value="brand" data-testid={`tab-cost-brand-${account.userId}`}>By brand</TabsTrigger>
          <TabsTrigger value="feature" data-testid={`tab-cost-feature-${account.userId}`}>By feature</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4 overflow-x-auto">
        {activeTab === "model" && (
          modelBreakdown.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading model costs…
            </div>
          ) : modelBreakdown.isError ? (
            <p className="py-8 text-center text-sm text-destructive">Unable to load the model breakdown.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr:hover]:bg-transparent">
                {(modelBreakdown.data?.rows ?? []).map((row) => (
                  <TableRow key={row.group}>
                    <TableCell>{row.group}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.calls.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCost(row.costUsd)}</TableCell>
                  </TableRow>
                ))}
                {account.legacyEstimatedCost > 0 && (
                  <TableRow className="text-muted-foreground/80 italic">
                    <TableCell>Historical (est.)</TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums" data-testid={`text-legacy-cost-${account.userId}`}>
                      {formatCost(account.legacyEstimatedCost)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )
        )}

        {activeTab === "brand" && (
          brandBreakdown.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading brand costs…
            </div>
          ) : brandBreakdown.isError ? (
            <p className="py-8 text-center text-sm text-destructive">Unable to load the brand breakdown.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr:hover]:bg-transparent">
                  {visibleBrandRows.length > 0 ? visibleBrandRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.calls.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCost(row.costUsd)}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                        No attributable brand usage.
                      </TableCell>
                    </TableRow>
                  )}
                  {!showAllBrands && hiddenBrandRows.length > 0 && (
                    <TableRow className="text-muted-foreground">
                      <TableCell>
                        <button
                          type="button"
                          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          onClick={() => setShowAllBrands(true)}
                          data-testid={`button-more-brands-${account.userId}`}
                        >
                          + {hiddenBrandRows.length} more {hiddenBrandRows.length === 1 ? "brand" : "brands"}
                        </button>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{hiddenBrandTotals.calls.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCost(hiddenBrandTotals.costUsd)}</TableCell>
                    </TableRow>
                  )}
                  {showAllBrands && hiddenBrandRows.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <button
                          type="button"
                          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          onClick={() => setShowAllBrands(false)}
                        >
                          Show fewer brands
                        </button>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          )
        )}

        {activeTab === "feature" && (
          featureBreakdown.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading feature costs…
            </div>
          ) : featureBreakdown.isError ? (
            <p className="py-8 text-center text-sm text-destructive">Unable to load the feature breakdown.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr:hover]:bg-transparent">
                  {(featureBreakdown.data?.rows ?? []).length > 0 ? (
                    featureBreakdown.data?.rows.map((row) => (
                      <TableRow key={row.group}>
                        <TableCell>
                          {FEATURE_LABELS[row.group] ?? row.group
                            .replace(/[_-]+/g, " ")
                            .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.calls.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCost(row.costUsd)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                        No attributable feature usage.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          )
        )}
      </div>
    </div>
  );
}
