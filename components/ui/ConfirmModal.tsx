"use client";

import { Modal, type ModalSize } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import { useTranslations } from "next-intl";
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
  confirmationDisabled?: boolean;
  children?: ReactNode;
  failureDetail?: ReactNode;
  showConfirmationToast?: boolean;
  typeWord?: string;
  size?: ModalSize;
};

export function ConfirmModal({
  busy = false,
  children,
  confirmationDisabled = false,
  failureDetail,
  kind,
  onClose,
  onConfirm,
  onUndo,
  open,
  showConfirmationToast = true,
  size = "sm",
  typeWord,
}: Readonly<ConfirmModalProps>) {
  const t = useTranslations("shared.controls.confirmation");
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const { showToast } = useToast();
  const config = CONFIRM[kind];
  const Icon = config.icon;
  const body = t(config.bodyKey);
  const dangerLabel = t(config.dangerLabelKey);
  const title = t(config.titleKey);
  const toastMessage = t(config.toastMessageKey);
  const expectedWord = typeWord ?? config.typeWord ?? "";
  const needsType = Boolean(config.requireType);
  const isBusy = busy || pending;
  const disabled = confirmationDisabled || isBusy || (needsType && typed !== expectedWord);

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
        showToast(toastMessage, {
          severity: "success",
          ...(onUndo ? { undo: onUndo } : {}),
        });
      }
    } catch {
      setConfirmationError(t("failure"));
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
            {t("cancel")}
          </button>
          <button
            className="rounded-control bg-red px-4 py-2.5 text-[13px] font-semibold text-error-contrast outline-none transition-[opacity,transform] duration-[var(--motion-press)] hover:opacity-90 focus-visible:opacity-90 motion-safe:active:not-focus-visible:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            onClick={handleConfirm}
            type="button"
          >
            {isBusy ? t("working") : dangerLabel}
          </button>
        </>
      }
      headerDivider
      onClose={handleClose}
      onExited={handleExited}
      onPrimaryAction={handleConfirm}
      open={open}
      primaryActionDisabled={disabled}
      size={size}
      title={title}
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-control ${dangerIconWellClassName}`}
        >
          <Icon aria-hidden size={21} weight="regular" />
        </span>
        <p className="m-0 text-[13.5px] leading-[1.55] text-fg-muted">{body}</p>
      </div>
      {children}
      {needsType ? (
        <div className="mt-4">
          <label className="mb-[7px] block text-[12px] text-fg-muted" htmlFor="confirm-type-word">
            {t.rich("typeToConfirm", {
              strong: (chunks) => <strong className="font-semibold text-fg">{chunks}</strong>,
              word: expectedWord,
            })}
          </label>
          <input
            className="w-full rounded-control border border-border-control bg-transparent px-3 py-2.5 text-[13px] font-medium text-fg outline-none transition-colors placeholder:text-[12px] placeholder:leading-4 focus:border-red"
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
