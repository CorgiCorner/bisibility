import { AuditLogView, AuditNotAuthorized } from "@/components/audit";
import { PageContent } from "@/components/shell/PageContent";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getAuditLogView } from "@/lib/queries/audit";

type AuditSettingsPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuditSettingsPage({
  params: routeParams,
  searchParams,
}: Readonly<AuditSettingsPageProps>) {
  const { project } = await routeParams;
  const { publicId } = await resolveProjectAccess(project);
  const params = await searchParams;
  const audit = await getAuditLogView(publicId, { dateRange: params?.range });
  if (!audit.authorized) {
    return (
      <PageContent variant="form">
        <AuditNotAuthorized />
      </PageContent>
    );
  }

  return (
    <PageContent variant="analytics">
      <AuditLogView
        dateRange={audit.dateRange}
        entries={audit.entries}
        entryLimit={audit.entryLimit}
        retentionDays={audit.retentionDays}
        truncated={audit.truncated}
      />
    </PageContent>
  );
}
