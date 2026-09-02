import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react/lib";

type ChartNoDataOverlayProps = {
  description?: string;
  icon?: Icon;
  title?: string;
};

export function ChartNoDataOverlay({
  description = "appears after the first check",
  icon: Icon = ChartLineUp,
  title = "No data to display",
}: Readonly<ChartNoDataOverlayProps>) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-control bg-bg-sunken text-fg-muted">
          <Icon aria-hidden data-icon={Icon.displayName} size={20} weight="regular" />
        </span>
        <span className="text-sm font-semibold text-fg">{title}</span>
        <span className="font-sans tabular-nums text-[11px] text-fg-muted">{description}</span>
      </div>
    </div>
  );
}
