"use client";

import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth/client";
import { useState } from "react";

type OAuthConsentAccountBarProps = {
  email: string;
  initials: string;
};

export function OAuthConsentAccountBar({ email, initials }: Readonly<OAuthConsentAccountBarProps>) {
  const [switching, setSwitching] = useState(false);

  async function switchAccount() {
    setSwitching(true);
    try {
      await authClient.signOut();
      window.location.reload();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="mb-2.5 flex items-center rounded-[11px] border border-border bg-bg-elev px-3 py-2">
      <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-text">
        {initials}
      </span>
      <p className="ml-2.5 mr-3 min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
        Approving as <strong className="font-semibold text-fg">{email}</strong>
      </p>
      <Button
        loading={switching}
        loadingLabel="switching"
        onClick={() => void switchAccount()}
        size="xs"
        sx={{
          minWidth: 0,
          paddingInline: "4px",
          textDecoration: "underline",
          textUnderlineOffset: "2px",
        }}
        type="button"
        variant="ghost"
      >
        switch account
      </Button>
    </div>
  );
}
