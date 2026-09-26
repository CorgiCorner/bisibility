"use client";

import { Popup } from "@/components/ui/Popup";
import { StatusChip } from "@/components/ui/StatusChip";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { RunStatusCopyGroup } from "./run-status-copy";

type RunStatusLegendProps = {
  groups: readonly RunStatusCopyGroup[];
  label: string;
};

// A popover rather than a tooltip: the full list is taller than a tooltip can scroll.
export function RunStatusLegend({ groups, label }: Readonly<RunStatusLegendProps>) {
  const t = useTranslations("projectRuns.filters");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        aria-expanded={Boolean(anchor)}
        aria-haspopup="dialog"
        aria-label={label}
        className="inline-grid h-6 w-6 shrink-0 cursor-help appearance-none place-items-center rounded-full border-0 bg-transparent p-0 text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-solid"
        onClick={(event) => setAnchor(event.currentTarget)}
        type="button"
      >
        <Info aria-hidden size={12} weight="regular" />
      </button>
      <Popup
        align="start"
        anchorEl={anchor}
        aria-label={label}
        onClose={() => setAnchor(null)}
        open={Boolean(anchor)}
        side="bottom"
      >
        <div className="grid w-[320px] max-w-[calc(100vw-32px)] gap-4 p-3.5 font-normal">
          {groups.map((group) => (
            <section className="grid gap-2" key={group.source}>
              <h3 className="m-0 text-[11px] font-semibold text-fg-muted">
                {group.source === "rank_checks" ? t("rankChecks") : t("searchConsole")}
              </h3>
              <dl className="m-0 grid gap-2">
                {group.entries.map((entry) => (
                  <div className="grid justify-items-start gap-1" key={entry.key}>
                    <dt>
                      <StatusChip label={entry.label} tone={entry.tone} />
                    </dt>
                    <dd className="m-0 text-[12px] leading-[1.45] text-fg">{entry.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Popup>
    </>
  );
}
