"use client";

import { removeSignalNote } from "@/lib/actions/signals";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

type RemoveNoteActionProps = {
  projectId: string;
  signalId: string;
};

export function RemoveNoteAction({ projectId, signalId }: Readonly<RemoveNoteActionProps>) {
  const t = useTranslations("projectTimeline.remove");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function remove() {
    if (!window.confirm(t("confirm"))) return;
    setMessage(null);
    startTransition(() => {
      void removeSignalNote({ projectId, signalId })
        .then(() => router.refresh())
        .catch((error: unknown) => setMessage(actionErrorMessage(error, t("error"))));
    });
  }

  return (
    <span className="flex flex-col items-end gap-1 md:pt-0.5">
      <button
        aria-label={t("aria")}
        className="grid h-8 w-8 place-items-center rounded-control border border-border-control bg-bg-elev text-red-text hover:border-red focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
        disabled={isPending}
        onClick={remove}
        type="button"
      >
        <Trash weight="regular" aria-hidden size={13} />
      </button>
      {message ? (
        <span className="font-sans tabular-nums text-[10px] text-red-text">{message}</span>
      ) : null}
    </span>
  );
}
