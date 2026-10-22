import "server-only";

import type { PlanStatus } from "@/components/shell/plan-status";

export async function renderPlanStatusExtension(
  _input: Readonly<{ userId: string | null }>,
): Promise<PlanStatus | null> {
  return null;
}
