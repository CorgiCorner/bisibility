import { EmptyState } from "@/components/ui";
import { pluralize } from "@/lib/format/pluralize";
import { appPath } from "@/lib/routing/app-path";
import {
  BellIcon as Bell,
  BellRingingIcon as BellRinging,
  CheckCircleIcon as CheckCircle,
  PlusIcon as Plus,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

export function AlertsSetupEmpty({
  action,
  canCreateKeyword,
  projectRef,
}: Readonly<{ action?: ReactNode; canCreateKeyword: boolean; projectRef: string }>) {
  return (
    <EmptyState
      action={
        canCreateKeyword
          ? (action ?? (
              <Link
                className="inline-flex min-h-10 items-center gap-[7px] rounded-[10px] bg-accent-solid px-[18px] text-[13.5px] font-semibold text-primary-contrast outline-none transition-colors hover:bg-accent-solid-hover focus-visible:bg-accent-solid-hover"
                href={appPath(projectRef, "rank-tracker")}
              >
                <Plus aria-hidden size={14} weight="bold" />
                Add keyword
              </Link>
            ))
          : undefined
      }
      description="Get notified when rankings slip out of the top 10, a competitor overtakes you, or a keyword jumps. Rules run after each rank check."
      footnote="Activates once you have tracked keywords"
      icon={<Bell aria-hidden size={27} weight="bold" />}
      title="No alerts yet"
    />
  );
}

export function AlertsAllClear({
  action,
  activeRuleCount,
}: Readonly<{
  action?: ReactNode;
  activeRuleCount: number;
}>) {
  return (
    <EmptyState
      action={action}
      description={
        <>
          No alerts have fired in the last 48 hours. You have{" "}
          {pluralize(activeRuleCount, "active rule")}.
        </>
      }
      footnote={
        <span className="flex flex-wrap items-center justify-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle aria-hidden className="text-green-text" size={13} weight="fill" />
            {pluralize(activeRuleCount, "active rule")}
          </span>
          <span className="h-[11px] w-px bg-border-strong" />
          <span>Nothing fired in 48h</span>
        </span>
      }
      icon={<BellRinging aria-hidden size={27} weight="fill" />}
      title="All clear"
      tone="positive"
    />
  );
}

export function AlertsCaughtUp({ snoozedCount }: Readonly<{ snoozedCount: number }>) {
  return (
    <EmptyState
      description={
        <>
          No alerts are currently visible. {pluralize(snoozedCount, "alert")} snoozed in the last 48
          hours.
        </>
      }
      icon={<BellRinging aria-hidden size={27} weight="fill" />}
      title="All caught up"
      tone="positive"
    />
  );
}
