import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { getResolvedDateFormat } from "@/lib/dates/request";
import { getInstanceAdminDashboard } from "@/lib/queries/instance-admin";

export const revalidate = 60;

export default async function InstanceAdminPage() {
  await requireInstanceAdmin();
  const [data, { resolved: dateFormat }] = await Promise.all([
    getInstanceAdminDashboard(),
    getResolvedDateFormat(),
  ]);

  return <AdminDashboard data={data} dateFormat={dateFormat} />;
}
