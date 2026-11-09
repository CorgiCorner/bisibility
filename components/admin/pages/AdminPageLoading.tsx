import { OssPageLoading } from "@/components/admin/redesign/OssPageLoading";
import { AdminRouteFrame } from "./AdminRouteFrame";
export function AdminPageLoading({ view }: { view: string }) {
  return (
    <AdminRouteFrame view={view} loading>
      <OssPageLoading view={view} />
    </AdminRouteFrame>
  );
}
