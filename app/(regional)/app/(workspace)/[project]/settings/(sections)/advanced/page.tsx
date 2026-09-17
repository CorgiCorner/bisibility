import { deleteWorkspace } from "@/app/(regional)/app/(workspace)/[project]/settings/actions";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { AdvancedSettingsContent } from "@/components/settings/advanced/AdvancedSettingsContent";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { exportCloudImportPackage } from "@/lib/actions/cloud";
import {
  cancelMigration,
  enableMigrationHold,
  markProjectMigrated,
  reactivateProject,
  releaseMigrationHold,
} from "@/lib/actions/project-write-mode";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction, canReadProjectAudit } from "@/lib/auth/capabilities";
import { deploymentMode } from "@/lib/deployment/deployment";
import { configuredMigrationTargetOrigin } from "@/lib/migration/target-origin";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getAuditLogView } from "@/lib/queries/audit";
import { trackedProjectDomain } from "@/lib/schemas/project";

type AdvancedSettingsPageProps = { params: Promise<{ project: string }> };

export default async function AdvancedSettingsPage({
  params,
}: Readonly<AdvancedSettingsPageProps>) {
  const { project: projectRef } = await params;
  const [access, runtime] = await Promise.all([
    requireReadableProject(projectRef),
    resolveRegionalDocumentLocale(),
  ]);
  const role = getProjectRole(access.actor, access.project.id);
  const canManageMigration = canProjectAction(role, "manage", "project");
  const canDeleteProject =
    access.project.writeMode === "active" && canProjectAction(role, "delete", "project");
  const canReadAudit = canReadProjectAudit(role);
  const deployment = deploymentMode();
  const audit = canReadAudit ? await getAuditLogView(access.project.publicId) : null;
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectSettingsShell",
    "projectSettingsAdvanced",
    "projectSettingsMigration",
  ]);
  const actions = {
    cancelMigration: deployment === "self-host" && canManageMigration ? cancelMigration : undefined,
    deleteProject: canDeleteProject ? deleteWorkspace : undefined,
    enableMigrationHold:
      deployment === "self-host" && canManageMigration ? enableMigrationHold : undefined,
    exportBackup: deployment === "cloud" ? exportCloudImportPackage : undefined,
    markProjectMigrated:
      deployment === "self-host" && canManageMigration ? markProjectMigrated : undefined,
    reactivateProject:
      deployment === "self-host" && canManageMigration ? reactivateProject : undefined,
    releaseMigrationHold:
      deployment === "self-host" && canManageMigration ? releaseMigrationHold : undefined,
  };

  return (
    <SettingsShell activeSection="advanced" projectRef={access.project.publicId}>
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        <div data-settings-section-slot="advanced">
          <AdvancedSettingsContent
            actions={actions}
            auditEntries={audit?.authorized ? audit.entries.slice(0, 5) : null}
            canDeleteProject={canDeleteProject}
            canManageMigration={canManageMigration}
            defaultMigrationTargetOrigin={
              deployment === "self-host" ? configuredMigrationTargetOrigin() : undefined
            }
            deployment={deployment}
            project={{
              domain: trackedProjectDomain(access.project.domain) ?? "",
              name: access.project.name,
              projectId: access.project.publicId,
              writeMode: access.project.writeMode,
            }}
          />
        </div>
      </FeatureMessagesProvider>
    </SettingsShell>
  );
}
