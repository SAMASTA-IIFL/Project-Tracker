import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Product } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { STAGE_META } from "@/lib/stages";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    api.get<Product[]>("/api/products").then(setProducts);
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-title-3">Your products</h1>
            <p className="text-sm text-muted-foreground">
              Every product you own or contribute to, and where it stands in its lifecycle.
            </p>
          </div>
          <Link to="/products/new" className={buttonVariants({ className: "gap-1.5" })}>
            <Plus className="h-4 w-4" />
            New product
          </Link>
        </div>

        {products === null ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : products.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <CardTitle>No products yet</CardTitle>
              <CardDescription>
                Create your first product to start tracking its BRD, tasks, and progress in one place.
              </CardDescription>
              <Link to="/products/new" className={buttonVariants({ className: "mt-2" })}>
                Create a product
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => {
              const stage = STAGES.find((s) => s.key === product.current_stage);
              const meta = STAGE_META[product.current_stage];
              const Icon = meta.icon;
              return (
                <Link key={product.id} to={`/products/${product.id}`}>
                  <Card className="h-full overflow-hidden transition-colors hover:bg-card/70">
                    <div
                      className="h-1.5 w-full"
                      style={{ backgroundImage: `linear-gradient(90deg, ${meta.gradient[0]}, ${meta.gradient[1]})` }}
                    />
                    <CardHeader>
                      <CardTitle className="truncate">{product.name}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {product.description || "No description yet."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        /{product.name.toLowerCase().replace(/\s+/g, "-")}
                      </span>
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                          meta.badge,
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {stage?.label ?? product.current_stage}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
