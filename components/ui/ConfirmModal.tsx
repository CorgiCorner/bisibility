"use client";

import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  CrownSimpleIcon as CrownSimple,
  GaugeIcon as Gauge,
  KeyIcon as Key,
  PlugsIcon as Plugs,
  TrashIcon as Trash,
  UserMinusIcon as UserMinus,
  UserPlusIcon as UserPlus,
  WarningIcon as Warning,
} from "@phosphor-icons/react";
import { useId, useState } from "react";

export type ConfirmKind =
  | "deactivateAccount"
  | "deleteAccount"
  | "deleteProject"
  | "deleteWebhookEndpoint"
  | "deleteBulk"
  | "deleteKeyword"
  | "clearTargetUrls"
  | "reactivateAccount"
  | "resetAccountLimits"
  | "revokeKey"
  | "removeIntegration"
  | "removeTeamMember"
  | "transferProjectOwnership";

type ConfirmConfig = {
  title: string;
  body: string;
  icon: typeof Warning;
  dangerLabel: string;
  toastMessage: string;
  requireType?: boolean;
  typeWord?: string;
};

export const CONFIRM: Record<ConfirmKind, ConfirmConfig> = {
  clearTargetUrls: {
    body: "Remove the configured target URL from the selected keywords. Ranking history is not affected.",
    dangerLabel: "Clear target URLs",
    icon: Warning,
    toastMessage: "Target URLs cleared",
    title: "Clear target URLs",
  },
  deactivateAccount: {
    body: "Block sign-in, revoke every session, and pause scheduled checks owned by this account. Instance administrators are protected.",
    dangerLabel: "Deactivate account",
    icon: UserMinus,
    toastMessage: "Account action requested",
    title: "Deactivate account",
  },
  deleteBulk: {
    body: "Remove the selected keywords and their history. This cannot be undone.",
    dangerLabel: "Delete keywords",
    icon: Trash,
    toastMessage: "Selected keywords deleted",
    title: "Delete selected keywords",
  },
  deleteKeyword: {
    body: "Stop tracking this keyword and remove its position history. This cannot be undone.",
    dangerLabel: "Delete keyword",
    icon: Trash,
    toastMessage: "Keyword deleted",
    title: "Delete keyword",
  },
  // Account deletion used to borrow the project copy, so the last thing a user read before
  // confirming described a different object than the one being destroyed.
  deleteAccount: {
    body: "This permanently deletes your account, your projects, and everything tracked in them. This cannot be undone.",
    dangerLabel: "Delete account",
    icon: Warning,
    requireType: true,
    toastMessage: "Account deleted",
    title: "Delete account",
    typeWord: "you@example.com",
  },
  deleteProject: {
    body: "This permanently deletes this project and all tracked keywords, history and API keys. This cannot be undone.",
    dangerLabel: "Delete project",
    icon: Warning,
    requireType: true,
    toastMessage: "Project deleted",
    title: "Delete project",
    typeWord: "acme.dev",
  },
  deleteWebhookEndpoint: {
    body: "Stop future deliveries to this endpoint and remove its delivery history association. This cannot be undone.",
    dangerLabel: "Delete endpoint",
    icon: Trash,
    toastMessage: "Webhook endpoint deleted",
    title: "Delete webhook endpoint",
  },
  removeIntegration: {
    body: "Rank checks will stop until another SERP provider is connected. Stored credentials are removed from this instance.",
    dangerLabel: "Disconnect provider",
    icon: Plugs,
    toastMessage: "Provider disconnected",
    title: "Disconnect provider",
  },
  removeTeamMember: {
    body: "Remove this member from the project. Their account and access to other projects are not affected.",
    dangerLabel: "Remove member",
    icon: UserMinus,
    toastMessage: "Project member removed",
    title: "Remove project member",
  },
  reactivateAccount: {
    body: "Allow sign-in again. Scheduled checks will reconverge through the schedule reconciler.",
    dangerLabel: "Reactivate account",
    icon: UserPlus,
    toastMessage: "Account action requested",
    title: "Reactivate account",
  },
  resetAccountLimits: {
    body: "Clear this account's rate-limit buckets. Monthly spend is a rolling window and cannot be reset.",
    dangerLabel: "Reset rate limits",
    icon: Gauge,
    toastMessage: "Rate-limit reset requested",
    title: "Reset rate limits",
  },
  revokeKey: {
    body: "Any app or script using this key will stop working immediately. Generate a new key to restore access.",
    dangerLabel: "Revoke key",
    icon: Key,
    toastMessage: "API key revoked",
    title: "Revoke API key",
  },
  transferProjectOwnership: {
    body: "Make this member the project owner. Your project role changes to admin, and only the new owner can transfer ownership again.",
    dangerLabel: "Transfer ownership",
    icon: CrownSimple,
    toastMessage: "Project ownership transferred",
    title: "Transfer project ownership",
  },
};

