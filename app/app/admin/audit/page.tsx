import { AdminAuditTable } from "@/components/admin/AdminAuditTable";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { getInstanceAdminAuditPage } from "@/lib/queries/instance-admin-audit";

type InstanceAdminAuditPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InstanceAdminAuditPage({
  searchParams,
}: Readonly<InstanceAdminAuditPageProps>) {
  await requireInstanceAdmin();
  const params = await searchParams;
  const audit = await getInstanceAdminAuditPage({
    cursor: first(params?.cursor),
    filter: first(params?.filter),
  });

  return <AdminAuditTable {...audit} />;
}
