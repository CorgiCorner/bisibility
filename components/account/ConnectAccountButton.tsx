"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import { authClient } from "@/lib/auth/client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ghostButtonClass } from "./account-ui";
import { useAccountActionError } from "./useAccountActionError";

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
  const t = useTranslations("account.connected");
  const accountErrors = useAccountActionError();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (connected) {
    return (
      <button className={ghostButtonClass} disabled type="button">
        {t("connected")}
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
        setError(accountErrors.generic(result.error, t("connectError")));
        setPending(false);
      }
    } catch (error: unknown) {
      setError(accountErrors.generic(error, t("connectError")));
      setPending(false);
    }
  }

  const tooltip = configured
    ? t("connectProvider", { provider: label })
    : t("providerUnavailable", { provider: label });

  return (
    <span className="flex flex-none flex-col items-end gap-1">
      <Tooltip content={tooltip}>
        <span className="inline-flex">
          <button
            className={ghostButtonClass}
            disabled={!configured || pending}
            onClick={connect}
            type="button"
          >
            {pending ? t("connecting") : t("connect")}
          </button>
        </span>
      </Tooltip>
      {error ? <span className="text-[10.5px] text-red-text">{error}</span> : null}
    </span>
  );
}
