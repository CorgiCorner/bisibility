import { ApiKeysSection } from "@/components/settings/api-keys/ApiKeysSection";
import { UsageBillingSection } from "@/components/settings/billing/UsageBillingSection";
import { DangerZone } from "@/components/settings/danger/DangerZone";
import { DefaultsSection } from "@/components/settings/defaults/DefaultsSection";
import { NotificationPreferences } from "@/components/settings/notifications/NotificationPreferences";
import { PresenceInspectionBudget } from "@/components/settings/providers/PresenceInspectionBudget";
import { ProviderUsage } from "@/components/settings/providers/ProviderUsage";
import { TagsSegments } from "@/components/settings/tags/TagsSegments";
import { TeamRoles } from "@/components/settings/team/TeamRoles";
import { DeployWebhooksSection } from "@/components/settings/webhooks/DeployWebhooksSection";
import { ProjectDetails } from "@/components/settings/workspace/ProjectDetails";
import { PageContent } from "@/components/shell/PageContent";
import { issueApiKey, regenerateApiKey, revokeApiKey } from "@/lib/actions/apiKey";
import { updateWorkspaceBudgetAction } from "@/lib/actions/budget";
import {
  createIngestHook,
  deleteIngestHook,
  disableIngestHook,
  rotateIngestHook,
  sendIngestHookTest,
} from "@/lib/actions/ingest-hooks";
import {
  cancelMigration,
  enableMigrationHold,
  markProjectMigrated,
  reactivateProject,
  releaseMigrationHold,
} from "@/lib/actions/project-write-mode";
import { updateProjectSchedule } from "@/lib/actions/schedule";
import { createTagResult, deleteTagResult, renameTagResult } from "@/lib/actions/tags";
import {
  changeMemberRole,
  inviteMember,
  removeMember,
  resendInvite,
  revokeInvite,
  transferOwnership,
} from "@/lib/actions/team";
import { absoluteUrl, getOriginFromHeaders } from "@/lib/agent-ready/origin";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction, canReadProjectAudit } from "@/lib/auth/capabilities";
import { requireSession } from "@/lib/auth/session";
import { isCloud, isSelfHost } from "@/lib/deployment/deployment";
import { configuredMigrationTargetOrigin } from "@/lib/migration/target-origin";
import { getQueryActor, resolveProjectAccess } from "@/lib/queries/_auth";
import { getPreferences } from "@/lib/queries/account";
import { getIngestHooks } from "@/lib/queries/ingest-hooks";
import { getNotificationPreferences } from "@/lib/queries/notification-prefs";
import { getSettings } from "@/lib/queries/settings";
import { getTeamAccess } from "@/lib/queries/team";
import { appPath } from "@/lib/routing/app-path";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { headers } from "next/headers";
import Link from "next/link";
import { deleteWorkspace, submitBillingInterest, updateProject } from "./actions";

type SettingsPageProps = {
  params: Promise<{ project: string }>;
};

