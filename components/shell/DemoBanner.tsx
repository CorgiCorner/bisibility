import { EyeIcon } from "@phosphor-icons/react/dist/ssr/Eye";

type DemoBannerProps = {
  actor: "owner" | "viewer";
  capturedAt: string | null;
  mode: "editable" | "legacy-read-only";
};

export function DemoBanner({ actor, capturedAt, mode }: Readonly<DemoBannerProps>) {
  const isEditable = mode === "editable";
  const message = isEditable
    ? actor === "owner"
      ? "Changes you make here are visible to demo visitors."
      : "Browse read-only saved data. Changes and new checks are disabled."
    : "Explore saved rankings. Changes and new checks are disabled.";
  return (
    <div
      className="flex min-h-10 flex-wrap items-center gap-2 border-b border-border bg-bg-elev px-4 py-2 text-xs text-fg-muted"
      role="status"
    >
      <EyeIcon aria-hidden className="shrink-0 text-accent-text" size={17} weight="regular" />
      <p className="m-0 flex-1">
        <strong className="font-semibold text-fg">
          {isEditable && actor === "owner" ? "Demo workspace." : "Read-only demo."}
        </strong>{" "}
        {message}
      </p>
      {!isEditable && capturedAt ? (
        <time dateTime={capturedAt}>Snapshot: {capturedAt.slice(0, 10)} UTC</time>
      ) : null}
    </div>
  );
}
