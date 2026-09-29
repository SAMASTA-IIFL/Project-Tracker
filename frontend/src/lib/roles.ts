import type { ProductDetail, ProductRole } from "@/lib/types";

export function currentRole(product: ProductDetail | null, userId: string | undefined): ProductRole | null {
  if (!product || !userId) return null;
  return product.members.find((m) => m.user.id === userId)?.role ?? null;
}
