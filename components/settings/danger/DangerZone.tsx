"use client";

import type {
  DeleteWorkspaceInput,
  DeleteWorkspaceResult,
} from "@/app/app/(workspace)/[project]/settings/actions";
import { MigrateToCloudWizard } from "@/components/settings/migration/MigrateToCloudWizard";
import type { MigrationDirection } from "@/components/settings/migration/MigrateToCloudWizard.types";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Button, ConfirmModal } from "@/components/ui";
import { appPath } from "@/lib/routing/app-path";
import { actionErrorMessage } from "@/lib/ui/action-error";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  CaretRightIcon as CaretRight,
  CloudArrowUpIcon as CloudArrowUp,
  LifebuoyIcon as Lifebuoy,
  TrashIcon as Trash,
  WarningOctagonIcon as WarningOctagon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AuditLogCard } from "./AuditLogCard";

export type DangerZoneProps = {
  cancelMigration?: (input: { projectId: string }) => Promise<unknown>;
  canDeleteProject: boolean;
  canManageMigration: boolean;
  canReadAudit?: boolean;
  defaultMigrationTargetOrigin?: string;
  deleteWorkspace?: (input: DeleteWorkspaceInput) => Promise<DeleteWorkspaceResult>;
  direction: MigrationDirection;
  domain?: string;
  enableMigrationHold?: (input: { projectId: string }) => Promise<unknown>;
  markProjectMigrated?: (input: { projectId: string }) => Promise<unknown>;
  migrationHold?: boolean;
  projectId?: string;
  reactivateProject?: (input: { projectId: string }) => Promise<unknown>;
  releaseMigrationHold?: (input: { projectId: string }) => Promise<unknown>;
  showInstanceMigration: boolean;
  writeMode?: "active" | "migration_hold" | "migrated";
};

