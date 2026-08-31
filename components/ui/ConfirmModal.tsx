"use client";

import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { type ReactNode, useRef, useState } from "react";
import { CONFIRM, type ConfirmKind } from "./confirm-copy";
import { dangerIconWellClassName } from "./icon-well-styles";

export { CONFIRM, type ConfirmKind } from "./confirm-copy";

export type ConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  kind: ConfirmKind;
  onConfirm: () => Promise<void> | void;
  onUndo?: () => Promise<void> | void;
  busy?: boolean;
  failureDetail?: ReactNode;
  showConfirmationToast?: boolean;
  typeWord?: string;
};

export function ConfirmModal({
  busy = false,
  failureDetail,
  kind,
  onClose,
  onConfirm,
  onUndo,
  open,
  showConfirmationToast = true,
  typeWord,
}: Readonly<ConfirmModalProps>) {
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const { showToast } = useToast();
  const config = CONFIRM[kind];
  const Icon = config.icon;
  const expectedWord = typeWord ?? config.typeWord ?? "";
  const needsType = Boolean(config.requireType);
  const isBusy = busy || pending;
  const disabled = isBusy || (needsType && typed !== expectedWord);

  function handleClose() {
    if (busy || pendingRef.current) return;
    onClose();
  }

  async function handleConfirm() {
    if (disabled || pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setConfirmationError(null);
    try {
      await onConfirm();
      if (showConfirmationToast) {
        showToast(config.toastMessage, {
          severity: "success",
          ...(onUndo ? { undo: onUndo } : {}),
        });
      }
    } catch {
      setConfirmationError("The action could not be completed. Try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function handleExited() {
    setTyped("");
    setConfirmationError(null);
  }

  return (
    <Modal
      footer={
        <>
          <button
            className="p-0 text-[13px] font-semibold text-fg-muted outline-none transition-colors hover:text-fg focus-visible:text-fg"
            disabled={isBusy}
            onClick={handleClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-control bg-red px-4 py-2.5 text-[13px] font-semibold text-error-contrast outline-none transition-[opacity,transform] duration-[var(--motion-press)] hover:opacity-90 focus-visible:opacity-90 motion-safe:active:not-focus-visible:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            onClick={handleConfirm}
            type="button"
          >
            {isBusy ? "Working..." : config.dangerLabel}
          </button>
        </>
      }
      headerDivider
      onClose={handleClose}
      onExited={handleExited}
      onPrimaryAction={handleConfirm}
      open={open}
      primaryActionDisabled={disabled}
      size="sm"
      title={config.title}
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-control ${dangerIconWellClassName}`}
        >
          <Icon aria-hidden size={21} weight="regular" />
        </span>
        <p className="m-0 text-[13.5px] leading-[1.55] text-fg-muted">{config.body}</p>
      </div>
      {needsType ? (
        <div className="mt-4">
          <label className="mb-[7px] block text-[12px] text-fg-muted" htmlFor="confirm-type-word">
            Type <strong className="font-mono font-semibold text-fg">{expectedWord}</strong> to
            confirm
          </label>
          <input
            className="w-full rounded-control border border-border-control bg-transparent px-3 py-2.5 font-mono text-[13px] font-medium text-fg outline-none transition-colors placeholder:text-[12px] placeholder:leading-4 focus:border-red"
            id="confirm-type-word"
            onChange={(event) => setTyped(event.target.value)}
            placeholder={expectedWord}
            value={typed}
          />
        </div>
      ) : null}
      {confirmationError ? (
        failureDetail ? (
          <div className="mt-3">{failureDetail}</div>
        ) : (
          <p className="m-0 mt-3 text-[12px] font-medium text-red-text" role="alert">
            {confirmationError}
          </p>
        )
      ) : null}
    </Modal>
  );
}
