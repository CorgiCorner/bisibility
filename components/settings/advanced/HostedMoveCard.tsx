"use client";

import type { CloudImportPackageFile } from "@/components/cloud/cloud-token";
import { downloadWorkspacePackage } from "@/components/cloud/workspace-package-download";
import { AdvancedCardFrame } from "@/components/settings/advanced/AdvancedCardFrame";
import { advancedCardGeometryClassNames } from "@/components/settings/advanced/advanced-settings-layout";
import { Button, Modal, StatusPill } from "@/components/ui";
import type { SelfHostMigrationState } from "@/lib/deployment/project-write-mode";
import { actionErrorMessage } from "@/lib/ui/action-error";
import {
  ArrowCounterClockwiseIcon as ArrowCounterClockwise,
  DownloadSimpleIcon as DownloadSimple,
  LockSimpleIcon as LockSimple,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ProjectInput = { projectId: string };
export type StartHostedMigrationAction = (
  input: ProjectInput,
) => Promise<{ migration: SelfHostMigrationState; packageFile: CloudImportPackageFile }>;
export type RollbackHostedMigrationAction = (
  input: ProjectInput,
) => Promise<SelfHostMigrationState>;

type HostedMoveCardProps = {
  canManage: boolean;
  migration: SelfHostMigrationState;
  projectId: string;
  rollbackHostedMigration?: RollbackHostedMigrationAction;
  startHostedMigration?: StartHostedMigrationAction;
};

function utcLabel(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")} ${get("day")}, ${get("year")}, ${get("hour")}:${get("minute")} UTC`;
}

function MigrationStateRows({ migration }: Readonly<{ migration: SelfHostMigrationState }>) {
  const held = migration.writeMode === "migration_hold";
  return (
    <div className="divide-y divide-border-soft overflow-hidden rounded-[11px] border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
        <span>
          <span className="block text-[12.5px] font-semibold text-fg">Project access</span>
          <span className="block text-[11.5px] text-fg-muted">
            {held
              ? "Writes and scheduled checks are paused."
              : "Writes and scheduled checks continue."}
          </span>
        </span>
        <StatusPill
          label={held ? "Read-only" : migration.writeMode === "migrated" ? "Moved" : "Active"}
          showDot={false}
          size="sm"
          status={held ? "planned" : "optional"}
        />
      </div>
      <div className="px-3.5 py-3 text-[11.5px] leading-5 text-fg-muted">
        {held && migration.autoReleasesAt ? (
          <span>
            Eligible for automatic release{" "}
            <time className="font-mono text-fg" dateTime={migration.autoReleasesAt}>
              {utcLabel(migration.autoReleasesAt)}
            </time>
            . The hourly worker releases the hold shortly afterward.
          </span>
        ) : held ? (
          "Automatic release eligibility is unavailable. Roll back to resume writes."
        ) : migration.writeMode === "migrated" ? (
          "This hosted project remains read-only after the move."
        ) : (
          "Starting the move first enables a read-only hold, then generates the package."
        )}
      </div>
    </div>
  );
}

export function HostedMoveCard({
  canManage,
  migration: initialMigration,
  projectId,
  rollbackHostedMigration,
  startHostedMigration,
}: Readonly<HostedMoveCardProps>) {
  const router = useRouter();
  const [migration, setMigration] = useState(initialMigration);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"move" | "rollback" | null>(null);
  const held = migration.writeMode === "migration_hold";

  async function startMove() {
    if (!startHostedMigration) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await startHostedMigration({ projectId });
      setMigration(result.migration);
      setConfirm(null);
      try {
        await downloadWorkspacePackage(result.packageFile);
        setFeedback("Migration hold enabled and package downloaded.");
      } catch (error) {
        setFeedback(
          actionErrorMessage(error, "Migration hold is active, but the package download failed."),
        );
      }
      router.refresh();
    } catch (error) {
      setConfirm(null);
      setFeedback(
        actionErrorMessage(error, "Move could not finish. Refreshing the current project state."),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function rollback() {
    if (!rollbackHostedMigration) return;
    setBusy(true);
    setFeedback(null);
    try {
      setMigration(await rollbackHostedMigration({ projectId }));
      setConfirm(null);
      setFeedback("Migration rolled back. Project writes can resume.");
      router.refresh();
    } catch (error) {
      setFeedback(actionErrorMessage(error, "Migration could not be rolled back."));
    } finally {
      setBusy(false);
    }
  }

  const footer =
    held && migration.canRollback ? (
      canManage && rollbackHostedMigration ? (
        <Button
          onClick={() => setConfirm("rollback")}
          size="sm"
          startIcon={<ArrowCounterClockwise aria-hidden size={14} weight="bold" />}
          type="button"
          variant="secondary"
        >
          Roll back migration
        </Button>
      ) : null
    ) : migration.writeMode === "active" && canManage && startHostedMigration ? (
      <Button
        onClick={() => setConfirm("move")}
        size="sm"
        startIcon={<DownloadSimple aria-hidden size={14} weight="bold" />}
        type="button"
        variant="primary"
      >
        Move to self-host
      </Button>
    ) : null;

  return (
    <>
      <AdvancedCardFrame
        className={advancedCardGeometryClassNames.migration}
        description="Move this hosted project into a package for a self-hosted instance. This is different from a backup export because it pauses project writes."
        footer={footer}
        id="hosted-move"
        title="Move to self-host"
      >
        <MigrationStateRows migration={migration} />
        {feedback ? (
          <p aria-live="polite" className="m-0 text-[12px] text-fg-muted">
            {feedback}
          </p>
        ) : null}
      </AdvancedCardFrame>
      <Modal
        footer={
          <>
            <Button disabled={busy} onClick={() => setConfirm(null)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              loading={busy}
              loadingLabel="Starting..."
              onClick={startMove}
              startIcon={<LockSimple aria-hidden size={15} weight="fill" />}
              type="button"
            >
              Make read-only and export
            </Button>
          </>
        }
        onClose={() => setConfirm(null)}
        open={confirm === "move"}
        size="sm"
        title="Move this project to self-host?"
      >
        <p className="m-0 text-[13px] leading-5 text-fg-muted">
          The project becomes read-only before its package is generated. Use Export project data
          instead when you only need a backup and want writes to remain active.
        </p>
      </Modal>
      <Modal
        footer={
          <>
            <Button disabled={busy} onClick={() => setConfirm(null)} type="button" variant="ghost">
              Keep read-only
            </Button>
            <Button
              loading={busy}
              loadingLabel="Rolling back..."
              onClick={rollback}
              type="button"
              variant="destructive"
            >
              Resume writes
            </Button>
          </>
        }
        onClose={() => setConfirm(null)}
        open={confirm === "rollback"}
        size="sm"
        title="Roll back this migration?"
      >
        <p className="m-0 text-[13px] leading-5 text-fg-muted">
          This releases the migration hold and resumes writes and scheduled checks. Any copy already
          moved elsewhere will no longer stay in sync.
        </p>
      </Modal>
    </>
  );
}
