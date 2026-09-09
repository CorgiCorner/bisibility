"use client";

import {
  ALL_STEPS_COMPLETE,
  FINISH_SETUP_CTA,
  FINISH_SETUP_HELPER,
  SETUP_ACK_CHECKLIST_ERROR,
  SETUP_ACK_WRITE_ERROR,
  WHATS_NEXT_ACKNOWLEDGED,
  WHATS_NEXT_HEADING,
} from "@/components/getting-started/getting-started-copy";
import { Button } from "@/components/ui/Button";
import type { AcknowledgeGettingStartedResult } from "@/lib/getting-started/acknowledge-result";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StepGlyph } from "./StepGlyph";

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
    <section className="overflow-hidden rounded-card border border-border bg-bg-elev shadow-none">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <StepGlyph done />
        <p className="m-0 text-[13px] font-medium text-fg-muted">{ALL_STEPS_COMPLETE}</p>
      </div>
      <div className="border-t border-border px-5 py-4">
        <p className="m-0 text-[15px] font-semibold text-fg">{WHATS_NEXT_HEADING}</p>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
          <p className="m-0 min-w-0 max-w-md text-[13px] leading-[1.45] text-fg">
            {acknowledged ? WHATS_NEXT_ACKNOWLEDGED : FINISH_SETUP_HELPER}
          </p>
          {acknowledged ? null : (
            <Button loading={pending} onClick={finishSetup}>
              {FINISH_SETUP_CTA}
            </Button>
          )}
        </div>
        {error ? (
          <p className="m-0 mt-3 max-w-md text-[12px] leading-5 text-danger-text" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
