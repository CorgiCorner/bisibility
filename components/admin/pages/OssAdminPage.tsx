import { extendAdminPage } from "@/components/shell/AdminPageExtension";
import { adminDangerousActionAllowed } from "@/lib/auth/admin-dangerous-action";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { loadAdminPage } from "@/lib/instance-admin/load-page";
import type { AdminPageData, AdminSearch } from "@/lib/instance-admin/page-data";
import { unstable_rethrow } from "next/navigation";
import { AdminRouteFrame } from "./AdminRouteFrame";
import { OssLivePage } from "./OssLivePage";

export async function OssAdminPage({
  view,
  searchParams,
}: {
  view: string;
  searchParams?: Promise<AdminSearch>;
}) {
  // This gate precedes parsing and all builder reads, including standalone page rendering.
  const session = await requireInstanceAdmin();
  const dangerousActionsAllowed = await adminDangerousActionAllowed(session);
  const params = (await searchParams) ?? {};
  let data: AdminPageData = {};
  let failed = false;
  try {
    data = await loadAdminPage(view, params);
  } catch (error) {
    unstable_rethrow(error);
    failed = true;
  }
  const content = (
    <OssLivePage
      view={view}
      data={data}
      failed={failed}
      dangerousActionsAllowed={dangerousActionsAllowed}
    />
  );
  return (
    <AdminRouteFrame view={view}>
      {
        await extendAdminPage({
          view,
          params,
          data,
          failed,
          dangerousActionsAllowed,
          children: content,
        })
      }
    </AdminRouteFrame>
  );
}
