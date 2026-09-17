"use client";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { cn } from "@/lib/ui/cn";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { feedbackClass } from "./account-ui";
import { useAccountActionError } from "./useAccountActionError";

export type DeleteAccountInput = {
  email: string;
};

export type DeleteAccountProps = {
  deleteAccount?: (input: DeleteAccountInput) => Promise<void>;
  email: string;
};

const dangerButtonClass =
  "inline-flex min-h-9 items-center gap-2 rounded-control border border-red bg-bg-elev px-3.5 text-[13px] font-semibold text-red-text hover:bg-red hover:text-error-contrast disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted";

export function DeleteAccount({ deleteAccount, email }: Readonly<DeleteAccountProps>) {
  const t = useTranslations("account.delete");
  const accountErrors = useAccountActionError();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onConfirm() {
    if (!deleteAccount) {
      setMessage(t("unavailable"));
      return;
    }
    setMessage(null);
    setIsPending(true);
    try {
      await deleteAccount({ email });
    } catch (error: unknown) {
      setMessage(accountErrors.generic(error, t("error")));
      throw error;
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section>
      <div className="rounded-card border border-red bg-bg-elev px-5 py-4.5">
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold text-red-text">{t("title")}</div>
          <p className="m-0 mt-[3px] max-w-[560px] text-[12.5px] leading-normal text-fg-muted">
            {t("description")}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-3.5">
          <button className={dangerButtonClass} onClick={() => setOpen(true)} type="button">
            <Trash size={14} weight="regular" />
            {t("action")}
          </button>
        </div>
        {message ? (
          <span className={cn(feedbackClass, "mt-3 block text-red-text")}>{message}</span>
        ) : null}
      </div>
      <ConfirmModal
        busy={isPending}
        kind="deleteAccount"
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        open={open}
        typeWord={email}
      />
    </section>
  );
}
