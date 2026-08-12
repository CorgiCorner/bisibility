"use client";

import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth/client";
import { SignOutIcon as SignOut } from "@phosphor-icons/react";
import { useState } from "react";

/** Uses the dashboard sign-out path so onboarding clears the session before login. */
export function OnboardingLogoutButton() {
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await authClient.signOut();
    window.location.href = "/login";
  }

  return (
    <Button
      className="inline-flex items-center gap-1 font-semibold text-accent-text disabled:bg-bg-sunken disabled:text-fg-muted"
      disabled={pending}
      onClick={() => void handleSignOut()}
      size="xs"
      startIcon={<SignOut aria-hidden size={13} weight="bold" />}
      sx={{ color: "var(--accent-text)", minWidth: 0, paddingX: "8px" }}
      type="button"
      variant="ghost"
    >
      Log out
    </Button>
  );
}
