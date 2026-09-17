"use client";

import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { completeSetupAction } from "./actions";

export function SetupRecoveryAction() {
  const t = useTranslations("setup");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function completeSetup() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await completeSetupAction();
      if (result.status === "error") {
        setError(
          result.code === "ALREADY_COMPLETED" ? t("errors.alreadyCompleted") : t("errors.complete"),
        );
        return;
      }
      router.refresh();
    } catch {
      setError(t("errors.complete"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-2">
      <form action={completeSetup}>
        <Button
          className="w-full"
          loading={submitting}
          loadingLabel={t("recovery.completing")}
          size="lg"
          type="submit"
        >
          {t("recovery.complete")}
        </Button>
      </form>
      {error ? (
        <p aria-live="polite" className="m-0 text-[12.5px] leading-[1.45] text-red-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
