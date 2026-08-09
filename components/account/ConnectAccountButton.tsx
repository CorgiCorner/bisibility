"use client";

import { authClient } from "@/lib/auth/client";
import Tooltip from "@mui/material/Tooltip";
import { useState } from "react";
import { ghostButtonClass } from "./account-ui";

export type ConnectAccountButtonProps = {
  configured: boolean;
  connected: boolean;
  label: string;
  provider: "github" | "google";
};

export function ConnectAccountButton({
  configured,
  connected,
  label,
  provider,
}: Readonly<ConnectAccountButtonProps>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (connected) {
    return (
      <button className={ghostButtonClass} disabled type="button">
        Connected
      </button>
    );
  }

  async function connect() {
    setPending(true);
    setError(null);
    try {
      // Links the provider to the signed-in user, then redirects into the OAuth flow.
      const result = await authClient.linkSocial({ callbackURL: "/app/account", provider });
      if (result.error) {
        setError(result.error.message ?? "Could not start connection.");
        setPending(false);
      }
    } catch {
      setError("Could not start connection.");
      setPending(false);
    }
  }

  const tooltip = configured ? `Connect ${label}` : `${label} sign-in is not configured.`;

  return (
    <span className="flex flex-none flex-col items-end gap-1">
      <Tooltip title={tooltip}>
        <span className="inline-flex">
          <button
            className={ghostButtonClass}
            disabled={!configured || pending}
            onClick={connect}
            type="button"
          >
            {pending ? "Connecting" : "Connect"}
          </button>
        </span>
      </Tooltip>
      {error ? <span className="text-[10.5px] text-red-text">{error}</span> : null}
    </span>
  );
}
