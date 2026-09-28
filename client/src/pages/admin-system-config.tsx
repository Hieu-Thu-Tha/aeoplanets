import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pencil, X } from "lucide-react";
import { format } from "date-fns";
import { PageHeading } from "@/components/ui/enterprise";

interface SystemConfigRow {
  key: string;
  value: unknown;
  cacheMaxDurationSecs: number | null;
  updatedAt: string;
  isStale: boolean;
}

function freshnessLabel(secs: number | null): string {
  if (secs == null) return "manual (never auto-refreshes)";
  if (secs % 3600 === 0) return `auto-refresh every ${secs / 3600}h`;
  if (secs % 60 === 0) return `auto-refresh every ${secs / 60}m`;
  return `auto-refresh every ${secs}s`;
}

export default function AdminSystemConfigPage() {
  const { toast } = useToast();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftJson, setDraftJson] = useState("");

  const { data, isLoading } = useQuery<{ entries: SystemConfigRow[] }>({
    queryKey: ["/api/super-admin/system-config"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      return apiRequest("PUT", `/api/super-admin/system-config/${encodeURIComponent(key)}`, { value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/system-config"] });
      setEditingKey(null);
      toast({ title: "Config updated", description: "The new value is live immediately." });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error.message.replace(/^\d+:\s*/, ""),
      });
    },
  });

  const startEdit = (row: SystemConfigRow) => {
    setEditingKey(row.key);
    setDraftJson(JSON.stringify(row.value, null, 2));
  };

  const saveEdit = (key: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draftJson);
    } catch {
      toast({ variant: "destructive", title: "Invalid JSON", description: "Fix the syntax before saving." });
      return;
    }
    updateMutation.mutate({ key, value: parsed });
  };

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <PageHeading
        title="System Config"
        subtitle={<>Dynamic runtime configuration (model pricing, FX rate, …) — editable live, unlike fixed .env settings. Changes take effect immediately without a redeploy.</>}
        headingClassName="text-2xl font-bold"
        subtitleClassName="text-sm text-muted-foreground mt-1"
      />

      <Card>
        <CardHeader>
          <CardTitle>Config entries</CardTitle>
          <CardDescription>
            Values are validated against each key's schema on save. Entries with an auto-refresh window
            re-fetch from their source when read after going stale.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Freshness</TableHead>
                  <TableHead>Last updated</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.entries ?? []).map((row) => (
                  <TableRow key={row.key} data-testid={`config-row-${row.key}`}>
                    <TableCell className="font-mono text-sm align-top">{row.key}</TableCell>
                    <TableCell className="align-top max-w-md">
                      {editingKey === row.key ? (
                        <div className="space-y-2">
                          <Textarea
                            value={draftJson}
                            onChange={(e) => setDraftJson(e.target.value)}
                            className="font-mono text-xs min-h-32"
                            data-testid={`config-edit-${row.key}`}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveEdit(row.key)}
                              disabled={updateMutation.isPending}
                              data-testid={`config-save-${row.key}`}
                            >
                              {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/50 rounded p-2 max-h-40 overflow-y-auto">
                          {JSON.stringify(row.value, null, 2)}
                        </pre>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-sm text-muted-foreground">
                      {freshnessLabel(row.cacheMaxDurationSecs)}
                      {row.isStale && <Badge variant="outline" className="ml-2 text-amber-500 border-amber-500">stale</Badge>}
                    </TableCell>
                    <TableCell className="align-top text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(row.updatedAt), "d MMM yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="align-top">
                      {editingKey !== row.key && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(row)}
                          data-testid={`config-edit-button-${row.key}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
