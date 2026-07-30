"use client";

import { Button, Modal } from "@/components/ui";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react";
import { useState } from "react";

export type EditBudgetSubmit = (capCents: number) => Promise<{ capCents: number }>;

export type EditBudgetDialogProps = {
  capCents: number | null;
  onClose: () => void;
  onSaved: (capCents: number) => void;
  submit: EditBudgetSubmit;
};

// Positive dollar amount, two decimals max (HANDOFF-35 section 4a B validation).
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

const SAVE_FAILED_FALLBACK = "Could not save the budget. Try again.";

export function parseBudgetInput(value: string): number | null {
  const trimmed = value.trim();
  if (!AMOUNT_PATTERN.test(trimmed)) {
    return null;
  }
  const capCents = Math.round(Number(trimmed) * 100);
  return capCents > 0 ? capCents : null;
}

export function EditBudgetDialog({
  capCents,
  onClose,
  onSaved,
  submit,
}: Readonly<EditBudgetDialogProps>) {
  const [value, setValue] = useState(capCents == null ? "" : (capCents / 100).toFixed(2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsedCents = parseBudgetInput(value);

  async function handleSave() {
    if (parsedCents == null || saving) {
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const result = await submit(parsedCents);
      onSaved(result.capCents);
    } catch (cause) {
      // Surface the server-provided message (e.g. authorization rejections).
      setError(actionErrorMessage(cause, SAVE_FAILED_FALLBACK));
      setSaving(false);
    }
  }

  return (
    <Modal
      footer={
        <>
          <Button disabled={saving} onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button disabled={parsedCents == null} loading={saving} onClick={handleSave}>
            Save budget
          </Button>
        </>
      }
      footerClassName="border-t-0 gap-2.5 pt-1"
      onClose={onClose}
      open
      title="Edit budget"
      width={380}
    >
      <p className="text-[12.5px] leading-[1.55] text-fg-muted">
        Monthly cap for all provider spend in this workspace. Checks and research pause when it is
        reached; nothing is charged beyond it.
      </p>
      <div className="mt-4">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-fg-faint">
          MONTHLY BUDGET
        </span>
        <label className="mt-1.5 flex items-center gap-2 rounded-[9px] border border-border-strong bg-white px-3 py-2.5 dark:bg-bg-elev">
          <span aria-hidden className="font-mono text-sm text-fg-muted">
            $
          </span>
          <input
            aria-label="Monthly budget in dollars"
            // biome-ignore lint/a11y/noAutofocus: the dialog exists to edit this single field.
            autoFocus
            className="w-full min-w-0 flex-1 bg-transparent font-mono text-sm font-semibold text-fg outline-none"
            inputMode="decimal"
            onChange={(event) => setValue(event.target.value)}
            value={value}
          />
          <span className="whitespace-nowrap font-mono text-[11px] text-fg-faint">/ month</span>
        </label>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-fg-faint">
        <ClockCounterClockwise aria-hidden size={13} />
        Changes are recorded in the audit log.
      </div>
      {error ? <p className="mt-2 text-[11.5px] text-red-text">{error}</p> : null}
    </Modal>
  );
}
