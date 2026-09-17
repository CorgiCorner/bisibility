"use client";

import { cn } from "@/lib/ui/cn";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/dist/csr/SignOut";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { feedbackClass, ghostButtonClass } from "./account-ui";
import { useAccountActionError } from "./useAccountActionError";

export type SignOutEverywhereButtonProps = {
  // Number of *other* sessions; the button is disabled when there are none to revoke.
  otherSessionCount: number;
  signOutEverywhere: () => Promise<{ revokedCount: number }>;
};

export function SignOutEverywhereButton({
  otherSessionCount,
  signOutEverywhere,
}: Readonly<SignOutEverywhereButtonProps>) {
  const router = useRouter();
  const t = useTranslations("account.security.sessions");
  const accountErrors = useAccountActionError();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onClick() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await signOutEverywhere();
        if (result.revokedCount === 0) {
          setMessage(t("none"));
        } else {
          setMessage(t("signedOut", { count: result.revokedCount }));
        }
        router.refresh();
      } catch (error: unknown) {
        setMessage(accountErrors.generic(error, t("signOutError")));
      }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
      {message ? <span className={cn(feedbackClass, "text-fg-muted")}>{message}</span> : null}
      <button
        className={cn(ghostButtonClass, "text-red-text hover:text-red-text")}
        disabled={isPending || otherSessionCount === 0}
        onClick={onClick}
        type="button"
      >
        <SignOut size={14} weight="regular" />
        {isPending ? t("signingOut") : t("signOutEverywhere")}
      </button>
    </div>
  );
}
