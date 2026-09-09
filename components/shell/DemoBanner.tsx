import { EyeIcon } from "@phosphor-icons/react/dist/ssr";

export function DemoBanner({ capturedAt }: { capturedAt: string | null }) {
  return (
    <div
      className="flex min-h-10 flex-wrap items-center gap-2 border-b border-border bg-bg-elev px-4 py-2 text-xs text-fg-muted"
      role="status"
    >
      <EyeIcon aria-hidden className="shrink-0 text-accent-text" size={17} weight="regular" />
      <p className="m-0 flex-1">
        <strong className="font-semibold text-fg">Read-only demo.</strong> Explore saved rankings.
        Changes and new checks are disabled.
      </p>
      {capturedAt ? (
        <time dateTime={capturedAt}>Snapshot: {capturedAt.slice(0, 10)} UTC</time>
      ) : null}
    </div>
  );
}
