"use client";

import { actionErrorMessage } from "@/lib/ui/action-error";
import { useState } from "react";

type MigrationHoldAction = (input: { projectId: string }) => Promise<unknown>;

type MigrationHoldStateOptions = {
  cancelMigration?: MigrationHoldAction;
  enableMigrationHold?: MigrationHoldAction;
  initialMigrationHold: boolean;
  markProjectMigrated?: MigrationHoldAction;
  projectId?: string;
  releaseMigrationHold?: MigrationHoldAction;
};

export function useMigrationHoldState({
  cancelMigration,
  enableMigrationHold,
  initialMigrationHold,
  markProjectMigrated,
  projectId,
  releaseMigrationHold,
}: MigrationHoldStateOptions) {
  const [override, setOverride] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const active = override ?? initialMigrationHold;

  async function ensure() {
    if (active) return true;
    setBusy(true);
    setMessage(null);
    try {
      if (projectId && enableMigrationHold) await enableMigrationHold({ projectId });
      setOverride(true);
      return true;
    } catch (error) {
      setMessage(actionErrorMessage(error, "Read-only mode could not be enabled."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    setBusy(true);
    setMessage(null);
    try {
      if (projectId && releaseMigrationHold) await releaseMigrationHold({ projectId });
      setOverride(false);
      return true;
    } catch (error) {
      setMessage(actionErrorMessage(error, "Read-only mode could not be released."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    // Without a wired action there is nothing to cancel; do not report success or
    // close the modal on the caller's behalf.
    if (!projectId || !cancelMigration) return false;
    setBusy(true);
    setMessage(null);
    try {
      await cancelMigration({ projectId });
      setOverride(false);
      return true;
    } catch (error) {
      setMessage(actionErrorMessage(error, "Migration could not be cancelled."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function markMigrated() {
    setBusy(true);
    setMessage(null);
    try {
      if (projectId && markProjectMigrated) await markProjectMigrated({ projectId });
      return true;
    } catch (error) {
      setMessage(actionErrorMessage(error, "Project could not be marked as migrated."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    active,
    busy,
    cancel,
    ensure,
    markMigrated,
    message,
    release,
    reset: () => {
      setOverride(null);
      setMessage(null);
    },
  };
}
