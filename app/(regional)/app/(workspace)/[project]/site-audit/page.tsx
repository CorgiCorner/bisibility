import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { SiteAuditWorkspace } from "@/components/site-audit/SiteAuditWorkspace";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { readSiteAuditAction, runSiteAuditAction } from "@/lib/actions/site-audit";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { listSiteAudits, readSiteAudit } from "@/lib/site-audit/service";

export default async function SiteAuditPage({
  params,
}: Readonly<{ params: Promise<{ project: string }> }>) {
  const { project: ref } = await params;
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["shared", "projectSiteAudit"]);
  const { publicId } = await resolveProjectAccess(ref);
  const { actor, project } = await requireReadableProject(publicId);
  const history = await listSiteAudits(project.id);
  const initial = history[0] ? await readSiteAudit(project.id, history[0].id) : null;
  const canRun =
    canProjectAction(getProjectRole(actor, project.id), "create", "project") &&
    !isProjectReadOnly(project.writeMode) &&
    trackedProjectDomain(project.domain) !== null;
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent>
        <SiteAuditWorkspace
          domain={project.domain ?? ""}
          projectId={publicId}
          canRun={canRun}
          initial={initial}
          history={history}
          runAction={runSiteAuditAction}
          readAction={readSiteAuditAction}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
