import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { BUDGET_CATEGORIES, type BudgetLineItem, type BudgetSummary, type Product } from "@/lib/types";
import { BUDGET_CATEGORY_META } from "@/lib/workspaceMeta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

function money(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export function BudgetTab({ productId, product, canEdit }: { productId: string; product: Product; canEdit: boolean }) {
  const [items, setItems] = useState<BudgetLineItem[] | null>(null);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [budgetCap, setBudgetCap] = useState(product.budget_cap != null ? String(product.budget_cap) : "");
  const [savingCap, setSavingCap] = useState(false);

  function refresh() {
    api.get<BudgetLineItem[]>(`/api/products/${productId}/workspace/budget`).then(setItems);
    api.get<BudgetSummary>(`/api/products/${productId}/workspace/budget/summary`).then(setSummary);
  }
  useEffect(refresh, [productId]);

  async function remove(id: string) {
    try {
      await api.delete(`/api/products/${productId}/workspace/budget/${id}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove line item");
    }
  }

  async function saveCap(e: FormEvent) {
    e.preventDefault();
    setSavingCap(true);
    try {
      await api.patch(`/api/products/${productId}/workspace/budget-cap`, {
        budget_cap: budgetCap.trim() ? Number(budgetCap) : null,
      });
      refresh();
      toast.success("Budget cap updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update budget cap");
    } finally {
      setSavingCap(false);
    }
  }

  if (items === null || summary === null) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  const variance = summary.total_actual - summary.total_planned;
  const capUsedPct = summary.budget_cap ? Math.min(100, (summary.total_actual / summary.budget_cap) * 100) : null;
  const maxCategoryAmount = Math.max(1, ...summary.by_category.flatMap((c) => [c.planned, c.actual]));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Total planned" value={money(summary.total_planned)} />
        <StatTile label="Total actual" value={money(summary.total_actual)} />
        <StatTile
          label="Variance"
          value={`${variance >= 0 ? "+" : ""}${money(variance)}`}
          tone={variance > 0 ? "bad" : variance < 0 ? "good" : "neutral"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Budget cap</CardTitle>
          <CardDescription>Optional overall ceiling for this product's spend.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {capUsedPct !== null && (
            <div className="flex flex-col gap-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", capUsedPct >= 100 ? "bg-red-500" : "bg-primary")}
                  style={{ width: `${capUsedPct}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {money(summary.total_actual)} of {money(summary.budget_cap!)} spent ({capUsedPct.toFixed(0)}%)
              </span>
            </div>
          )}
          {canEdit ? (
            <form onSubmit={saveCap} className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="No cap set"
                value={budgetCap}
                onChange={(e) => setBudgetCap(e.target.value)}
                className="w-40"
              />
              <Button type="submit" size="sm" disabled={savingCap}>
                Save
              </Button>
            </form>
          ) : (
            summary.budget_cap === null && <p className="text-sm text-muted-foreground">No budget cap set.</p>
          )}
        </CardContent>
      </Card>

      {summary.by_category.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">By category</CardTitle>
            <CardDescription>Planned vs. actual spend per category.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {summary.by_category.map((c) => (
              <div key={c.category} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={cn("rounded-full border px-2 py-0.5", BUDGET_CATEGORY_META[c.category].badge)}>
                    {BUDGET_CATEGORIES.find((b) => b.key === c.category)?.label}
                  </span>
                  <span className="text-muted-foreground">
                    {money(c.actual)} / {money(c.planned)} planned
                  </span>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-border"
                    style={{ width: `${(c.planned / maxCategoryAmount) * 100}%` }}
                  />
                  <div
                    className={cn("absolute inset-y-0 left-0 rounded-full", c.actual > c.planned ? "bg-red-500" : "bg-primary")}
                    style={{ width: `${(c.actual / maxCategoryAmount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-sm">Line items</CardTitle>
            <CardDescription>{canEdit ? "PM-only edit — everyone else sees this read-only." : "Read-only — only the PM can edit the budget."}</CardDescription>
          </div>
          {canEdit && !adding && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add line item
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {adding && (
            <BudgetItemForm
              productId={productId}
              onDone={() => {
                setAdding(false);
                refresh();
              }}
            />
          )}
          {items.length === 0 && !adding ? (
            <p className="text-sm text-muted-foreground">No budget line items yet.</p>
          ) : (
            items.map((i) =>
              editingId === i.id ? (
                <BudgetItemForm
                  key={i.id}
                  productId={productId}
                  existing={i}
                  onDone={() => {
                    setEditingId(null);
                    refresh();
                  }}
                />
              ) : (
                <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs", BUDGET_CATEGORY_META[i.category].badge)}>
                      {BUDGET_CATEGORIES.find((c) => c.key === i.category)?.label}
                    </span>
                    <span className="truncate font-medium">{i.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {money(i.actual_amount, i.currency)} / {money(i.planned_amount, i.currency)}
                    </span>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(i.id)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(i.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ),
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "bad" | "neutral" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1 text-lg font-semibold tabular-nums",
            tone === "good" && "text-emerald-500",
            tone === "bad" && "text-red-500",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function BudgetItemForm({
  productId,
  existing,
  onDone,
}: {
  productId: string;
  existing?: BudgetLineItem;
  onDone: () => void;
}) {
  const [category, setCategory] = useState(existing?.category ?? "OTHER");
  const [name, setName] = useState(existing?.name ?? "");
  const [planned, setPlanned] = useState(existing ? String(existing.planned_amount) : "");
  const [actual, setActual] = useState(existing ? String(existing.actual_amount) : "0");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !planned.trim()) return;
    setBusy(true);
    try {
      const body = {
        category,
        name,
        planned_amount: Number(planned),
        actual_amount: Number(actual || 0),
      };
      if (existing) {
        await api.patch(`/api/products/${productId}/workspace/budget/${existing.id}`, body);
      } else {
        await api.post(`/api/products/${productId}/workspace/budget`, body);
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save line item");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
      <Select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="sm:w-44">
        {BUDGET_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </Select>
      <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="sm:flex-1" />
      <Input type="number" placeholder="Planned" value={planned} onChange={(e) => setPlanned(e.target.value)} className="sm:w-28" />
      <Input type="number" placeholder="Actual" value={actual} onChange={(e) => setActual(e.target.value)} className="sm:w-28" />
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" disabled={busy}>
          {existing ? "Save" : "Add"}
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onDone}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </form>
  );
}
