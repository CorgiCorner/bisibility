"use client";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  FloatingSelectionBar,
  FloatingSelectionBarSpacer,
} from "@/components/ui/FloatingSelectionBar";
import {
  questionGroupKey,
  type ResearchedPrompt,
} from "@/lib/ai-research/prompt-research-projection";
import type { TrackingWorkspaceData } from "@/lib/ai-tracking/projections/workspace";
import { appPath } from "@/lib/routing/app-path";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import {
  PromptResearchExpand,
  PromptResearchSourceCount,
  PromptResearchText,
} from "./PromptResearchCells";
import { PromptResearchMobile } from "./PromptResearchMobile";
import { PromptResearchReview } from "./PromptResearchReview";
import { PromptResearchSourcePanel } from "./PromptResearchSourcePanel";

type ResearchTableRow = ResearchedPrompt & { id: string; label: string; kind: "row" | "section" };
export function PromptResearchTable({
  projectId,
  keyword,
  reportId,
  prompts,
  topics,
  canWrite,
  cached = false,
}: Readonly<{
  projectId: string;
  keyword: string;
  reportId: string;
  prompts: ResearchedPrompt[];
  topics: TrackingWorkspaceData["topics"];
  canWrite: boolean;
  cached?: boolean;
}>) {
  const t = useTranslations("projectAiTracking.research");
  const mobile = useMediaQuery("(max-width: 639px)");
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [review, setReview] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [savedTopics, setSavedTopics] = useState(topics);
  const [added, setAdded] = useState(0);
  const promptsWithFlags = prompts.map((prompt) => ({
    ...prompt,
    tracked: prompt.tracked || saved.includes(questionGroupKey(prompt.text)),
  }));
  const selected = promptsWithFlags.filter(
    (prompt) => !prompt.tracked && selection.has(String(prompt.rowIndex)),
  );
  const rows: ResearchTableRow[] = promptsWithFlags.flatMap((prompt) => {
    const row: ResearchTableRow = {
      ...prompt,
      id: String(prompt.rowIndex),
      label: prompt.text,
      kind: "row",
    };
    return expanded.has(row.id)
      ? [row, { ...row, id: `sources-${row.id}`, kind: "section" as const }]
      : [row];
  });
  const toggleExpanded = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const columns = useMemo<readonly DataTableColumn<ResearchTableRow>[]>(
    () => [
      {
        id: "prompt",
        header: t("prompt"),
        size: 240,
        minSize: 240,
        meta: { flex: 1, lockVisible: true },
        cell: ({ row: { original } }) => <PromptResearchText prompt={original} />,
      },
      {
        id: "sources",
        header: t("sources"),
        size: 180,
        minSize: 150,
        cell: ({ row: { original } }) => <PromptResearchSourceCount prompt={original} />,
      },
      {
        id: "expand",
        header: () => <span className="sr-only">{t("details")}</span>,
        size: 60,
        minSize: 60,
        meta: { lockResize: true, lockVisible: true },
        cell: ({ row: { original } }) => (
          <PromptResearchExpand
            prompt={original}
            expanded={expanded.has(original.id)}
            onToggle={() => toggleExpanded(original.id)}
          />
        ),
      },
    ],
    [expanded, t, toggleExpanded],
  );
  return (
    <>
      {added > 0 ? (
        <p role="status" className="m-0 text-ui-body">
          <Button href={appPath(projectId, "prompt-tracker")} size="sm" variant="ghost">
            {t("added", { count: String(added) })}
          </Button>
        </p>
      ) : null}
      <section
        className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev"
        aria-labelledby="research-results"
      >
        <div className="flex flex-col items-start justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-center">
          <h2 id="research-results" className="m-0 min-w-0 break-words text-[15px] font-semibold">
            {t("resultsTitle", { keyword })}
          </h2>
          <div className="flex flex-wrap justify-start gap-x-3 sm:ml-auto sm:justify-end text-ui-xs text-fg-muted">
            {cached ? <span>{t("cached")}</span> : null}
            <span>{t("promptCount", { count: prompts.length })}</span>
          </div>
        </div>
        {mobile && rows.length ? (
          <PromptResearchMobile
            prompts={promptsWithFlags}
            keyword={keyword}
            canWrite={canWrite}
            selection={selection}
            expanded={expanded}
            onSelectionChange={setSelection}
            onToggle={toggleExpanded}
          />
        ) : (
          <DataTable
            id="prompt-research-table"
            ariaLabel={t("resultsTitle", { keyword })}
            bordered={false}
            columns={columns}
            rows={rows}
            sorting={null}
            onSortingChange={() => undefined}
            pagination={null}
            selection={selection}
            onSelectionChange={setSelection}
            selectable={(row) => row.kind === "row" && canWrite && !row.tracked}
            rowClassName={() => "h-auto! min-h-14 [&_[role=cell]]:py-3"}
            renderSection={(row) => <PromptResearchSourcePanel prompt={row} />}
            emptyState={
              <EmptyState title={t("emptyTitle", { keyword })} description={t("emptyHint")} />
            }
          />
        )}
      </section>
      <FloatingSelectionBar
        ariaLabel={t("bulkActions")}
        clearLabel={t("clearSelection")}
        count={selected.length}
        countLabel={t("selected", { count: String(selected.length) })}
        onClear={() => setSelection(new Set())}
      >
        <Button size="sm" onClick={() => setReview(true)}>
          {t("trackPrompts")}
        </Button>
      </FloatingSelectionBar>
      {selected.length ? <FloatingSelectionBarSpacer /> : null}
      {review ? (
        <PromptResearchReview
          projectId={projectId}
          keyword={keyword}
          reportId={reportId}
          prompts={selected}
          topics={savedTopics}
          onClose={() => setReview(false)}
          onSaved={(result) => {
            setSaved(result.tracked.map(questionGroupKey));
            setSavedTopics(result.topics);
            setAdded(result.added);
            setReview(false);
            setSelection(new Set());
          }}
        />
      ) : null}
    </>
  );
}
