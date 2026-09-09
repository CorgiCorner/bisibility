"use client";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast-context";
import type { SearchInsightsImportAction } from "@/lib/actions/search-insights";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function SearchImportPauseControl({
  action,
  intent,
  label,
  projectId,
  variant = "secondary",
}: Readonly<{
  action: SearchInsightsImportAction;
  intent: "pause" | "resume" | "retry";
  label?: string;
  projectId: string;
  variant?: "primary" | "secondary";
}>) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  function change() {
    startTransition(async () => {
      try {
        const result = await action({ projectId, transition: intent });
        if (!result.ok) {
          showToast(result.message, { severity: "error" });
          return;
        }
        router.refresh();
      } catch (cause) {
        showToast(
          actionErrorMessage(
            cause,
            "Search data sync action failed. Refresh the page and try again.",
          ),
          { severity: "error" },
        );
      }
    });
  }
  return (
    <span className="inline-flex items-center">
      <Button
        aria-label={`${intent === "retry" ? "Retry" : intent === "resume" ? "Resume" : "Pause"} Search Console import`}
        className="shrink-0"
        loading={pending}
        onClick={change}
        size="xs"
        variant={variant}
      >
        {label ?? (intent === "retry" ? "Retry" : intent === "resume" ? "Resume" : "Pause")}
      </Button>
    </span>
  );
}
