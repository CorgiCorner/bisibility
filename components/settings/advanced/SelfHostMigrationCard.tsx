"use client";

import { AdvancedCardFrame } from "@/components/settings/advanced/AdvancedCardFrame";
import { advancedCardGeometryClassNames } from "@/components/settings/advanced/advanced-settings-layout";
import { MigrateToCloudWizard } from "@/components/settings/migration/MigrateToCloudWizard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
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
        startIcon={<ArrowCounterClockwise aria-hidden size={14} weight="regular" />}
        type="button"
        variant="secondary"
      >
        Reactivate project
      </Button>
    ) : null
  ) : canManage ? (
    <Button onClick={() => setWizardOpen(true)} size="sm" type="button" variant="secondary">
      {held ? "Continue transfer" : "Transfer project"}
    </Button>
  ) : null;

  return (
    <>
      <AdvancedCardFrame
        className={advancedCardGeometryClassNames.migration}
        description="Move this project to another Bisibility instance. We'll verify the destination first, then ask you to pause project writes so the transferred data stays consistent."
        footer={footer}
        id="self-host-migration"
        title="Transfer project"
      >
        <p className="m-0 text-[11.5px] leading-5 text-fg-muted">
          Provider credentials, API keys, billing information, and user passwords are not
          transferred. Connect providers separately on the destination.
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
