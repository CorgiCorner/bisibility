"use client";

import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { SignOutIcon as SignOut } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { feedbackClass, ghostButtonClass } from "./account-ui";

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
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onClick() {
    setMessage(null);
    startTransition(() => {
      void signOutEverywhere()
        .then((result) => {
          if (result.revokedCount === 0) {
            setMessage("No other sessions were active.");
          } else {
            const noun = result.revokedCount === 1 ? "session" : "sessions";
            setMessage(`Signed out ${result.revokedCount} other ${noun}.`);
          }
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Could not sign out other sessions.")),
        );
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {message ? <span className={cn(feedbackClass, "text-fg-muted")}>{message}</span> : null}
      <button
        className={cn(ghostButtonClass, "text-red-text hover:text-red-text")}
        disabled={isPending || otherSessionCount === 0}
        onClick={onClick}
        type="button"
      >
        <SignOut size={14} />
        {isPending ? "Signing out" : "Sign out everywhere"}
      </button>
    </div>
  );
}
