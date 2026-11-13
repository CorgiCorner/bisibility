"use client";

import { Card } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { setProjectSeoChallengeEnabled } from "@/lib/actions/instance-features";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

export function InstanceFeatures({
  enabled,
  editable,
}: Readonly<{ enabled: boolean; editable: boolean }>) {
  const t = useTranslations("instanceAdmin.features");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"saved" | "failed" | null>(null);

  function change(value: boolean) {
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await setProjectSeoChallengeEnabled(value);
        setStatus(result.ok ? "saved" : "failed");
      } catch {
        setStatus("failed");
      }
    });
  }

  return (
    <Card className="grid gap-3">
      <h2 className="m-0 text-ui-section">{t("title")}</h2>
      <Switch
        checked={enabled}
        className="w-full border-0 p-0"
        description={t("challengeDescription")}
        disabled={pending || !editable}
        label={t("challenge")}
        onChange={(event) => change(event.currentTarget.checked)}
      />
      {pending || status ? (
        <p
          className="m-0 text-ui-caption text-fg-muted"
          role={status === "failed" ? "alert" : "status"}
        >
          {pending ? t("saving") : status === "saved" ? t("saved") : t("failed")}
        </p>
      ) : null}
    </Card>
  );
}
