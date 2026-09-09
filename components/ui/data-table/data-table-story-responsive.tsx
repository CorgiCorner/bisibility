"use client";

import { DataTableStoryHarness } from "./DataTableStoryHarness";

const widths = [375, 768, 1024] as const;

export function DataTableResponsiveStory() {
  return (
    <div className="grid min-w-0 gap-8 overflow-hidden">
      {widths.map((width) => (
        <section
          className="min-w-0 max-w-full"
          data-testid={`responsive-${width}`}
          key={width}
          style={{ width }}
        >
          <h2 className="mb-2 font-mono text-[11px] font-semibold text-fg-muted">{width}px</h2>
          <DataTableStoryHarness id={`responsive-table-${width}`} showDensityMenu={false} />
        </section>
      ))}
    </div>
  );
}
