"use client";

import { Button, Modal } from "@/components/ui";
import { TrashIcon as Trash } from "@phosphor-icons/react";

type DeleteDeployHookModalProps = {
  busy: boolean;
  hookLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
};

export function DeleteDeployHookModal({
  busy,
  hookLabel,
  onClose,
  onConfirm,
  open,
}: Readonly<DeleteDeployHookModalProps>) {
  return (
    <Modal
      footer={
        <>
          <Button disabled={busy} onClick={onClose} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            loading={busy}
            loadingLabel="Deleting"
            onClick={onConfirm}
            size="sm"
            startIcon={<Trash aria-hidden size={15} />}
            type="button"
            variant="destructive"
          >
            Delete hook
          </Button>
        </>
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      open={open}
      showClose={false}
      size="sm"
      title="Delete deploy hook"
    >
      <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
        Delete {hookLabel}? Sources using this token will start failing immediately. This cannot be
        undone.
      </p>
    </Modal>
  );
}
