"use client";

import { ConfirmModal } from "@/components/ui";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { TrashIcon as Trash } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { feedbackClass } from "./account-ui";

export type DeleteAccountInput = {
  email: string;
};

export type DeleteAccountProps = {
  deleteAccount?: (input: DeleteAccountInput) => Promise<void>;
  email: string;
};

const dangerButtonClass =
  "inline-flex min-h-9 items-center gap-2 rounded-[9px] border border-red bg-bg-elev px-3.5 text-[13px] font-semibold text-red hover:bg-red hover:text-white disabled:cursor-not-allowed disabled:opacity-55";

export function DeleteAccount({ deleteAccount, email }: Readonly<DeleteAccountProps>) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onConfirm() {
    if (!deleteAccount) {
      setMessage("Delete account is not available.");
      return;
    }
    setMessage(null);
    startTransition(() => {
      void deleteAccount({ email }).catch((error: unknown) =>
        setMessage(actionErrorMessage(error, "Account could not be deleted.")),
      );
    });
  }

  return (
    <section>
      <div className="rounded-[14px] border border-red bg-bg-elev px-5 py-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-[14px]">
          <div className="min-w-0">
            <div className="text-[14.5px] font-semibold text-red">Danger zone</div>
            <p className="m-0 mt-[3px] max-w-[560px] text-[12.5px] leading-normal text-fg-muted">
              Permanently delete your account, owned workspaces and all tracked data. This cannot be
              undone.
            </p>
          </div>
          <button className={dangerButtonClass} onClick={() => setOpen(true)} type="button">
            <Trash size={14} />
            Delete account
          </button>
        </div>
        {message ? (
          <span className={cn(feedbackClass, "mt-3 block text-red")}>{message}</span>
        ) : null}
      </div>
      <ConfirmModal
        busy={isPending}
        kind="deleteWorkspace"
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        open={open}
        typeWord={email}
      />
    </section>
  );
}
