"use client";

import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function UnsubscribeButton({ token }: Readonly<{ token: string }>) {
  const router = useRouter();
  const t = useTranslations("emailPreferences.button");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function unsubscribe() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/email/unsubscribe", {
        body: JSON.stringify({ token }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("unsubscribe failed");
      router.replace("/email/unsubscribe?status=success");
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
