"use client";

import { Button, Sheet } from "@/components/ui";
import { ArrowLeftIcon as ArrowLeft, ArrowRightIcon as ArrowRight } from "@phosphor-icons/react";
import { CheckStep } from "./MigrateToCloudCheck";
import { DoneStep } from "./MigrateToCloudHandoff";
import { TransferStep } from "./MigrateToCloudTransferPanels";
import type { MigrationDirection } from "./MigrateToCloudWizard.types";
import {
  CancelMigrationConfirmModal,
  EnableReadOnlyConfirmModal,
  MarkMigratedConfirmModal,
  MigrateStepper,
  ReadOnlyBanner,
} from "./MigrateToCloudWizardParts";
import { useMigrationWizardState } from "./useMigrationWizardState";

export type MigrateToCloudWizardProps = {
  cancelMigration?: (input: { projectId: string }) => Promise<unknown>;
  defaultTargetOrigin?: string;
  direction: MigrationDirection;
  domain: string;
  enableMigrationHold?: (input: { projectId: string }) => Promise<unknown>;
  initialMigrationHold?: boolean;
  markProjectMigrated?: (input: { projectId: string }) => Promise<unknown>;
  open: boolean;
  onClose: () => void;
  projectId?: string;
  releaseMigrationHold?: (input: { projectId: string }) => Promise<unknown>;
};

export function MigrateToCloudWizard({
  cancelMigration,
  defaultTargetOrigin = "",
  direction,
  domain,
  enableMigrationHold,
  initialMigrationHold = false,
  markProjectMigrated,
  onClose,
  open,
  projectId,
  releaseMigrationHold,
}: Readonly<MigrateToCloudWizardProps>) {
  const wizard = useMigrationWizardState({
    cancelMigration,
    defaultTargetOrigin: direction === "to-cloud" ? defaultTargetOrigin : "",
    direction,
    enableMigrationHold,
    initialMigrationHold,
    markProjectMigrated,
    onClose,
    projectId,
    releaseMigrationHold,
  });
  const usesUserTarget =
    direction === "to-self-host" || wizard.form.formState.dirtyFields.targetOrigin;
  const targetOrigin = usesUserTarget
    ? wizard.form.watch("targetOrigin")?.trim() || undefined
    : undefined;
  const title = "Transfer project";
  const targetLabel = direction === "to-cloud" ? "hosted instance" : "a self-hosted instance";
  const description = `Move ${domain} to another bisibility instance (${targetLabel} by default). The source project stays read-only while export and import finish.`;
  let continueLabel = "Continue";
  if (wizard.step === 3) continueLabel = "Done";

  return (
    <Sheet
      footer={
        <div className="flex flex-col gap-2">
          {wizard.continueHint ? (
            <div className="text-center text-[12px] font-medium text-fg-muted">
              {wizard.continueHint}
            </div>
          ) : null}
          <div className="flex items-center gap-2.5">
            {wizard.step > 1 ? (
              <Button
                disabled={wizard.holdBusy}
                onClick={wizard.handleBack}
                size="lg"
                startIcon={<ArrowLeft aria-hidden size={15} weight="bold" />}
                sx={{
                  color: "var(--fg-muted)",
                  "&:hover": { borderColor: "var(--accent)", color: "var(--accent-text)" },
                }}
                type="button"
                variant="secondary"
              >
                Back
              </Button>
            ) : null}
            <Button
              disabled={wizard.continueDisabled}
              endIcon={
                wizard.step === 3 ? null : <ArrowRight aria-hidden size={15} weight="bold" />
              }
              onClick={wizard.handleNext}
              size="lg"
              sx={{ flex: 1 }}
              type="button"
              variant="primary"
            >
              {continueLabel}
            </Button>
          </div>
        </div>
      }
      onClose={wizard.handleClose}
      open={open}
      title={
        <span className="block">
          <span className="block">{title}</span>
          <span className="mt-[3px] block text-[13px] font-normal leading-normal tracking-normal text-fg-muted">
            {description}
          </span>
        </span>
      }
    >
      <MigrateStepper step={wizard.step} />
      {wizard.migrationHold ? (
        <ReadOnlyBanner onCancelMigration={wizard.openCancelModal} pending={wizard.holdBusy} />
      ) : null}
      <div className="mt-6">
        {wizard.step === 1 ? (
          <CheckStep
            direction={direction}
            compatibility={wizard.compatibility}
            contextKey={wizard.compatibilityContextKey}
            form={wizard.form}
            holdMessage={wizard.holdMessage}
            holdPending={wizard.holdBusy}
            migrationHold={wizard.migrationHold}
            onCompatibilityChange={wizard.setCheckedCompatibility}
            projectId={projectId}
          />
        ) : null}
        {wizard.step === 2 ? (
          <TransferStep
            direction={direction}
            downloadConfirmed={wizard.downloadConfirmed}
            exported={wizard.exported}
            form={wizard.form}
            handoff={wizard.handoff}
            mode={wizard.mode}
            onDownloadConfirmedChange={wizard.setDownloadConfirmed}
            onExportSuccess={wizard.handleExportSuccess}
            onHandoff={wizard.setHandoff}
            onTransferEnd={wizard.handleTransferEnd}
            onTransferStart={wizard.handleTransferStart}
            onTransferSuccess={wizard.handleTransferSuccess}
            projectId={projectId}
            setMode={wizard.handleModeChange}
            targetOrigin={targetOrigin}
          />
        ) : null}
        {wizard.step === 3 ? (
          <DoneStep
            direction={direction}
            domain={domain}
            handoff={wizard.handoff}
            holdMessage={wizard.holdMessage}
            holdPending={wizard.holdBusy}
            migrationHold={wizard.migrationHold}
            outcome={wizard.outcome}
            onHandoff={wizard.setHandoff}
            onKeepReadOnly={wizard.resetAndClose}
            onCancelMigration={wizard.openCancelModal}
            onMarkMigrated={() => wizard.setMarkConfirmOpen(true)}
            projectId={projectId}
            targetOrigin={targetOrigin}
          />
        ) : null}
      </div>
      {wizard.gateMessage ? (
        <p className="m-0 mt-3 text-[12px] text-red-text">{wizard.gateMessage}</p>
      ) : null}
      <EnableReadOnlyConfirmModal
        busy={wizard.holdBusy}
        error={wizard.holdMessage}
        onClose={() => wizard.setHoldConfirmOpen(false)}
        onConfirm={wizard.handleConfirmHold}
        open={wizard.holdConfirmOpen}
      />
      <CancelMigrationConfirmModal
        busy={wizard.holdBusy}
        error={wizard.holdMessage}
        mode={wizard.cancelMode}
        onClose={() => wizard.setCancelOpen(false)}
        onConfirm={() => void wizard.handleCancelMigration()}
        onKeepReadOnly={wizard.resetAndClose}
        open={wizard.cancelOpen}
      />
      <MarkMigratedConfirmModal
        busy={wizard.holdBusy}
        error={wizard.holdMessage}
        onClose={() => wizard.setMarkConfirmOpen(false)}
        onConfirm={() => void wizard.handleMarkMigrated()}
        open={wizard.markConfirmOpen}
      />
    </Sheet>
  );
}
