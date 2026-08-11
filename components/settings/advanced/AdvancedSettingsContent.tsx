"use client";

import { AdvancedCardFrame } from "@/components/settings/advanced/AdvancedCardFrame";
import {
  type BackupExportAction,
  BackupExportCard,
} from "@/components/settings/advanced/BackupExportCard";
import {
  type DeleteProjectAction,
  DeleteProjectCard,
} from "@/components/settings/advanced/DeleteProjectCard";
import {
  HostedMoveCard,
  type RollbackHostedMigrationAction,
  type StartHostedMigrationAction,
} from "@/components/settings/advanced/HostedMoveCard";
import { RecentAuditCard } from "@/components/settings/advanced/RecentAuditCard";
import {
  type ProjectMigrationAction,
  SelfHostMigrationCard,
} from "@/components/settings/advanced/SelfHostMigrationCard";
import type { SelfHostMigrationState } from "@/lib/deployment/project-write-mode";
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
  rollbackHostedMigration?: RollbackHostedMigrationAction;
  startHostedMigration?: StartHostedMigrationAction;
};

export type AdvancedSettingsContentProps = {
  actions: AdvancedSettingsActions;
  auditEntries: readonly AuditEntry[] | null;
  canDeleteProject: boolean;
  canManageMigration: boolean;
  defaultMigrationTargetOrigin?: string;
  deployment: "cloud" | "self-host";
  migration: SelfHostMigrationState | null;
  project: AdvancedProject;
};

export function AdvancedSettingsContent({
  actions,
  auditEntries,
  canDeleteProject,
  canManageMigration,
  defaultMigrationTargetOrigin = "",
  deployment,
  migration,
  project,
}: Readonly<AdvancedSettingsContentProps>) {
  return (
    <div className="flex max-w-[760px] flex-col gap-[14px]" data-advanced-settings="">
      {auditEntries ? (
        <RecentAuditCard entries={auditEntries} projectId={project.projectId} />
      ) : null}
      {deployment === "cloud" ? (
        <>
          <BackupExportCard exportBackup={actions.exportBackup} projectId={project.projectId} />
          {migration ? (
            <HostedMoveCard
              canManage={canManageMigration}
              migration={migration}
              projectId={project.projectId}
              rollbackHostedMigration={actions.rollbackHostedMigration}
              startHostedMigration={actions.startHostedMigration}
            />
          ) : (
            <AdvancedCardFrame
              description="The hosted migration state could not be loaded. Reload the page before starting a move."
              id="hosted-move-unavailable"
              title="Move to self-host"
            >
              <p className="m-0 text-[12.5px] text-fg-muted">Migration controls are unavailable.</p>
            </AdvancedCardFrame>
          )}
        </>
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
