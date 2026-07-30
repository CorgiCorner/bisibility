"use client";

import Tooltip from "@mui/material/Tooltip";
import { XIcon as X } from "@phosphor-icons/react";
import type { ResearchTab } from "./research-workspace-model";

export function ResearchSeedTabs({
  activeId,
  onChange,
  onClose,
  tabs,
}: Readonly<{
  activeId?: string;
  onChange: (id: string) => void;
  onClose?: (id: string) => void;
  tabs: ResearchTab[];
}>) {
  if (tabs.length <= 1) return null;
  return (
    <div
      aria-label="Research seed tabs"
      className="flex items-center gap-0.5 overflow-x-auto border-b border-border"
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            className={`-mb-px flex items-center gap-1 border-b-2 px-3 transition-colors ${active ? "border-accent" : "border-transparent"}`}
            key={tab.id}
          >
            <Tooltip title={tab.seed}>
              <button
                aria-selected={active}
                className={`max-w-[190px] truncate py-2.5 text-[13px] font-semibold transition-colors ${active ? "text-fg" : "text-fg-muted hover:text-fg"}`}
                onClick={() => onChange(tab.id)}
                role="tab"
                type="button"
              >
                {tab.seed}
              </button>
            </Tooltip>
            {onClose ? (
              <button
                aria-label={`Close ${tab.seed}`}
                className={`grid h-5 w-5 shrink-0 place-items-center rounded transition-colors ${active ? "text-accent hover:text-fg" : "text-fg-muted hover:text-fg"}`}
                onClick={() => onClose(tab.id)}
                type="button"
              >
                <X aria-hidden size={12} weight="bold" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
