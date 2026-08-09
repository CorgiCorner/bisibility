import type { UrlPresenceView } from "@/lib/queries/keywords";

type StatusTone = "amber" | "green";

export type IndexStatusDisplay = {
  canonicalHint: string | null;
  detail: string;
  label: string;
  tone: StatusTone;
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
  return {
    canonicalHint: presence.canonicalOk === false ? "Canonical mismatch" : null,
    detail: presence.lastCrawlAt
      ? `last crawled ${dateLabel(presence.lastCrawlAt)}`
      : `checked ${dateLabel(presence.checkedAt)}`,
    label: presence.indexed ? "Indexed" : "Not indexed",
    tone: presence.indexed ? "green" : "amber",
  };
}

function pillClassName(tone: StatusTone) {
  return tone === "green" ? "bg-green/10 text-green-text" : "bg-yellow/15 text-(--yellow-text)";
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
      <span
        className={`inline-flex rounded-full px-2 py-[3px] font-semibold ${pillClassName(
          display.tone,
        )}`}
      >
        {display.label}
      </span>
      <span>{display.detail}</span>
      {display.canonicalHint ? (
        <span className="text-(--yellow-text)">{display.canonicalHint}</span>
      ) : null}
    </div>
  );
}
