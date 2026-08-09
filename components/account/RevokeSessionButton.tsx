"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type RevokeSessionButtonProps = {
  revokeSession: (input: { sessionId: string }) => Promise<{ revoked: boolean }>;
  sessionId: string;
};

export function RevokeSessionButton({
  revokeSession,
  sessionId,
}: Readonly<RevokeSessionButtonProps>) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    setFailed(false);
    startTransition(() => {
      void revokeSession({ sessionId })
        .then(() => router.refresh())
        .catch(() => setFailed(true));
    });
  }

  let buttonLabel = "Revoke";
  if (isPending) buttonLabel = "Revoking";
  else if (failed) buttonLabel = "Retry";

  return (
    <button
      aria-label={failed ? "Retry revoke session" : "Revoke session"}
      className="flex-none rounded-lg border border-border-strong bg-bg-elev px-[11px] py-1.5 text-[11.5px] font-semibold text-fg-muted hover:border-accent hover:text-accent-text disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
      disabled={isPending}
      onClick={onClick}
      type="button"
    >
      {buttonLabel}
    </button>
  );
}
