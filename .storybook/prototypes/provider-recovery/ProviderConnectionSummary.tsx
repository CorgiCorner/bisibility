import { CalendarBlankIcon } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { PauseCircleIcon } from "@phosphor-icons/react/dist/csr/PauseCircle";
import type { ReactNode } from "react";
import type { AttentionState } from "./provider-attention-copy";
import { formatCheckCount } from "./provider-attention-pages";

type SummaryItem = { title: string; value: string; icon: ReactNode };

export function ProviderConnectionSummary({
  state,
  totalChecks,
}: {
  state: AttentionState;
  totalChecks: number;
}) {
  const ready = state === "ready";
  const items: SummaryItem[] = [];
  if (state === "review" || ready) {
    items.push(
      {
        title: "Account billing",
        value: "Verified",
        icon: <CheckCircleIcon className="text-green-text" size={16} />,
      },
      {
        title: "Earlier requests",
        value: ready ? "Reviewed" : `${formatCheckCount(totalChecks)} awaiting confirmation`,
        icon: ready ? (
          <CheckCircleIcon className="text-green-text" size={16} />
        ) : (
          <span className="size-1.5 rounded-full bg-yellow" />
        ),
      },
    );
  }
  items.push(
    {
      title: "Monitoring",
      value: ready ? "Resumes tomorrow at 09:00" : "Paused for this connection",
      icon: ready ? <ClockIcon size={16} /> : <PauseCircleIcon size={16} />,
    },
    {
      title: "Saved schedule",
      value: "Daily at 09:00 · Europe/Warsaw",
      icon: <CalendarBlankIcon size={16} />,
    },
  );
  return (
    <dl
      className="m-0 grid gap-x-6 gap-y-5 rounded-control border border-transparent bg-bg-sunken p-3 sm:grid-cols-2 sm:p-4"
      data-testid="provider-connection-summary"
    >
      {items.map((item) => (
        <div className="min-w-0" key={item.title}>
          <dt className="pl-9 text-[11.5px] leading-4 text-fg-muted">{item.title}</dt>
          <dd className="m-0 mt-1 flex items-start gap-3 text-[12.5px] font-medium leading-5">
            <span aria-hidden className="grid h-5 w-6 shrink-0 place-items-center text-fg-muted">
              {item.icon}
            </span>
            <span className="min-w-0">{item.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
