"use client";

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
    <button
      className="inline-flex items-center gap-1 font-semibold text-accent disabled:opacity-60"
      disabled={pending}
      onClick={() => void handleSignOut()}
      type="button"
    >
      <SignOut aria-hidden size={13} weight="bold" />
      Log out
    </button>
  );
}
