// Top boundary for the whole authenticated app. Everything under app/app/layout resolves
// behind it: the workspace shell (five parallel chrome queries), the account layout and the
// instance-admin layout. Before this file existed the nearest boundary was outside the app
// segment entirely, so a cold load painted no sidebar and no header at all and the arrival
// of the shell read as a full page reload.
//
// Renders the shell SHAPE, not the shell: sidebar rail, header bar, content skeleton.

import { AdminAppLoading } from "@/components/admin/pages/AdminAppLoading";
import { OverviewSkeleton } from "@/components/overview/OverviewSkeleton";
import { PageContent } from "@/components/shell/PageContent";
import { ShellSkeleton } from "@/components/shell/ShellSkeleton";
import { RETURN_TO_REQUEST_HEADER } from "@/lib/auth/return-to";
import { isSidebarCollapsed } from "@/lib/ui/sidebar-collapsed";
import { cookies, headers } from "next/headers";

export default async function AppLoading() {
  const path = (await headers()).get(RETURN_TO_REQUEST_HEADER)?.split("?")[0] ?? "";
  if (path === "/app/admin" || path.startsWith("/app/admin/"))
    return <AdminAppLoading path={path} />;
  // Same cookie the settled shell reads, so a collapsed rail does not expand and snap back.
  const collapsed = isSidebarCollapsed((await cookies()).get("sidebar-collapsed")?.value);

  return (
    <ShellSkeleton collapsed={collapsed}>
      <PageContent>
        <OverviewSkeleton />
      </PageContent>
    </ShellSkeleton>
  );
}
