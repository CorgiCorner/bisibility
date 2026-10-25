"use client";
import { Checkbox } from "@/components/ui/Checkbox";
import type { ResearchedPrompt } from "@/lib/ai-research/prompt-research-projection";
import { useTranslations } from "next-intl";
import {
  PromptResearchExpand,
  PromptResearchSourceCount,
  PromptResearchText,
} from "./PromptResearchCells";
import { PromptResearchSources } from "./PromptResearchSources";

export function PromptResearchMobile({
  prompts,
  keyword,
  canWrite,
  selection,
  expanded,
  onSelectionChange,
  onToggle,
}: Readonly<{
  prompts: ResearchedPrompt[];
  keyword: string;
  canWrite: boolean;
  selection: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  onSelectionChange: (next: ReadonlySet<string>) => void;
  onToggle: (id: string) => void;
}>) {
  const t = useTranslations("projectAiTracking.research");
  const tableT = useTranslations("shared.controls.dataTable");
  const selectable = prompts.filter((prompt) => canWrite && !prompt.tracked);
  const allSelected =
    selectable.length > 0 && selectable.every((prompt) => selection.has(String(prompt.rowIndex)));
  return (
    <>
      {selectable.length ? (
        <div className="border-b border-border-soft px-3 py-2">
          <Checkbox
            label={t("selectAll")}
            checked={allSelected}
            onChange={(event) => {
              onSelectionChange(
                event.target.checked
                  ? new Set(selectable.map((prompt) => String(prompt.rowIndex)))
                  : new Set(),
              );
            }}
          />
        </div>
      ) : null}
      <ul
        aria-label={t("resultsTitle", { keyword })}
        className="m-0 min-w-0 list-none divide-y divide-border-soft p-0"
      >
        {prompts.map((prompt) => {
          const id = String(prompt.rowIndex);
          const open = expanded.has(id);
          return (
            <li
              key={id}
              className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)_32px] items-start gap-x-3 gap-y-2 px-3 py-3 text-ui-body"
            >
              <div className="pt-1">
                {canWrite && !prompt.tracked ? (
                  <Checkbox
                    aria-label={tableT("selectRow", { row: prompt.text })}
                    checked={selection.has(id)}
                    onChange={(event) => {
                      const next = new Set(selection);
                      if (event.target.checked) next.add(id);
                      else next.delete(id);
                      onSelectionChange(next);
                    }}
                  />
                ) : null}
              </div>
              <PromptResearchText prompt={prompt} />
              <PromptResearchExpand prompt={prompt} expanded={open} onToggle={() => onToggle(id)} />
              <div className="col-start-2 col-span-2 text-ui-xs text-fg-muted">
                <PromptResearchSourceCount prompt={prompt} />
              </div>
              {open ? (
                <div
                  id={`research-sources-${id}`}
                  className="col-start-2 col-span-2 min-w-0 border-t border-border-soft pt-2"
                >
                  <PromptResearchSources prompt={prompt} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
