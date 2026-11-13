import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { SiteAuditWorkspace } from "@/components/site-audit/SiteAuditWorkspace";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { checkSiteAuditVitalsAction } from "@/lib/actions/page-vitals";
import {
  cancelSiteAuditAction,
  listSiteAuditPagesAction,
  readSiteAuditAction,
  resumeSiteAuditAction,
  runSiteAuditAction,
} from "@/lib/actions/site-audit";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { readCoreWebVitalsCard } from "@/lib/pagespeed/read";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { readSiteAuditPageLimit } from "@/lib/site-audit/budget-extension";
import { listSiteAudits, readSiteAudit } from "@/lib/site-audit/service";
import { siteAuditWorkerAvailable } from "@/lib/site-audit/worker-config";

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
  const workerEnabled = await siteAuditWorkerAvailable();
  const maxPages = workerEnabled ? await readSiteAuditPageLimit(project.id) : 15;
  const canRun =
    canProjectAction(getProjectRole(actor, project.id), "create", "project") &&
    !isProjectReadOnly(project.writeMode) &&
    trackedProjectDomain(project.domain) !== null;
  const vitals = await readCoreWebVitalsCard({
    domain: project.domain ?? "",
    pages: initial?.result.pages ?? [],
    projectId: project.id,
  });
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
          workerEnabled={workerEnabled}
          maxPages={maxPages}
          initial={initial}
          history={history}
          runAction={runSiteAuditAction}
          readAction={readSiteAuditAction}
          cancelAction={cancelSiteAuditAction}
          resumeAction={resumeSiteAuditAction}
          pagesAction={listSiteAuditPagesAction}
          vitals={{ checkAction: checkSiteAuditVitalsAction, model: vitals }}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
