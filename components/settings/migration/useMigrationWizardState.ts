"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import type { MigrationImportCompletion } from "@/lib/migration/result";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type {
  CloudMigrationHandoff,
  MigrationCompatibilityResult,
  MigrationDirection,
  MigrationMode,
  MigrationOutcome,
  MigrationTokenForm,
} from "./MigrateToCloudWizard.types";
import { useMigrationHoldState } from "./useMigrationHoldState";
import {
  advanceOnSuccess,
  continueHintFor,
  isFreshCompatibility,
  migrationWizardSchema,
} from "./useMigrationWizardState.helpers";

type UseMigrationWizardStateOptions = {
  cancelMigration?: (input: { projectId: string }) => Promise<unknown>;
  defaultTargetOrigin: string;
  direction: MigrationDirection;
  enableMigrationHold?: (input: { projectId: string }) => Promise<unknown>;
  initialMigrationHold: boolean;
  markProjectMigrated?: (input: { projectId: string }) => Promise<unknown>;
  onClose: () => void;
  projectId?: string;
  releaseMigrationHold?: (input: { projectId: string }) => Promise<unknown>;
};

export function useMigrationWizardState({
  cancelMigration,
  defaultTargetOrigin,
  direction,
  enableMigrationHold,
  initialMigrationHold,
  markProjectMigrated,
  onClose,
  projectId,
  releaseMigrationHold,
}: UseMigrationWizardStateOptions) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<MigrationMode>("push");
  const [exported, setExported] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [outcome, setOutcome] = useState<MigrationOutcome | null>(null);
  const [downloadConfirmed, setDownloadConfirmed] = useState(false);
  const [checkedCompatibility, setCheckedCompatibility] =
    useState<MigrationCompatibilityResult | null>(null);
  const [handoff, setHandoff] = useState<CloudMigrationHandoff | null>(null);
  const [holdConfirmOpen, setHoldConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelMode, setCancelMode] = useState<"cancel" | "close">("cancel");
  const [markConfirmOpen, setMarkConfirmOpen] = useState(false);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const hold = useMigrationHoldState({
    cancelMigration,
    enableMigrationHold,
    initialMigrationHold,
    markProjectMigrated,
    projectId,
    releaseMigrationHold,
  });
  const form = useForm<MigrationTokenForm>({
    defaultValues: { targetOrigin: defaultTargetOrigin, token: "" },
    mode: "onChange",
    resolver: zodResolver(migrationWizardSchema(direction)),
  });
  const targetOrigin = form.watch("targetOrigin").trim();
  const compatibilityContextKey = [projectId ?? "missing", direction, targetOrigin].join("|");
  const compatibility = isFreshCompatibility(checkedCompatibility, compatibilityContextKey)
    ? checkedCompatibility
    : null;

  function resetAndClose() {
    setStep(1);
    setMode("push");
    setExported(false);
    setTransferring(false);
    setOutcome(null);
    setDownloadConfirmed(false);
    setCheckedCompatibility(null);
    setGateMessage(null);
    setHandoff(null);
    setHoldConfirmOpen(false);
    setCancelOpen(false);
    setCancelMode("cancel");
    setMarkConfirmOpen(false);
    hold.reset();
    form.reset({ targetOrigin: defaultTargetOrigin, token: "" });
    onClose();
  }

  function handleClose() {
    if (hold.active) {
      setCancelMode("close");
      setCancelOpen(true);
      return;
    }
    resetAndClose();
  }

  function handleConfirmHold() {
    advanceOnSuccess(hold.ensure(), () => {
      setHoldConfirmOpen(false);
      setStep(2);
    });
  }

  async function handleCancelMigration() {
    if (await hold.cancel()) {
      setCancelOpen(false);
      resetAndClose();
      // Cancellation terminalized the import job server-side; refresh so the
      // server-rendered recovery card reflects reality and disappears.
      router.refresh();
    }
  }

  async function handleMarkMigrated() {
    if (await hold.markMigrated()) {
      setMarkConfirmOpen(false);
      resetAndClose();
    }
  }

  function handleModeChange(nextMode: MigrationMode) {
    setMode(nextMode);
    setDownloadConfirmed(false);
    setExported(false);
    setOutcome(null);
    setGateMessage(null);
  }

  function handleExportSuccess() {
    setExported(true);
    setGateMessage(null);
  }

  async function handleTransferStart() {
    setGateMessage(null);
    const ready = await hold.ensure();
    if (ready) setTransferring(true);
    else setGateMessage("Transfer did not start because read-only mode could not be enabled.");
    return ready;
  }

  async function handleTransferEnd() {
    setTransferring(false);
    if (!(await hold.release())) {
      setGateMessage(
        "Transfer ended, but read-only mode could not be released. Use Cancel migration to retry.",
      );
    }
  }

  function handleTransferSuccess(completion: MigrationImportCompletion) {
    setOutcome({ completion, kind: "completed" });
    setGateMessage(null);
  }

  function handleBack() {
    setGateMessage(null);
    setStep(Math.max(1, step - 1));
  }

  function handleNext() {
    setGateMessage(null);
    if (step === 1) {
      const beforeHold = form.trigger("targetOrigin");
      beforeHold
        .then((validTarget) => {
          if (!validTarget) return;
          if (!isFreshCompatibility(checkedCompatibility, compatibilityContextKey)) {
            setCheckedCompatibility(null);
            setGateMessage("Run a current compatibility check before continuing.");
            return;
          }
          if (!checkedCompatibility?.compatible) {
            setGateMessage("Resolve the compatibility blockers before continuing.");
            return;
          }
          if (hold.active) {
            setStep(2);
            return;
          }
          setHoldConfirmOpen(true);
        })
        .catch(() => undefined);
      return;
    }
    if (step === 2 && mode === "push") {
      if (outcome?.kind !== "completed") {
        setGateMessage("Complete the transfer first.");
        return;
      }
      advanceOnSuccess(form.trigger("token"), () => setStep(3));
      return;
    }
    if (step === 2 && mode === "download") {
      if (!exported) {
        setGateMessage("Export the project package before continuing.");
        return;
      }
      if (!downloadConfirmed) {
        setGateMessage("Confirm the destination upload before continuing.");
        return;
      }
      setOutcome({ kind: "external-pending" });
      setStep(3);
      return;
    }
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    resetAndClose();
  }

  const mustCheckCompatibility = step === 1 && !compatibility;
  const hasCompatibilityBlockers = step === 1 && compatibility?.compatible === false;
  const mustCompletePushTransfer = step === 2 && mode === "push" && outcome?.kind !== "completed";
  const mustReleaseTerminalHold = step === 2 && outcome?.kind === "completed" && hold.active;
  const mustConfirmDownload =
    step === 2 && mode === "download" && (!exported || !downloadConfirmed);
  const mustChooseDoneHold = step === 3 && hold.active;
  const continueDisabled =
    hold.busy ||
    transferring ||
    mustCheckCompatibility ||
    hasCompatibilityBlockers ||
    mustCompletePushTransfer ||
    mustReleaseTerminalHold ||
    mustConfirmDownload ||
    mustChooseDoneHold;
  const continueHint = continueHintFor({
    exported: Boolean(exported),
    hasCompatibilityBlockers,
    mustCheckCompatibility,
    mustChooseDoneHold,
    mustCompletePushTransfer,
    mustConfirmDownload,
  });

  return {
    cancelMode,
    cancelOpen,
    compatibility,
    compatibilityContextKey,
    continueDisabled,
    continueHint,
    downloadConfirmed,
    exported,
    form,
    gateMessage,
    handoff,
    handleBack,
    handleCancelMigration,
    handleClose,
    handleConfirmHold,
    handleExportSuccess,
    handleMarkMigrated,
    handleModeChange,
    handleNext,
    handleTransferEnd,
    handleTransferStart,
    handleTransferSuccess,
    holdBusy: hold.busy,
    holdConfirmOpen,
    holdMessage: hold.message,
    markConfirmOpen,
    migrationHold: hold.active,
    mode,
    openCancelModal: () => {
      setCancelMode("cancel");
      setCancelOpen(true);
    },
    outcome,
    resetAndClose,
    setDownloadConfirmed,
    setCheckedCompatibility,
    setHandoff,
    setCancelOpen,
    setHoldConfirmOpen,
    setMarkConfirmOpen,
    step,
    transferring,
  };
}
