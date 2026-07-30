"use client";

import { removeSignalNote } from "@/lib/actions/signals";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { TrashIcon as Trash } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type RemoveNoteActionProps = {
  projectId: string;
  signalId: string;
};

export function RemoveNoteAction({ projectId, signalId }: Readonly<RemoveNoteActionProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function remove() {
    if (!window.confirm("Delete this timeline note?")) return;
    setMessage(null);
    startTransition(() => {
      void removeSignalNote({ projectId, signalId })
        .then(() => router.refresh())
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Note could not be deleted.")),
        );
    });
  }

  return (
    <span className="flex flex-col items-end gap-1 md:pt-0.5">
      <button
        aria-label="Delete timeline note"
        className="grid h-8 w-8 place-items-center rounded-lg border border-border-strong bg-bg-elev text-red outline-none hover:border-red disabled:cursor-not-allowed disabled:opacity-55"
        disabled={isPending}
        onClick={remove}
        type="button"
      >
        <Trash aria-hidden size={13} />
      </button>
      {message ? <span className="font-mono text-[10px] text-red">{message}</span> : null}
    </span>
  );
}
