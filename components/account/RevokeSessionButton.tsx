"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAccountActionError } from "./useAccountActionError";

export type RevokeSessionButtonProps = {
  revokeSession: (input: { sessionId: string }) => Promise<{ revoked: boolean }>;
  sessionId: string;
};

export function RevokeSessionButton({
  revokeSession,
  sessionId,
}: Readonly<RevokeSessionButtonProps>) {
  const router = useRouter();
  const t = useTranslations("account.security.sessions");
  const accountErrors = useAccountActionError();
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    setFailed(false);
    setMessage(null);
    startTransition(async () => {
      try {
        await revokeSession({ sessionId });
        router.refresh();
      } catch (error: unknown) {
        setFailed(true);
        setMessage(accountErrors.generic(error, t("revokeError")));
      }
    });
  }

  let buttonLabel = t("revoke");
  if (isPending) buttonLabel = t("revoking");
  else if (failed) buttonLabel = t("retry");

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        aria-label={failed ? t("retryRevokeAriaLabel") : t("revokeAriaLabel")}
        className="flex-none rounded-control border border-border-control bg-bg-elev px-[11px] py-1.5 text-[11.5px] font-semibold text-fg-muted hover:border-accent hover:text-accent-text disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
        disabled={isPending}
        onClick={onClick}
        type="button"
      >
        {buttonLabel}
      </button>
      {message ? <span className="text-[10.5px] text-red-text">{message}</span> : null}
    </span>
  );
}