export type ConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  kind: ConfirmKind;
  onConfirm: () => void;
  onUndo?: () => Promise<void> | void;
  busy?: boolean;
  showConfirmationToast?: boolean;
  typeWord?: string;
};

export function ConfirmModal({
  busy = false,
  kind,
  onClose,
  onConfirm,
  onUndo,
  open,
  showConfirmationToast = true,
  typeWord,
}: Readonly<ConfirmModalProps>) {
  const titleId = useId();
  const [typed, setTyped] = useState("");
  const { showToast } = useToast();
  const config = CONFIRM[kind];
  const Icon = config.icon;
  const expectedWord = typeWord ?? config.typeWord ?? "";
  const needsType = Boolean(config.requireType);
  const disabled = busy || (needsType && typed !== expectedWord);

  function handleClose() {
    setTyped("");
    onClose();
  }

  function handleConfirm() {
    if (disabled) {
      return;
    }
    onConfirm();
    if (showConfirmationToast) {
      showToast(config.toastMessage, {
        icon: <Icon aria-hidden size={18} weight="bold" />,
        tint: "red",
        undo: onUndo ?? (() => undefined),
      });
    }
  }

  return (
    <Modal
      ariaLabelledBy={titleId}
      contentClassName="p-0"
      onClose={handleClose}
      open={open}
      showClose={false}
      size="sm"
    >
      <div className="px-[22px] pb-[18px] pt-[22px]">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] text-red-text [background:color-mix(in_srgb,var(--red)_12%,transparent)]">
            <Icon aria-hidden size={21} weight="bold" />
          </span>
          <h2
            className="m-0 text-[16.5px] font-semibold leading-tight tracking-[-0.3px] text-fg"
            id={titleId}
          >
            {config.title}
          </h2>
        </div>
        <p className="m-0 mt-[14px] text-[13.5px] leading-[1.55] text-fg-muted">{config.body}</p>
        {needsType ? (
          <div className="mt-4">
            <label className="mb-[7px] block text-[12px] text-fg-muted" htmlFor="confirm-type-word">
              Type <strong className="font-mono font-semibold text-fg">{expectedWord}</strong> to
              confirm
            </label>
            <input
              className="w-full rounded-[9px] border border-border-strong bg-transparent px-3 py-2.5 font-mono text-[13px] font-medium text-fg outline-none transition-colors focus:border-red"
              id="confirm-type-word"
              onChange={(event) => setTyped(event.target.value)}
              placeholder={expectedWord}
              value={typed}
            />
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-[18px] border-t border-border bg-bg-sunken px-[22px] py-[14px]">
        <button
          className="p-0 text-[13px] font-semibold text-fg-muted outline-none transition-colors hover:text-fg focus-visible:text-fg"
          disabled={busy}
          onClick={handleClose}
          type="button"
        >
          Cancel
        </button>
        <button
          className="inline-flex items-center gap-[7px] rounded-[9px] bg-red px-4 py-2.5 text-[13px] font-semibold text-error-contrast outline-none transition-opacity hover:opacity-90 focus-visible:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onClick={handleConfirm}
          type="button"
        >
          <Icon aria-hidden size={15} weight="bold" />
          {busy ? "Working..." : config.dangerLabel}
        </button>
      </div>
    </Modal>
  );
}
