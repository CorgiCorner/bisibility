"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("projectResearch.tabs");
  if (tabs.length <= 1) return null;
  return (
    <div
      aria-label={t("aria")}
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
            <Tooltip content={tab.seed}>
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
                aria-label={t("close", { seed: tab.seed })}
                className={`grid h-5 w-5 shrink-0 place-items-center rounded transition-colors ${active ? "text-accent-text hover:text-fg" : "text-fg-muted hover:text-fg"}`}
                onClick={() => onClose(tab.id)}
                type="button"
              >
                <X aria-hidden size={12} weight="regular" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
