import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react";

type ChartNoDataOverlayProps = {
  description?: string;
  title?: string;
};

export function ChartNoDataOverlay({
  description = "appears after the first check",
  title = "No data to display",
}: Readonly<ChartNoDataOverlayProps>) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
      <div className="flex flex-col items-center gap-2">
        <span
          className="grid h-10 w-10 place-items-center rounded-[11px] text-fg-muted"
          style={{ backgroundColor: "color-mix(in srgb, var(--fg-muted) 12%, transparent)" }}
        >
          <ChartLineUp aria-hidden size={20} weight="bold" />
        </span>
        <span className="text-sm font-semibold text-fg">{title}</span>
        <span className="font-mono text-[11px] text-fg-muted">{description}</span>
      </div>
    </div>
  );
}
