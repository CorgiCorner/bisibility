import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/csr/Database";
import type { ReactNode } from "react";

/** Shared shell keeps the step 4-5 cost summary visually continuous as rows are added. */
export function OnboardingCostSummary({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="mt-3.5 flex items-start gap-2.5 rounded-control bg-bg-sunken px-3.5 py-3 text-[12.5px] leading-5 text-fg-muted">
      <span className="flex h-[19px] shrink-0 items-center">
        <Database aria-hidden className="text-accent-solid" size={15} weight="regular" />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
