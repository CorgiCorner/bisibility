"use client";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { IconButton } from "@/components/ui/IconButton";
import { removeSignalNote } from "@/lib/actions/signals";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type RemoveNoteActionProps = { projectId: string; signalId: string };

export function RemoveNoteAction({ projectId, signalId }: Readonly<RemoveNoteActionProps>) {
  const t = useTranslations("projectTimeline.remove");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function remove() {
    setMessage(null);
    try {
      await removeSignalNote({ projectId, signalId });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(actionErrorMessage(error, t("error")));
      throw error;
    }
  }
  return (
    <span className="flex flex-col items-end gap-1 md:pt-0.5">
      <IconButton
        aria-label={t("aria")}
        onClick={() => setOpen(true)}
        size="small"
        variant="secondary"
      >
        <Trash weight="regular" aria-hidden size={13} className="text-red-text" />
      </IconButton>
      <ConfirmModal
        kind="deleteTimelineNote"
        onClose={() => setOpen(false)}
        onConfirm={remove}
        open={open}
        failureDetail={
          message ? (
            <p role="alert" className="text-red-text">
              {message}
            </p>
          ) : undefined
        }
      />
    </span>
  );
}
