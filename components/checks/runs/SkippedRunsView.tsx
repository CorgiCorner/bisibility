import type { CheckRange, DeferredGroup, DeferredReason } from "@/lib/checks/contract";
import {
  ArrowRightIcon as ArrowRight,
  GaugeIcon as Gauge,
  PauseIcon as Pause,
  PlugsConnectedIcon as PlugsConnected,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { deferredWindow, rangeCopy } from "./check-runs-format";

export type SkippedRunsLinks = {
  connectProviderHref: string;
  reviewProvidersHref: string;
  timelineHref: string;
};

const reasonMeta: Record<
  DeferredReason,
  {
    cta: string;
    description: string;
    icon: typeof Gauge;
    link: keyof SkippedRunsLinks;
    title: string;
  }
> = {
  budget_exhausted: {
    cta: "Timeline",
    description:
      "The project budget cap paused these checks. They retry on schedule after budget is available.",
    icon: Gauge,
    link: "timelineHref",
    title: "Budget cap reached",
  },
  migration_hold: {
    cta: "Timeline",
    description: "These checks are on hold while the import finishes.",
    icon: Pause,
    link: "timelineHref",
    title: "Paused during import",
  },
  no_provider: {
    cta: "Connect provider",
    description: "These will never run until a provider connection is assigned.",
    icon: PlugsConnected,
    link: "connectProviderHref",
    title: "No provider assigned",
  },
  rate_limited: {
    cta: "Review providers",
    description: "Every provider was rate-limited - these retry at the next scheduled run.",
    icon: WarningCircle,
    link: "reviewProvidersHref",
    title: "Rate limited · all providers",
  },
};

function GroupCard({
  group,
  links,
  now,
  timeZone,
}: Readonly<{ group: DeferredGroup; links: SkippedRunsLinks; now: Date; timeZone: string }>) {
  const meta = reasonMeta[group.reason];
  const Icon = meta.icon;
  const quantity =
    group.reason === "no_provider"
      ? `${group.keywordCount.toLocaleString("en-US")} ${
          group.keywordCount === 1 ? "keyword" : "keywords"
        } · every scheduled run skipped`
      : `${group.count.toLocaleString("en-US")} checks · ${deferredWindow(group, now, timeZone)}`;
  return (
    <article className="flex min-w-0 gap-3 rounded-xl border border-border bg-bg-elev p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-bg-sunken text-yellow-strong">
        <Icon aria-hidden size={17} weight="fill" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="m-0 text-[13px] font-semibold text-fg">{meta.title}</h3>
        <p className="m-0 mt-0.5 font-mono text-[10.5px] text-fg-muted">{quantity}</p>
        <p className="m-0 mt-2 text-[12px] leading-relaxed text-fg-muted">{meta.description}</p>
        <Link
          className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent outline-none hover:text-accent-hover focus-visible:underline"
          href={links[meta.link]}
        >
          {meta.cta}
          <ArrowRight aria-hidden size={12} weight="bold" />
        </Link>
      </div>
    </article>
  );
}

type SkippedProps = {
  groups: DeferredGroup[];
  links: SkippedRunsLinks;
  now: Date;
  range: CheckRange;
  timeZone: string;
};

export function SkippedRunsView({ groups, links, now, range, timeZone }: Readonly<SkippedProps>) {
  return (
    <section
      aria-label="Skipped checks"
      className="border-border border-t bg-bg-sunken/45 px-4 py-4"
    >
      <p className="m-0 text-[12.5px] leading-relaxed text-fg-muted">
        Skipped runs never started - they don't consume budget and retry at the next scheduled run.
        Grouped by reason, {rangeCopy[range].caption}.
      </p>
      <div className="mt-3 grid gap-2.5 lg:grid-cols-2">
        {groups.map((group) => (
          <GroupCard group={group} key={group.reason} links={links} now={now} timeZone={timeZone} />
        ))}
      </div>
    </section>
  );
}
