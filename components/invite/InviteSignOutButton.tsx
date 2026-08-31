"use client";

import { authClient } from "@/lib/auth/client";
import { SignOutIcon as SignOut } from "@phosphor-icons/react";
import { useState } from "react";

export function InviteSignOutButton({ returnTo }: Readonly<{ returnTo: string }>) {
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await authClient.signOut();
    window.location.href = returnTo;
  }

  return (
    <button
      className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border-control bg-bg-elev px-3 text-[12.5px] font-semibold text-fg hover:border-accent hover:text-accent-text disabled:bg-bg-sunken disabled:text-fg-muted"
      disabled={pending}
      onClick={() => void handleSignOut()}
      type="button"
    >
      <SignOut aria-hidden size={14} weight="regular" />
      Sign out
    </button>
  );
}
