// Boundary for the workspace group. It sits ABOVE [project]/layout and account/layout, both
// of which render WorkspaceShell, so this fallback replaces the shell rather than sitting
// inside it - it has to draw the shell shape itself. (Per-page fallbacks below those layouts,
// e.g. [project]/keywords/loading.tsx, do render inside the settled shell and stay content-only.)
//
// It nests directly inside app/app/loading.tsx and draws the same shape, so the handover from
// one boundary to the other is invisible. Shares OverviewSkeleton with the overview page's
// Suspense fallback so cold loads and in-page data resolution look identical.

import { OverviewSkeleton } from "@/components/overview/OverviewSkeleton";
import { PageContent } from "@/components/shell/PageContent";
import { ShellSkeleton } from "@/components/shell/ShellSkeleton";
import { isSidebarCollapsed } from "@/lib/ui/sidebar-collapsed";
import { cookies } from "next/headers";

export default async function WorkspaceLoading() {
  const collapsed = isSidebarCollapsed((await cookies()).get("sidebar-collapsed")?.value);

  return (
    <ShellSkeleton collapsed={collapsed}>
      <PageContent>
        <OverviewSkeleton />
      </PageContent>
    </ShellSkeleton>
  );
}
