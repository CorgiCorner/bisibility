import type { UpcomingBlockedGroup } from "@/lib/checks/contract";
import {
  GaugeIcon as Gauge,
  PauseIcon as Pause,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { findBlockedGroup, formatCheckCount, formatKeywordCount } from "./upcoming-format";

export type UpcomingBlockedAlertsProps = {
  blocked: UpcomingBlockedGroup[];
  providerSettingsHref: string;
  timelineHref: string;
};

const actionClassName =
  "shrink-0 text-xs font-semibold text-accent outline-none hover:underline focus-visible:underline";

export function UpcomingBlockedAlerts({
  blocked,
  providerSettingsHref,
  timelineHref,
}: Readonly<UpcomingBlockedAlertsProps>) {
  const noProvider = findBlockedGroup(blocked, "no_provider");
  const migrationHold = findBlockedGroup(blocked, "migration_hold");
  const budgetExhausted = findBlockedGroup(blocked, "budget_exhausted");

  if (!noProvider && !migrationHold && !budgetExhausted) return null;

  return (
    <section aria-label="Blocked scheduled checks" className="space-y-2.5">
      {noProvider ? (
        <div className="rounded-xl border border-red/30 bg-red/8 p-3.5">
          <div className="flex items-start gap-2.5">
            <WarningCircle
              aria-hidden
              className="mt-0.5 shrink-0 text-red"
              size={17}
              weight="fill"
            />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13px] font-semibold text-red">
                {formatCheckCount(noProvider.keywordCount)} will never run
              </p>
              <p className="mb-0 mt-1 text-xs text-fg-muted">
                No provider assigned · {formatKeywordCount(noProvider.keywordCount)}
              </p>
            </div>
            <Link className={actionClassName} href={providerSettingsHref}>
              Connect
            </Link>
          </div>
        </div>
      ) : null}

      {migrationHold ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-bg-sunken/65 px-3.5 py-3">
          <Pause aria-hidden className="shrink-0 text-fg-faint" size={15} weight="fill" />
          <p className="m-0 min-w-0 flex-1 text-xs text-fg-muted">
            Paused during import · {formatKeywordCount(migrationHold.keywordCount)}
          </p>
          <Link className={actionClassName} href={timelineHref}>
            Review
          </Link>
        </div>
      ) : null}

      {budgetExhausted ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-yellow/35 bg-yellow/10 px-3.5 py-3">
          <Gauge aria-hidden className="shrink-0 text-yellow" size={16} weight="fill" />
          <p className="m-0 min-w-0 flex-1 text-xs text-fg-muted">
            Monthly budget reached · {formatKeywordCount(budgetExhausted.keywordCount)}
          </p>
          <Link className={actionClassName} href={providerSettingsHref}>
            Review budget
          </Link>
        </div>
      ) : null}
    </section>
  );
}
