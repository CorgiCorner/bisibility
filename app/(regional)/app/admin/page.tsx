import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { getInstanceAdminEmailAllowance } from "@/lib/email/allowance";
import { getInstanceAdminDashboard } from "@/lib/queries/instance-admin";

export const revalidate = 60;

export default async function InstanceAdminPage() {
  await requireInstanceAdmin();
  const [data, emailAllowance] = await Promise.all([
    getInstanceAdminDashboard(),
    getInstanceAdminEmailAllowance(),
  ]);

  return <AdminDashboard data={data} emailAllowance={emailAllowance} />;
}
