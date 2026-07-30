import { AlertsSetupEmpty } from "@/components/alerts/AlertsEmptyStates";
import { AlertsPageContent } from "@/components/alerts/AlertsPageContent";
import { PageContent } from "@/components/shell/PageContent";
import {
  createAlertRule,
  deleteAlertRule,
  deleteWebhookEndpoint,
  setAlertRuleEnabled,
  testWebhookEndpoint,
  updateAlertRule,
  upsertWebhookEndpoint,
} from "@/lib/actions/alerts";
import { alertTemplates } from "@/lib/alerts/alert-data";
import { getAlertFeedStats } from "@/lib/api/alert-list";
import { canProjectAction, canReadProjectAudit } from "@/lib/auth/capabilities";
import { gscInstallUrl } from "@/lib/providers/analytics/gsc-install-url";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getAlertsView } from "@/lib/queries/alerts";
import { isProviderConnected } from "@/lib/queries/integrations";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { notFound } from "next/navigation";

const alertActions = {
  createAlertRuleAction: createAlertRule,
  deleteAlertRuleAction: deleteAlertRule,
  deleteWebhookEndpointAction: deleteWebhookEndpoint,
  setAlertRuleEnabledAction: setAlertRuleEnabled,
  testWebhookEndpointAction: testWebhookEndpoint,
  upsertWebhookEndpointAction: upsertWebhookEndpoint,
  updateAlertRuleAction: updateAlertRule,
};

type AlertsPageProps = {
  params: Promise<{ project: string }>;
};

export default async function AlertsPage({ params }: Readonly<AlertsPageProps>) {
  const { project } = await params;
  const access = await resolveProjectAccess(project);
  const workspaces = await listWorkspaces();
  const active = workspaces.find((workspace) => workspace.id === access.publicId);
  if (!active) {
    notFound();
  }

  const [view, feedStats, gscConnected] = await Promise.all([
    getAlertsView(active.id),
    getAlertFeedStats(access.projectId),
    isProviderConnected(active.id, "gsc"),
  ]);
  const canCreateKeyword = canProjectAction(active.role, "create", "keyword");

  if (active.keywordCount === 0 && view.rules.length === 0 && feedStats.totalCount === 0) {
    return (
      <PageContent>
        <AlertsSetupEmpty canCreateKeyword={canCreateKeyword} projectRef={access.publicId} />
      </PageContent>
    );
  }

  return (
    <PageContent className="flex flex-col gap-5">
      <AlertsPageContent
        actions={alertActions}
        alerts={view.alerts}
        canCreate={canProjectAction(active.role, "create", "alert_rule")}
        canDelete={canProjectAction(active.role, "delete", "alert_rule")}
        canManage={canProjectAction(active.role, "manage", "webhook_endpoint")}
        canReadAudit={canReadProjectAudit(active.role)}
        canUpdate={canProjectAction(active.role, "update", "alert_rule")}
        firedInWindowCount={feedStats.firedInWindowCount}
        gscConnected={gscConnected}
        gscInstallHref={gscInstallUrl(active.id)}
        hasTrackedKeywords={active.keywordCount > 0}
        projectDomain={view.project.domain}
        projectId={view.project.id}
        projectRef={access.publicId}
        rules={view.rules}
        snoozedInWindowCount={feedStats.snoozedInWindowCount}
        targets={view.targets}
        templates={alertTemplates}
      />
    </PageContent>
  );
}
