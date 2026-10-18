"use client";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
export function UnsubscribeAchievement({ token }: { token: string }) {
  const t = useTranslations("account.achievements"),
    [done, setDone] = useState(false),
    [error, setError] = useState(false),
    [pending, startTransition] = useTransition();
  return (
    <div className="space-y-4">
      <p>{t(done ? "unsubscribed" : "emailNotice")}</p>
      {!done ? (
        <Button
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const response = await fetch("/api/achievements/unsubscribe", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ token }),
                });
                if (!response.ok) throw new Error();
                setDone(true);
              } catch {
                setError(true);
              }
            })
          }
        >
          {t("emailUnsubscribe")}
        </Button>
      ) : null}
      {error ? <p role="alert">{t("error")}</p> : null}
    </div>
  );
}
