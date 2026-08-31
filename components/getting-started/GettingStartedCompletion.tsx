"use client";

import { Button } from "@/components/ui";
import { appPath } from "@/lib/routing/app-path";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type GettingStartedCompletionProps = Readonly<{
  acknowledged: boolean;
  onAcknowledge: (input: { projectRef: string }) => Promise<void>;
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

  if (acknowledged) {
    return (
      <div className="flex min-h-12 items-center gap-2 rounded-control border border-border bg-bg-elev px-4 py-2.5 shadow-none">
        <CheckCircle aria-hidden className="shrink-0 text-green-text" size={18} weight="regular" />
        <p className="m-0 text-[13.5px] font-medium text-fg">Setup complete.</p>
      </div>
    );
  }

  async function acknowledge() {
    setError(null);
    setPending(true);
    try {
      await onAcknowledge({ projectRef });
      router.push(appPath(projectRef, "dashboard"));
      router.refresh();
    } catch {
      setError("Setup changed before it could be completed. Review the checklist and try again.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-card border border-border bg-bg-elev px-5 py-6 shadow-none sm:flex sm:items-center sm:justify-between sm:gap-5">
      <div className="flex min-w-0 items-center">
        <p className="m-0 text-[15px] font-semibold text-fg">
          Setup complete - first positions are in.
        </p>
      </div>
      <div className="mt-4 sm:mt-0">
        <Button className="w-full sm:w-auto" loading={pending} onClick={acknowledge}>
          See the dashboard
        </Button>
        {error ? (
          <p className="m-0 mt-2 max-w-72 text-[12px] leading-5 text-danger-text" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
