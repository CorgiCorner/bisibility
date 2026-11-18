import { InstanceFeatures } from "@/components/admin/InstanceFeatures";
import { AdminRouteFrame } from "@/components/admin/pages/AdminRouteFrame";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { projectSeoChallengeEnabled } from "@/lib/challenge-report/feature";
import { readDemoConfig } from "@/lib/demo/config";

export default async function Page() {
  await requireInstanceAdmin();
  return (
    <AdminRouteFrame view="Features">
      <div className="grid gap-4">
        <InstanceFeatures
          enabled={await projectSeoChallengeEnabled()}
          editable={readDemoConfig().kind === "disabled"}
        />
      </div>
    </AdminRouteFrame>
  );
}
