import type { ReactNode } from "react";

export function SeriesTooltipContent({
  accessibilityLayer,
  active,
  activeIndex,
  renderTooltip,
}: {
  accessibilityLayer?: boolean;
  active?: boolean;
  activeIndex?: string | null;
  renderTooltip: (index: number) => ReactNode;
}) {
  if (!active || activeIndex == null) return null;
  const index = Number(activeIndex);
  if (!Number.isInteger(index) || index < 0) return null;
  const body = renderTooltip(index);
  if (body == null || body === false) return null;
  return (
    <div
      aria-live={accessibilityLayer ? "assertive" : undefined}
      className="m-0 rounded-md border border-border bg-bg-elev p-2.5 text-xs text-fg"
      role={accessibilityLayer ? "status" : undefined}
    >
      {body}
    </div>
  );
}
