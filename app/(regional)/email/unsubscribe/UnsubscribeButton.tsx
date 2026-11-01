"use client";

import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function UnsubscribeButton({
  token,
  stream = "marketing",
}: Readonly<{ token: string; stream?: "marketing" | "notification" }>) {
  const router = useRouter();
  const t = useTranslations("emailPreferences.button");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function unsubscribe() {
    setBusy(true);
    setFailed(false);
    try {
      const endpoint =
        stream === "notification"
          ? `/api/email/unsubscribe/one-click?stream=notification&token=${encodeURIComponent(token)}`
          : "/api/email/unsubscribe";
      const response = await fetch(endpoint, {
        body: stream === "notification" ? "List-Unsubscribe=One-Click" : JSON.stringify({ token }),
        headers: {
          "Content-Type":
            stream === "notification" ? "application/x-www-form-urlencoded" : "application/json",
        },
        method: "POST",
      });
      if (!response.ok) throw new Error("unsubscribe failed");
      router.replace(
        stream === "notification"
          ? "/email/unsubscribe/notifications?status=success"
          : "/email/unsubscribe?status=success",
      );
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Button disabled={busy} onClick={() => void unsubscribe()} size="lg" variant="primary">
        {busy ? t("pending") : t("idle")}
      </Button>
      {failed ? (
        <p className="m-0 text-ui-body text-red-text" role="alert">
          {t("error")}
        </p>
      ) : null}
    </div>
  );
}
