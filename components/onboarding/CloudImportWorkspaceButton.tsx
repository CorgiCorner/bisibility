"use client";

import { actionErrorMessage, feedbackClass } from "@/components/onboarding/onboarding-form-utils";
import { Button } from "@/components/ui";
import { createCloudImportWorkspace } from "@/lib/actions/cloud";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

export function CloudImportWorkspaceButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const destination = await createCloudImportWorkspace();
        router.push(destination, { scroll: true });
      } catch (cause) {
        setError(actionErrorMessage(cause, "Import project could not be opened."));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Button
        loading={pending}
        loadingLabel="Opening import..."
        size="sm"
        sx={{
          color: "var(--fg-muted)",
          fontWeight: 400,
          paddingX: "8px",
          textTransform: "none",
          "&:hover": { backgroundColor: "transparent", color: "var(--accent-text)" },
        }}
        type="submit"
        variant="ghost"
      >
        Import self-hosted project
      </Button>
      {error ? (
        <p className={`m-0 mt-1 ${feedbackClass} text-red-text`} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
