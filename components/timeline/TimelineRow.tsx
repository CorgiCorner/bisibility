import { RemoveNoteAction } from "@/components/timeline/RemoveNoteAction";
import { MonoText } from "@/components/ui";
import type { TimelineItem } from "@/lib/timeline/timeline-data";
import {
  ArrowUpRightIcon as ArrowUpRight,
  DesktopIcon as Desktop,
  DeviceMobileIcon as DeviceMobile,
  FileMagnifyingGlassIcon as FileMagnifyingGlass,
  MedalIcon as Medal,
  NotePencilIcon as NotePencil,
  RocketLaunchIcon as RocketLaunch,
  type StackIcon as Stack,
  UploadSimpleIcon as UploadSimple,
  WarningIcon as Warning,
} from "@phosphor-icons/react/dist/ssr";

const itemIcons = {
  api: UploadSimple,
  deploys: RocketLaunch,
  notes: NotePencil,
  pages: FileMagnifyingGlass,
  rankings: Medal,
  status: Warning,
} satisfies Record<TimelineItem["icon"], typeof Stack>;

const tintStyles = {
  amber: {
    bg: "color-mix(in srgb, var(--yellow) 16%, transparent)",
    color: "var(--yellow-text)",
  },
  green: { bg: "color-mix(in srgb, var(--green) 13%, transparent)", color: "var(--green)" },
  red: { bg: "color-mix(in srgb, var(--red) 10%, transparent)", color: "var(--red)" },
} satisfies Record<TimelineItem["tint"], { bg: string; color: string }>;

function TimelineMeta({ item }: Readonly<{ item: TimelineItem }>) {
  if (!item.marketMeta) return <>{item.meta}</>;
  const [keyword, location, language, source] = item.marketMeta.segments;
  const deviceLabel = item.marketMeta.device === "mobile" ? "Mobile" : "Desktop";
  const DeviceIcon = item.marketMeta.device === "mobile" ? DeviceMobile : Desktop;
  const textSegments = [keyword, location, language];

  return (
    <span className="flex min-w-0 items-center gap-1" title={item.meta}>
      {textSegments.map((segment, index) => (
        <span className="contents" key={`${segment}-${index}`}>
          {index > 0 ? <span aria-hidden>/</span> : null}
          <span className="max-w-[220px] truncate">{segment}</span>
        </span>
      ))}
      <span aria-hidden>/</span>
      <span aria-label={deviceLabel} role="img" title={deviceLabel}>
        <DeviceIcon aria-hidden size={12} />
      </span>
      <span aria-hidden>/</span>
      <span className="max-w-[220px] truncate">{source}</span>
    </span>
  );
}

type TimelineRowProps = {
  canDelete: boolean;
  item: TimelineItem;
  projectId: string;
};

export function TimelineRow({ canDelete, item, projectId }: Readonly<TimelineRowProps>) {
  const Icon = itemIcons[item.icon];
  const tint = tintStyles[item.tint];

  return (
    <div
      className="flex items-start gap-3.5 border-border-soft border-b px-5 py-[13px] transition-colors hover:bg-bg-sunken last:border-b-0"
      id={`signal-${item.id}`}
    >
      <span className="flex w-[18px] flex-none justify-center pt-2">
        <span
          className="h-[9px] w-[9px] rounded-full"
          style={{ backgroundColor: tint.color, boxShadow: `0 0 0 3px ${tint.bg}` }}
        />
      </span>
      <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[124px_minmax(0,1fr)_auto] md:items-start">
        <MonoText className="text-fg-muted" component="span">
          {item.date}
          <span className="mt-0.5 block text-fg-muted">{item.time}</span>
        </MonoText>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className="inline-grid h-[22px] w-[22px] place-items-center rounded-md"
              style={{ backgroundColor: tint.bg, color: tint.color }}
            >
              <Icon aria-hidden size={12} weight="fill" />
            </span>
            <span className="min-w-0 text-[13.5px] font-semibold leading-[1.35] text-fg">
              {item.title}
            </span>
            {item.badge ? (
              <span
                className="inline-flex items-center rounded-full px-2 py-[2px] font-mono text-[10px] font-semibold"
                style={{
                  backgroundColor: tintStyles.amber.bg,
                  color: tintStyles.amber.color,
                }}
              >
                {item.badge}
              </span>
            ) : null}
          </div>
          <div className="mt-1 min-w-0 font-mono text-[11px] text-fg-muted">
            <TimelineMeta item={item} />
          </div>
          {item.url ? (
            <a
              className="mt-1 inline-flex max-w-full items-center gap-1 truncate font-mono text-[12px] text-fg hover:text-accent-text hover:underline"
              href={item.url}
              rel="noreferrer noopener"
              target="_blank"
            >
              <span className="truncate">{item.urlLabel}</span>
              <ArrowUpRight aria-hidden className="shrink-0" size={11} />
            </a>
          ) : null}
          {item.note ? (
            <div className="mt-1 truncate text-[11.5px] text-fg-muted">{item.note}</div>
          ) : null}
          {item.details?.length ? (
            <dl className="m-0 mt-2 flex flex-wrap gap-1.5">
              {item.details.map((detail) => (
                <div
                  className="flex min-w-0 items-baseline gap-1 rounded-md border border-border bg-bg-sunken px-2 py-1"
                  key={detail.label}
                >
                  <dt className="font-mono text-[9.5px] uppercase tracking-[0.4px] text-fg-muted">
                    {detail.label}
                  </dt>
                  <dd className="m-0 min-w-0">
                    <MonoText className="break-all text-fg-muted" component="span" size="sm">
                      {detail.value}
                    </MonoText>
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        {item.position ? (
          <span className="font-mono text-[13px] font-semibold text-fg md:pt-1">
            {item.position}
          </span>
        ) : null}
        {canDelete && item.removable ? (
          <RemoveNoteAction projectId={projectId} signalId={item.id} />
        ) : null}
      </div>
    </div>
  );
}
