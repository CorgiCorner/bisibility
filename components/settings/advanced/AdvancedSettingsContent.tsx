"use client";

import {
  type BackupExportAction,
  BackupExportCard,
} from "@/components/settings/advanced/BackupExportCard";
import {
  type DeleteProjectAction,
  DeleteProjectCard,
} from "@/components/settings/advanced/DeleteProjectCard";
import { RecentAuditCard } from "@/components/settings/advanced/RecentAuditCard";
import {
  type ProjectMigrationAction,
  SelfHostMigrationCard,
} from "@/components/settings/advanced/SelfHostMigrationCard";
import type { AuditEntry } from "@/lib/queries/audit";

type AdvancedProject = {
  domain: string;
  name: string;
  projectId: string;
  writeMode: "active" | "migration_hold" | "migrated";
};

export type AdvancedSettingsActions = {
  cancelMigration?: ProjectMigrationAction;
  deleteProject?: DeleteProjectAction;
  enableMigrationHold?: ProjectMigrationAction;
  exportBackup?: BackupExportAction;
  markProjectMigrated?: ProjectMigrationAction;
  reactivateProject?: ProjectMigrationAction;
  releaseMigrationHold?: ProjectMigrationAction;
};

export type AdvancedSettingsContentProps = {
  actions: AdvancedSettingsActions;
  auditEntries: readonly AuditEntry[] | null;
  canDeleteProject: boolean;
  canManageMigration: boolean;
  defaultMigrationTargetOrigin?: string;
  deployment: "cloud" | "self-host";
  project: AdvancedProject;
};

export function AdvancedSettingsContent({
  actions,
  auditEntries,
  canDeleteProject,
  canManageMigration,
  defaultMigrationTargetOrigin = "",
  deployment,
  project,
}: Readonly<AdvancedSettingsContentProps>) {
  return (
    <div className="flex max-w-[760px] flex-col gap-3.5" data-advanced-settings="">
      {auditEntries ? (
        <RecentAuditCard entries={auditEntries} projectId={project.projectId} />
      ) : null}
      {deployment === "cloud" ? (
        <BackupExportCard exportBackup={actions.exportBackup} projectId={project.projectId} />
      ) : (
        <SelfHostMigrationCard
          actions={actions}
          canManage={canManageMigration}
          defaultTargetOrigin={defaultMigrationTargetOrigin}
          domain={project.domain}
          projectId={project.projectId}
          projectName={project.name}
          writeMode={project.writeMode}
        />
      )}
      {canDeleteProject && actions.deleteProject ? (
        <DeleteProjectCard
          deleteProject={actions.deleteProject}
          domain={project.domain}
          projectId={project.projectId}
        />
      ) : null}
    </div>
  );
}
