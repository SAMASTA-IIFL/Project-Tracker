import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { currentRole } from "@/lib/roles";
import type { ProductDetail } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { ModuleNav } from "@/components/ModuleNav";
import { Tabs } from "@/components/ui/tabs";
import { TaskBreakdownTab } from "@/components/planning/TaskBreakdownTab";
import { TechInfraTab } from "@/components/planning/TechInfraTab";
import { BudgetTab } from "@/components/planning/BudgetTab";
import { ArchitectureBoardTab } from "@/components/planning/ArchitectureBoardTab";

type WorkspaceTab = "tasks" | "board" | "tech" | "budget";

const TABS: { key: WorkspaceTab; label: string }[] = [
  { key: "tasks", label: "Task Breakdown" },
  { key: "board", label: "Architecture Board" },
  { key: "tech", label: "Tech & Infra" },
  { key: "budget", label: "Budget" },
];

export function PlanningPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!id) return;
    api.get<ProductDetail>(`/api/products/${id}`).then(setProduct);
  }, [id]);

  const activeTab = (searchParams.get("tab") as WorkspaceTab | null) ?? "tasks";
  const role = currentRole(product, user?.id);
  // Tech/Infra and the Architecture Board are edited by whoever owns this data
  // day to day (PM or Delivery), same gate the Diagrams module already uses.
  // Budget is more sensitive and stays PM-only — decided up front, not a guess.
  const canEditWorkspace = role === "PM" || role === "DELIVERY";
  const canEditBudget = role === "PM";

  function setTab(tab: WorkspaceTab) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  }

  if (!product) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <ModuleNav productId={id!} productName={product.name} active="planning" />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-title-3">Planning</h1>
          <Tabs tabs={TABS} active={activeTab} onChange={setTab} />
        </div>

        {activeTab === "tasks" && <TaskBreakdownTab productId={id!} product={product} />}
        {activeTab === "board" && <ArchitectureBoardTab productId={id!} canEdit={canEditWorkspace} />}
        {activeTab === "tech" && <TechInfraTab productId={id!} canEdit={canEditWorkspace} />}
        {activeTab === "budget" && <BudgetTab productId={id!} product={product} canEdit={canEditBudget} />}
      </div>
    </AppShell>
  );
}
