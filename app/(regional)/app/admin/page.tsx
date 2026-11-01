import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { getInstanceAdminEmailAllowance } from "@/lib/email/allowance";
import { getInstanceAdminDashboard } from "@/lib/queries/instance-admin";
import { instanceUsagePeriod } from "@/lib/queries/instance-usage-period";

export const revalidate = 60;

export default async function InstanceAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ usagePeriod?: string }>;
} = {}) {
  await requireInstanceAdmin();
  const period = instanceUsagePeriod((await searchParams)?.usagePeriod);
  const [data, emailAllowance] = await Promise.all([
    getInstanceAdminDashboard(new Date(), period),
    getInstanceAdminEmailAllowance(),
  ]);

  return <AdminDashboard data={data} emailAllowance={emailAllowance} />;
}
