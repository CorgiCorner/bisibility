import type { UrlPresenceView } from "@/lib/queries/keywords";

export type IndexStatusDisplay = {
  chips: { label: string }[];
  detail: string;
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

export function indexStatusDisplay(
  presence: UrlPresenceView | null | undefined,
): IndexStatusDisplay | null {
  if (!presence) return null;
  const coverage = presence.coverageState?.toLocaleLowerCase() ?? "";
  const inSitemap = coverage.includes("submitted") && !coverage.includes("not submitted");
  return {
    chips: [
      {
        label: presence.indexed ? "Indexed" : "Not indexed",
      },
      ...(presence.canonicalOk === true
        ? [{ label: "Canonical self" }]
        : presence.canonicalOk === false
          ? [{ label: "Canonical mismatch" }]
          : []),
      ...(inSitemap ? [{ label: "In sitemap" }] : []),
    ],
    detail: presence.lastCrawlAt
      ? `last crawled ${dateLabel(presence.lastCrawlAt)}`
      : `checked ${dateLabel(presence.checkedAt)}`,
  };
}

export function KeywordIndexStatus({
  presence,
}: Readonly<{
  presence: UrlPresenceView | null | undefined;
}>) {
  const display = indexStatusDisplay(presence);
  if (!display) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border-soft pt-3 font-mono text-[11px] text-fg-muted">
      <span className="uppercase tracking-[0.5px] text-fg-muted">Index status</span>
      {display.chips.map((chip) => (
        <span
          className="inline-flex rounded-full border border-border bg-bg-sunken px-2 py-[3px] font-semibold text-fg"
          key={chip.label}
        >
          {chip.label}
        </span>
      ))}
      <span>{display.detail}</span>
    </div>
  );
}
