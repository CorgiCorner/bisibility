"use client";

import { AdvancedCardFrame } from "@/components/settings/advanced/AdvancedCardFrame";
import { advancedCardGeometryClassNames } from "@/components/settings/advanced/advanced-settings-layout";
import { MigrateToCloudWizard } from "@/components/settings/migration/MigrateToCloudWizard";
import { Button, Modal, StatusPill } from "@/components/ui";
import { actionErrorMessage } from "@/lib/ui/action-error";
import {
  ArrowCounterClockwiseIcon as ArrowCounterClockwise,
  CloudArrowUpIcon as CloudArrowUp,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type ProjectMigrationAction = (input: { projectId: string }) => Promise<unknown>;

type SelfHostMigrationCardProps = {
  actions: {
    cancelMigration?: ProjectMigrationAction;
    enableMigrationHold?: ProjectMigrationAction;
    markProjectMigrated?: ProjectMigrationAction;
    reactivateProject?: ProjectMigrationAction;
    releaseMigrationHold?: ProjectMigrationAction;
  };
  canManage: boolean;
  defaultTargetOrigin: string;
  domain: string;
  projectId: string;
  projectName: string;
  writeMode: "active" | "migration_hold" | "migrated";
};

export function SelfHostMigrationCard({
  actions,
  canManage,
  defaultTargetOrigin,
  domain,
  projectId,
  projectName,
  writeMode,
}: Readonly<SelfHostMigrationCardProps>) {
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const held = writeMode === "migration_hold";
  const migrated = writeMode === "migrated";

  async function reactivate() {
    if (!actions.reactivateProject) return;
    setBusy(true);
    setFeedback(null);
    try {
      await actions.reactivateProject({ projectId });
      setReactivateOpen(false);
      router.refresh();
    } catch (error) {
      setFeedback(actionErrorMessage(error, "Project could not be reactivated."));
    } finally {
      setBusy(false);
    }
  }

  const footer = migrated ? (
    canManage && actions.reactivateProject ? (
      <Button
        onClick={() => setReactivateOpen(true)}
        size="sm"
        startIcon={<ArrowCounterClockwise aria-hidden size={14} weight="bold" />}
        type="button"
        variant="secondary"
      >
        Reactivate project
      </Button>
    ) : null
  ) : canManage ? (
    <Button
      onClick={() => setWizardOpen(true)}
      size="sm"
      startIcon={<CloudArrowUp aria-hidden size={14} weight="fill" />}
      type="button"
      variant="secondary"
    >
      {held ? "Continue migration" : "Start migration"}
    </Button>
  ) : null;

  return (
    <>
      <AdvancedCardFrame
        className={advancedCardGeometryClassNames.migration}
        description="Move this self-hosted project to a compatible hosted instance. The target is checked before the source enters read-only mode."
        footer={footer}
        id="self-host-migration"
        title="Migrate to Cloud"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[11px] border border-border bg-bg-sunken px-3.5 py-3">
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-fg">This instance</div>
            <div className="mt-0.5 text-[11.5px] text-fg-muted">
              {migrated
                ? "Migration was marked complete; this source remains read-only."
                : held
                  ? "A migration hold is active and project writes are paused."
                  : "Project writes remain active until migration checks pass and you confirm."}
            </div>
          </div>
          <StatusPill
            label={migrated ? "Migrated" : held ? "Read-only" : "Active"}
            showDot={false}
            size="sm"
            status={held || migrated ? "planned" : "optional"}
          />
        </div>
        <p className="m-0 text-[11.5px] leading-5 text-fg-muted">
          Provider credentials and user passwords are not included. Connect providers separately on
          the destination.
        </p>
        {feedback ? (
          <p aria-live="polite" className="m-0 text-[12px] text-red-text">
            {feedback}
          </p>
        ) : null}
      </AdvancedCardFrame>
      <MigrateToCloudWizard
        cancelMigration={actions.cancelMigration}
        defaultTargetOrigin={defaultTargetOrigin}
        direction="to-cloud"
        domain={domain || projectName}
        enableMigrationHold={actions.enableMigrationHold}
        initialMigrationHold={held}
        markProjectMigrated={actions.markProjectMigrated}
        onClose={() => setWizardOpen(false)}
        open={wizardOpen}
        projectId={projectId}
        releaseMigrationHold={actions.releaseMigrationHold}
      />
      <Modal
        footer={
          <>
            <Button
              disabled={busy}
              onClick={() => setReactivateOpen(false)}
              type="button"
              variant="ghost"
            >
              Keep read-only
            </Button>
            <Button
              loading={busy}
              loadingLabel="Reactivating..."
              onClick={reactivate}
              type="button"
              variant="destructive"
            >
              Reactivate project
            </Button>
          </>
        }
        onClose={() => setReactivateOpen(false)}
        open={reactivateOpen}
        size="sm"
        title="Reactivate this source project?"
      >
        <p className="m-0 text-[13px] leading-5 text-fg-muted">
          Writes and scheduled checks resume here. Data already moved to another instance will not
          stay synchronized with this source.
        </p>
      </Modal>
    </>
  );
}
