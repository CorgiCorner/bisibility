"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { feedbackClass } from "@/components/onboarding/onboarding-form-utils";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { createCloudImportWorkspace } from "@/lib/actions/cloud";
import { presentActionError } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

function resolvedBrowserTimezone(): string {
  try {
    // Timezone detection only - not date-order formatting.
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

export function CloudImportWorkspaceButton({
  browserTimezone,
}: Readonly<{ browserTimezone?: string }>) {
  const t = useTranslations("onboarding.projectOptions");
  const sharedErrors = useSharedErrorMessages();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const destination = await createCloudImportWorkspace(
          browserTimezone ?? resolvedBrowserTimezone(),
        );
        router.push(destination, { scroll: true });
      } catch (cause) {
        setError(presentActionError(cause, sharedErrors, t("importError")));
      }
    });
  }

  return (
    <form className="m-0 inline-flex items-end" onSubmit={handleSubmit}>
      <Tooltip content={t("restoreProjectTooltip")} placement="top" semantics="description">
        <Button
          loading={pending}
          loadingLabel={t("openingImport")}
          size="lg"
          type="submit"
          variant="secondary"
        >
          {t("restoreProject")}
        </Button>
      </Tooltip>
      {error ? (
        <p className={`m-0 mt-1 ${feedbackClass} text-red-text`} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
