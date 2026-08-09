"use client";

import { Button } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { completeSetupAction } from "./actions";

export function SetupRecoveryAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function completeSetup() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await completeSetupAction();
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
    } catch {
      setError("We could not finish setup. Try again.");
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
          loadingLabel="Completing setup..."
          size="lg"
          type="submit"
        >
          Complete setup
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
