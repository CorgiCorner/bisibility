import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { getInstanceAdminDashboard } from "@/lib/queries/instance-admin";

export const revalidate = 60;

export default async function InstanceAdminPage() {
  await requireInstanceAdmin();
  const data = await getInstanceAdminDashboard();

  return <AdminDashboard data={data} />;
}
