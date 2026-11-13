import "server-only";

import type { SeoCostWidget } from "@/lib/conversions/surface";
import { readUsageCosts } from "@/lib/cost-items/read";

/** The Usage page totals for this month. This does not recompute the shares. */
export async function loadDashboardSeoCost(projectPublicId: string): Promise<SeoCostWidget> {
  try {
    const view = await readUsageCosts(projectPublicId);
    return { kind: "ready", month: view.month, tiles: view.tiles };
  } catch {
    return { kind: "error" };
  }
}
