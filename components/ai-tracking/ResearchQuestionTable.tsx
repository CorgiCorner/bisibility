"use client";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  FloatingSelectionBar,
  FloatingSelectionBarSpacer,
} from "@/components/ui/FloatingSelectionBar";
import { questionGroupKey } from "@/lib/ai-research/prompt-research-projection";
import { researchSelectionCost } from "@/lib/ai-research/research-cost";
import type { ResearchQuestion } from "@/lib/ai-research/research-questions";
import { researchTopics } from "@/lib/ai-research/research-topics";
import { aiVisibilityTabHref } from "@/lib/ai-tracking/ai-visibility-paths";
import type { AnswerHighlightEntity } from "@/lib/ai-tracking/answer-highlight";
import type { TrackingWorkspaceData } from "@/lib/ai-tracking/projections/workspace";
import { formatPromptUsd } from "@/lib/ai-tracking/prompt-format";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { overviewEngineCopy, overviewEngineLabel, overviewList } from "./overview-labels";
import { PromptResearchReview } from "./PromptResearchReview";
import { ResearchAnswerPanel } from "./ResearchAnswerPanel";
import { type ResearchTableRow, researchQuestionColumns } from "./ResearchQuestionColumns";
import { type ResearchPresenceFilter, ResearchQuestionFilters } from "./ResearchQuestionFilters";

export function ResearchQuestionTable({
  canWrite,
  dailyUsdPerPrompt,
  engines,
  entities,
  keyword,
  projectId,
  questions,
  reportId,
  topics,
}: Readonly<{
  canWrite: boolean;
  dailyUsdPerPrompt: number | null;
  engines: readonly string[];
  entities: readonly AnswerHighlightEntity[];
  keyword: string;
  projectId: string;
  questions: ResearchQuestion[];
  reportId: string;
  topics: TrackingWorkspaceData["topics"];
}>) {
  const t = useTranslations("projectAiTracking.research");
  const tracking = useTranslations("projectAiTracking");
  const locale = useLocale();
  const [presence, setPresence] = useState<ResearchPresenceFilter>("all");
  const [topic, setTopic] = useState("all");
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [review, setReview] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [savedTopics, setSavedTopics] = useState(topics);
  const [added, setAdded] = useState<number | null>(null);
  const [skipped, setSkipped] = useState(0);
  const rowsWithFlags = questions.map((question) => ({
    ...question,
    tracked: question.tracked || saved.includes(questionGroupKey(question.text)),
  }));
  const topicGroups = researchTopics(
    rowsWithFlags.map((question) => ({ id: question.id, text: question.text })),
  );
  const topicIds = new Set(topicGroups.find((item) => item.id === topic)?.questionIds ?? []);
  const visible = rowsWithFlags.filter((question) => {
    if (presence !== "all" && question.presence !== presence) return false;
    if (topic !== "all" && !topicIds.has(question.id)) return false;
    return true;
  });
  const selected = rowsWithFlags.filter(
    (question) => !question.tracked && selection.has(question.id),
  );
  const tableRows: ResearchTableRow[] = visible.flatMap((question) => {
    const row: ResearchTableRow = { ...question, kind: "row" };
    return expanded.has(row.id)
      ? [row, { ...row, id: `answer-${row.id}`, kind: "section" }]
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
  const columns = useMemo(
    () => researchQuestionColumns(t, tracking, locale, expanded, toggleExpanded),
    [expanded, locale, t, toggleExpanded, tracking],
  );
  const engineLabels = overviewEngineCopy(tracking);
  const engineList = overviewList(
    locale,
    engines.map((engine) => overviewEngineLabel(engine, engineLabels)),
  );
  const daily = researchSelectionCost(dailyUsdPerPrompt, selected.length);
  const dailyLine = engineList
    ? daily == null
      ? t("trackDaily", { engines: engineList })
      : t("trackDailyCost", { cost: formatPromptUsd(daily, locale), engines: engineList })
    : t("trackDailyPlain");
  return (
    <>
      {added != null ? (
        <p className="m-0 text-ui-body" role="status">
          {t("addedSkipped", { added, skipped })}{" "}
          <Button href={aiVisibilityTabHref(projectId, "prompts")} size="sm" variant="ghost">
            {t("openPrompts")}
          </Button>
        </p>
      ) : null}
      <ResearchQuestionFilters
        onPresence={setPresence}
        onTopic={setTopic}
        presence={presence}
        questions={rowsWithFlags}
        topic={topic}
        topics={topicGroups}
      />
      <DataTable
        ariaLabel={t("resultsTitle", { keyword })}
        bordered={false}
        columns={columns}
        density="compact"
        emptyState={
          <EmptyState
            description={t("emptyHint")}
            title={questions.length === 0 ? t("emptyTitle", { keyword }) : t("filterEmpty")}
          />
        }
        id="prompt-research-table"
        onSelectionChange={setSelection}
        onSortingChange={() => undefined}
        pagination={null}
        renderSection={(row) => <ResearchAnswerPanel entities={entities} question={row} />}
        rows={tableRows}
        selectable={(row) => row.kind === "row" && canWrite && !row.tracked}
        selection={selection}
        sorting={null}
      />
      <FloatingSelectionBar
        ariaLabel={t("bulkActions")}
        clearLabel={t("clearSelection")}
        count={selected.length}
        countLabel={t("selected", { count: String(selected.length) })}
        onClear={() => setSelection(new Set())}
      >
        <span className="text-ui-caption text-fg-muted">{dailyLine}</span>
        <Button onClick={() => setReview(true)} size="sm">
          {t("trackSelected")}
        </Button>
      </FloatingSelectionBar>
      {selected.length ? <FloatingSelectionBarSpacer /> : null}
      {review ? (
        <PromptResearchReview
          keyword={keyword}
          onClose={() => setReview(false)}
          onSaved={(result) => {
            setSaved(result.tracked.map(questionGroupKey));
            setSavedTopics(result.topics);
            setAdded(result.added);
            setSkipped(Math.max(0, selected.length - result.added));
            setReview(false);
            setSelection(new Set());
          }}
          projectId={projectId}
          prompts={selected.map((question) => question.prompt)}
          reportId={reportId}
          topics={savedTopics}
        />
      ) : null}
    </>
  );
}
