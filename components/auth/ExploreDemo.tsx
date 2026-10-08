"use client";

import { Button } from "@/components/ui/Button";
import { authClient } from "@/lib/auth/client";
import { signInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import { DEMO_ENTRY_CODE } from "@/lib/demo/config";
import { demoNextPath } from "@/lib/demo/demo-next-path";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function ExploreDemo({ nextPath }: { nextPath?: string | null }) {
  const t = useTranslations("auth.demo");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function explore() {
    setPending(true);
    setError(null);
    try {
      const response = await authClient.$fetch<{ url: string; redirect?: boolean }>(
        "/demo/sign-in",
        {
          method: "POST",
          body: { code: DEMO_ENTRY_CODE },
        },
      );
      const result = response.data;
      const oauthRedirect = signInRedirectUrl(response, window.location.origin);
      const destination =
        oauthRedirect ??
        (result?.url?.startsWith("/app/") ? (demoNextPath(nextPath) ?? result.url) : null);
      if (response.error || !destination) {
        throw new Error(t("error"));
      }
      window.location.assign(destination);
    } catch {
      setError(t("error"));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 text-2xl font-semibold">{t("title")}</h1>
      <p className="m-0 text-sm text-fg-muted">{t("description")}</p>
      <Button loading={pending} loadingLabel={t("loading")} onClick={explore}>
        {t("explore")}
      </Button>
      {error ? (
        <p className="m-0 text-sm text-red-text" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
