"use client";

import { actionErrorMessage, feedbackClass } from "@/components/onboarding/onboarding-form-utils";
import { Button, Tooltip } from "@/components/ui";
import { createCloudImportWorkspace } from "@/lib/actions/cloud";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

export const RESTORE_PROJECT_TOOLTIP =
  "Import a project package from another bisibility instance. We'll create one local project and restore its data. Provider credentials and API keys are not included.";

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
        setError(actionErrorMessage(cause, "Import project could not be opened."));
      }
    });
  }

  return (
    <form className="m-0 inline-flex items-end" onSubmit={handleSubmit}>
      <Tooltip content={RESTORE_PROJECT_TOOLTIP} placement="top" semantics="description">
        <Button
          loading={pending}
          loadingLabel="Opening import..."
          size="lg"
          type="submit"
          variant="secondary"
        >
          Restore project
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
