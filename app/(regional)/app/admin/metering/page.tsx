import { AdminMeteringFilters } from "@/components/admin/AdminMeteringFilters";
import { AdminMeteringFrame } from "@/components/admin/AdminMeteringFrame";
import { AdminMeteringView } from "@/components/admin/AdminMeteringView";
import { AdminRecoveryConsole } from "@/components/admin/recovery/AdminRecoveryConsole";
import { getMeteringAdminPage } from "@/lib/metering/admin-service";
import { getRecoveryLanding } from "@/lib/metering/recovery/service";
export default async function MeteringPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const incidents = first(input?.tab) === "incidents";
  const page = incidents
    ? null
    : await getMeteringAdminPage({ month: first(input?.month), project: first(input?.project) });
  const recovery = incidents ? await getRecoveryLanding() : null;
  return (
    <AdminMeteringFrame incidents={incidents}>
      {page && (
        <>
          <AdminMeteringFilters
            {...page}
            projects={page.data?.projects ?? []}
            projectNames={page.data?.references?.projects}
          />
          <AdminMeteringView data={page.data} month={page.month} project={page.project} />
        </>
      )}
      {incidents && <AdminRecoveryConsole initial={recovery} />}
    </AdminMeteringFrame>
  );
}