export default async function SettingsPage({ params }: Readonly<SettingsPageProps>) {
  const { project } = await params;
  const { projectId, publicId } = await resolveProjectAccess(project);
  const preferences = await getPreferences();
  const [settings, actor] = await Promise.all([
    getSettings(publicId, { preferences }),
    getQueryActor(),
  ]);
  const role = getProjectRole(actor, projectId);
  const canUpdateProject = canProjectAction(role, "update", "project");
  const canUpdateDefaults = canProjectAction(role, "update", "project_defaults");
  const canUpdateNotifications = canProjectAction(role, "update", "notification_preference");
  const canCreateTag = canProjectAction(role, "create", "keyword");
  const canUpdateTag = canProjectAction(role, "update", "keyword");
  const canDeleteTag = canProjectAction(role, "delete", "keyword");
  const canManageWorkspace = canProjectAction(role, "manage", "project");
  const canReadAudit = canReadProjectAudit(role);
  const canManageBilling = canProjectAction(role, "manage", "billing");
  const canDeleteWorkspace = canProjectAction(role, "delete", "project");
  const isNewWorkspace = settings.defaults.keywordCount === 0 && settings.providers.length === 0;
  const projectReadOnly = settings.project.writeMode !== "active";
  const defaultMigrationTargetOrigin = isCloud ? "" : configuredMigrationTargetOrigin();

  const headerStore = await headers();
  const endpointUrl = absoluteUrl(getOriginFromHeaders(headerStore), "/api/ingest/deploy");
  const session = await requireSession();
  const [notificationPreferences, teamAccess, ingestHooks] = await Promise.all([
    getNotificationPreferences(publicId),
    getTeamAccess(publicId),
    getIngestHooks(publicId, { preferences }),
  ]);

  // Same predicate updateWorkspaceBudgetAction enforces server-side via
  // requireProjectScope(actor, "manage", ...); see canManageWorkspace.
  async function submitWorkspaceBudget(capCents: number) {
    "use server";
    return updateWorkspaceBudgetAction({ capCents, projectId: publicId });
  }

  return (
    <PageContent className="flex flex-col gap-[30px]" variant="form">
      {isNewWorkspace ? (
        <EmptyWorkspaceNotice
          domainMissing={!trackedProjectDomain(settings.project.domain)}
          keywordsHref={appPath(publicId, "keywords")}
        />
      ) : null}
      <ProjectDetails
        canEdit={canUpdateProject}
        project={settings.project}
        updateProject={updateProject}
      />
      <DefaultsSection
        canEdit={canUpdateDefaults}
        defaults={settings.defaults}
        projectId={settings.project.projectId}
        updateSchedule={updateProjectSchedule}
      />
      {canUpdateDefaults ? (
        <PresenceInspectionBudget
          dailyLimit={settings.defaults.inspectionDailyLimit}
          projectId={settings.project.projectId}
          targetUrlCount={settings.defaults.targetUrlCount}
        />
      ) : null}
      <ApiKeysSection
        apiKeys={settings.apiKeys}
        issueKey={canManageWorkspace ? issueApiKey : undefined}
        projectId={settings.project.projectId}
        regenerateKey={canManageWorkspace ? regenerateApiKey : undefined}
        revokeKey={canManageWorkspace ? revokeApiKey : undefined}
      />
      <DeployWebhooksSection
        createHook={canManageWorkspace ? createIngestHook : undefined}
        deleteHook={canManageWorkspace ? deleteIngestHook : undefined}
        disableHook={canManageWorkspace ? disableIngestHook : undefined}
        endpointUrl={endpointUrl}
        hooks={ingestHooks}
        projectId={settings.project.projectId}
        rotateHook={canManageWorkspace ? rotateIngestHook : undefined}
        sendTestHook={canManageWorkspace ? sendIngestHookTest : undefined}
      />
      <NotificationPreferences
        canEdit={canUpdateNotifications}
        preferences={notificationPreferences}
      />
      <TagsSegments
        createTag={canCreateTag && !projectReadOnly ? createTagResult : undefined}
        deleteTag={canDeleteTag && !projectReadOnly ? deleteTagResult : undefined}
        projectId={settings.project.projectId}
        readOnly={projectReadOnly}
        renameTag={canUpdateTag && !projectReadOnly ? renameTagResult : undefined}
        tags={settings.tags}
      />
      <ProviderUsage
        editBudget={{ canEdit: canManageWorkspace, submit: submitWorkspaceBudget }}
        showCostCalculatorLink={!isSelfHost}
        usage={settings.usage}
      />
      {canManageBilling ? (
        <UsageBillingSection
          email={session.user.email}
          projectId={settings.project.projectId}
          submitInterest={submitBillingInterest}
          variant={isCloud ? "cloud-beta" : "self-host"}
        />
      ) : null}
      <TeamRoles
        canManageTeam={canManageWorkspace && teamAccess.canManageTeam}
        canTransferOwnership={
          canProjectAction(role, "manage", "ownership") && teamAccess.canTransferOwnership
        }
        changeMemberRole={changeMemberRole}
        domain={settings.project.domain}
        inviteMember={inviteMember}
        members={teamAccess.members}
        pendingInvites={teamAccess.pendingInvites}
        projectId={settings.project.projectId}
        removeMember={removeMember}
        resendInvite={resendInvite}
        revokeInvite={revokeInvite}
        transferOwnership={transferOwnership}
      />
      <DangerZone
        cancelMigration={cancelMigration}
        canDeleteProject={canDeleteWorkspace}
        canManageMigration={canManageWorkspace}
        canReadAudit={canReadAudit}
        defaultMigrationTargetOrigin={defaultMigrationTargetOrigin}
        deleteWorkspace={deleteWorkspace}
        domain={settings.project.domain}
        enableMigrationHold={enableMigrationHold}
        markProjectMigrated={markProjectMigrated}
        migrationHold={settings.project.writeMode === "migration_hold"}
        projectId={settings.project.projectId}
        reactivateProject={reactivateProject}
        releaseMigrationHold={releaseMigrationHold}
        direction={isCloud ? "to-self-host" : "to-cloud"}
        showInstanceMigration
        writeMode={settings.project.writeMode}
      />
    </PageContent>
  );
}

/** Onboarding guidance carried over from the removed empty-project screen. */
function EmptyWorkspaceNotice({
  domainMissing,
  keywordsHref,
}: Readonly<{ domainMissing: boolean; keywordsHref: string }>) {
  return (
    <section>
      <div className="rounded-[14px] border border-accent bg-bg-elev px-5 py-[18px]">
        <div className="text-[14.5px] font-semibold">This project is empty</div>
        <p className="m-0 mt-[3px] text-[12.5px] leading-normal text-fg-muted">
          {domainMissing
            ? "Set the domain below - it defines what bisibility tracks - then add keywords."
            : "Add keywords to start tracking this domain."}
        </p>
        <Link
          className="mt-3 inline-flex min-h-9 items-center rounded-[9px] border border-border-strong bg-bg-elev px-3.5 text-[12.5px] font-semibold text-fg hover:border-accent hover:text-accent-text"
          href={keywordsHref}
        >
          Add keywords
        </Link>
      </div>
    </section>
  );
}