export function DangerZone({
  cancelMigration,
  canDeleteProject,
  canManageMigration,
  canReadAudit = false,
  defaultMigrationTargetOrigin = "",
  deleteWorkspace,
  direction,
  domain = "acme.dev",
  enableMigrationHold,
  markProjectMigrated,
  migrationHold = false,
  projectId,
  reactivateProject,
  releaseMigrationHold,
  showInstanceMigration,
  writeMode = "active",
}: Readonly<DangerZoneProps>) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<string | null>(null);
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const migrated = writeMode === "migrated";
  const confirmWord = domain || projectId || "project";
  const migrateTitle = "Transfer project";
  const migrateDescription =
    "Move this project to another bisibility instance - hosted or self-hosted. Keeps keywords, history, tags, alerts and views. Provider keys are re-entered for security.";

  function handleDelete() {
    if (!deleteWorkspace || !projectId) {
      setConfirmOpen(false);
      return;
    }
    startTransition(() => {
      void deleteWorkspace({ confirmText: confirmWord, projectId })
        .then((result) => {
          setDeleteFailure(null);
          setConfirmOpen(false);
          router.push(
            result.nextProjectPublicId
              ? appPath(result.nextProjectPublicId, "overview")
              : "/onboarding",
          );
          router.refresh();
        })
        .catch((error: unknown) => {
          setConfirmOpen(false);
          setDeleteFailure(actionErrorMessage(error, "Project could not be deleted."));
        });
    });
  }

  return (
    <>
      {canReadAudit && projectId ? <AuditLogCard projectRef={projectId} /> : null}
      {canManageMigration && showInstanceMigration && migrated ? (
        <section className="scroll-mt-6" id="migration">
          <ReactivateProjectCard projectId={projectId} reactivateProject={reactivateProject} />
        </section>
      ) : null}
      {canManageMigration && showInstanceMigration && !migrated ? (
        <section className="scroll-mt-6" id="migration">
          <button
            className="flex w-full items-center gap-3.5 rounded-[14px] border border-border bg-bg-elev px-5 py-[18px] text-left outline-none transition-colors hover:border-accent focus-visible:border-accent"
            onClick={() => setMigrateOpen(true)}
            type="button"
          >
            <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px] bg-bg-sunken text-fg">
              <CloudArrowUp aria-hidden size={22} weight="fill" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14.5px] font-semibold">{migrateTitle}</span>
                {migrationHold ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-yellow/40 bg-yellow/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.4px] text-yellow-text">
                    Migration in progress
                  </span>
                ) : null}
              </div>
              <div className="mt-[3px] text-[12.5px] text-fg-muted">{migrateDescription}</div>
            </div>
            <span className="inline-flex min-h-9 flex-none items-center gap-1.5 rounded-[9px] border border-border-strong bg-bg-elev px-3 text-[12.5px] font-semibold text-fg-muted">
              {migrationHold ? "Continue migration" : "Transfer"}
              <CaretRight aria-hidden size={13} weight="bold" />
            </span>
          </button>
        </section>
      ) : null}
      {canDeleteProject ? (
        <SettingsSection
          description="Delete this project and all tracked keywords. This cannot be undone."
          title="Danger zone"
          tone="danger"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-[14.5px] font-semibold text-red-text">Delete project</div>
            <button
              className="inline-flex min-h-9 items-center gap-2 rounded-[9px] border border-red bg-bg-elev px-3.5 text-[13px] font-semibold text-red-text hover:bg-red hover:text-error-contrast"
              onClick={() => setConfirmOpen(true)}
              type="button"
            >
              <Trash size={14} />
              Delete project
            </button>
          </div>
          {deleteFailure ? (
            <div className="mt-4 flex items-start gap-3 border-t border-red/25 pt-4">
              <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-red/10 text-red-text">
                <WarningOctagon aria-hidden size={18} weight="fill" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-fg">
                  Couldn&apos;t delete project
                </div>
                <p className="m-0 mt-[3px] text-[12.5px] leading-normal text-fg-muted">
                  {deleteFailure}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <Button
                    onClick={() => setConfirmOpen(true)}
                    startIcon={<ArrowsClockwise aria-hidden size={14} />}
                    type="button"
                    variant="destructive"
                  >
                    Try again
                  </Button>
                  <a
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-strong bg-bg-elev px-3.5 text-[12.5px] font-semibold text-fg hover:border-accent hover:text-accent-text"
                    href="mailto:support@bisibility.com?subject=Delete%20project%20failed"
                  >
                    <Lifebuoy aria-hidden size={14} />
                    Contact support
                  </a>
                  <button
                    className="p-0 text-[12.5px] font-semibold text-fg-muted hover:text-fg"
                    onClick={() => setDeleteFailure(null)}
                    type="button"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </SettingsSection>
      ) : null}
      {canDeleteProject ? (
        <ConfirmModal
          busy={isPending}
          kind="deleteProject"
          onClose={() => setConfirmOpen(false)}
          onConfirm={handleDelete}
          open={confirmOpen}
          typeWord={confirmWord}
        />
      ) : null}
      {canManageMigration && showInstanceMigration && !migrated ? (
        <MigrateToCloudWizard
          cancelMigration={cancelMigration}
          defaultTargetOrigin={defaultMigrationTargetOrigin}
          direction={direction}
          domain={domain}
          enableMigrationHold={enableMigrationHold}
          initialMigrationHold={migrationHold}
          markProjectMigrated={markProjectMigrated}
          onClose={() => setMigrateOpen(false)}
          open={migrateOpen}
          projectId={projectId}
          releaseMigrationHold={releaseMigrationHold}
        />
      ) : null}
    </>
  );
}

function ReactivateProjectCard({
  projectId,
  reactivateProject,
}: Readonly<{
  projectId?: string;
  reactivateProject?: (input: { projectId: string }) => Promise<unknown>;
}>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleReactivate() {
    if (!projectId || !reactivateProject) return;
    setBusy(true);
    setMessage(null);
    try {
      await reactivateProject({ projectId });
      router.refresh();
    } catch {
      setMessage("Project could not be reactivated. Try again or contact support.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full items-center gap-3.5 rounded-[14px] border border-border bg-bg-elev px-5 py-[18px]">
      <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px] bg-bg-sunken text-fg">
        <CloudArrowUp aria-hidden size={22} weight="fill" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14.5px] font-semibold">Project migrated</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-yellow/40 bg-yellow/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.4px] text-yellow-text">
            Disabled
          </span>
        </div>
        <div className="mt-[3px] text-[12.5px] text-fg-muted">
          This project moved to another bisibility instance. Writes and rank checks stay off until
          you reactivate it.
        </div>
        {message ? <div className="mt-1 text-[12px] text-red-text">{message}</div> : null}
      </div>
      <Button
        disabled={!projectId || !reactivateProject}
        loading={busy}
        loadingLabel="Reactivating..."
        onClick={handleReactivate}
        sx={{
          color: "var(--fg-muted)",
          flex: "none",
          "&:hover": { borderColor: "var(--accent)", color: "var(--accent-text)" },
        }}
        type="button"
        variant="secondary"
      >
        Reactivate project
      </Button>
    </div>
  );
}
