"use client";

import {
  FINISH_SETUP_CTA,
  FINISH_SETUP_HELPER,
  SEE_DASHBOARD_CTA,
  SETUP_ACK_CHECKLIST_ERROR,
  SETUP_ACK_WRITE_ERROR,
  SETUP_COMPLETE_HEADLINE,
  SETUP_FINISHED_HEADLINE,
} from "@/components/getting-started/getting-started-copy";
import { Button } from "@/components/ui";
import type { AcknowledgeGettingStartedResult } from "@/lib/getting-started/acknowledge-result";
import { appPath } from "@/lib/routing/app-path";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type GettingStartedCompletionProps = Readonly<{
  acknowledged: boolean;
  onAcknowledge: (input: { projectRef: string }) => Promise<AcknowledgeGettingStartedResult>;
  projectRef: string;
}>;

export function GettingStartedCompletion({
  acknowledged,
  onAcknowledge,
  projectRef,
}: GettingStartedCompletionProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dashboardHref = appPath(projectRef, "dashboard");

  if (acknowledged) {
    return (
      <section className="rounded-card border border-border bg-bg-elev px-5 py-6 shadow-none sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div className="flex min-w-0 items-center gap-2">
          <CheckCircle
            aria-hidden
            className="shrink-0 text-green-text"
            size={18}
            weight="regular"
          />
          <p className="m-0 text-[15px] font-semibold text-fg">{SETUP_FINISHED_HEADLINE}</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Button className="w-full sm:w-auto" href={dashboardHref} variant="secondary">
            {SEE_DASHBOARD_CTA}
          </Button>
        </div>
      </section>
    );
  }

  async function finishSetup() {
    setError(null);
    setPending(true);
    try {
      const result = await onAcknowledge({ projectRef });
      if (!result.ok) {
        setError(
          result.reason === "write_failed" ? SETUP_ACK_WRITE_ERROR : SETUP_ACK_CHECKLIST_ERROR,
        );
        return;
      }
      router.refresh();
    } catch {
      setError(SETUP_ACK_CHECKLIST_ERROR);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-card border border-border bg-bg-elev px-5 py-6 shadow-none">
      <div className="flex min-w-0 items-center">
        <p className="m-0 text-[15px] font-semibold text-fg">{SETUP_COMPLETE_HEADLINE}</p>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="flex flex-col gap-2">
          <Button className="w-full sm:w-auto" loading={pending} onClick={finishSetup}>
            {FINISH_SETUP_CTA}
          </Button>
          <p className="m-0 max-w-md text-[12px] leading-5 text-fg-muted">{FINISH_SETUP_HELPER}</p>
          {error ? (
            <p className="m-0 max-w-md text-[12px] leading-5 text-danger-text" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <Link
          className="text-[13px] font-semibold text-accent-text hover:text-accent"
          href={dashboardHref}
        >
          {SEE_DASHBOARD_CTA}
        </Link>
      </div>
    </section>
  );
}
