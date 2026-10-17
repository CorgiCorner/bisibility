import { loadWorkspaceBudgetSummary } from "@/lib/queries/workspace-budget-summary";
import type { ProjectRef } from "@/lib/routing/app-path";
import { HeaderProviderSpend } from "./HeaderProviderSpend";

/** Isolated optional chrome: no budget request is awaited by the workspace shell. */
export async function HeaderProviderSpendData({
  projectRef,
}: Readonly<{ projectRef: ProjectRef }>) {
  return (
    <HeaderProviderSpend
      projectRef={projectRef}
      summary={await loadWorkspaceBudgetSummary(projectRef)}
    />
  );
}

/** Same 24px pill geometry, visibility and semantic tokens as the loaded header. */
export function HeaderProviderSpendSkeleton() {
  return (
    <div
      aria-hidden
      className="hidden max-w-56 shrink-0 self-center md:flex md:items-center"
      data-testid="header-budget-loading"
    >
      <div className="h-6 w-28 rounded-full bg-bg-sunken motion-safe:animate-pulse" />
    </div>
  );
}
