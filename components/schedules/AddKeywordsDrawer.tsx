"use client";

import { AppDrawer, Button, MenuSelect, SegmentedControl, ToolbarSearch } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ScheduleKeywordCandidateRow } from "./ScheduleKeywordCandidateRow";
export type ScheduleKeywordCandidate = {
  assigned?: boolean;
  checks: string;
  device: string;
  id: string;
  keyword: string;
  market: string;
  sourceName?: string | null;
  tags: readonly string[];
};
export type AddKeywordsDrawerProps = {
  assignKeywordsAction?: (input: AssignScheduleKeywordsForm) => Promise<unknown>;
  candidates: readonly ScheduleKeywordCandidate[];
  initialFilters?: { device?: string; market?: string; tag?: string };
  initialSelectedKeywordIds?: readonly string[];
  onAssigned?: () => void;
  onClose: () => void;
  onSelect?: (keywordIds: readonly string[]) => void;
  open: boolean;
  projectId: string;
  scheduleId: string;
  scheduleName: string;
};
const assignScheduleKeywordsSchema = z
  .object({
    keywordIds: z.array(z.string().min(1)).min(1).max(500),
    projectId: z.string().min(1),
    scheduleId: z.string().min(1),
  })
  .strict();
type AssignScheduleKeywordsForm = z.infer<typeof assignScheduleKeywordsSchema>;
type Scope = "all" | "selected";
async function assignScheduleKeywords(input: AssignScheduleKeywordsForm) {
  const response = await fetch(`/api/check-schedules/${input.scheduleId}/keywords`, {
    body: JSON.stringify({ keywordIds: input.keywordIds, projectId: input.projectId }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error("Could not add keywords to this schedule.");
}
function options(values: readonly string[], allLabel: string) {
  return [{ label: allLabel, value: "all" }, ...values.map((value) => ({ label: value, value }))];
}
function filterCandidates(
  candidates: readonly ScheduleKeywordCandidate[],
  filters: { device: string; market: string; search: string; tag: string },
) {
  const query = filters.search.trim().toLowerCase();
  return candidates.filter(
    (candidate) =>
      (!query || candidate.keyword.toLowerCase().includes(query)) &&
      (filters.tag === "all" || candidate.tags.includes(filters.tag)) &&
      (filters.market === "all" || candidate.market === filters.market) &&
      (filters.device === "all" || candidate.device === filters.device),
  );
}
export function AddKeywordsDrawer({
  assignKeywordsAction = assignScheduleKeywords,
  candidates,
  initialFilters,
  initialSelectedKeywordIds = [],
  onAssigned,
  onClose,
  onSelect,
  open,
  projectId,
  scheduleId,
  scheduleName,
}: Readonly<AddKeywordsDrawerProps>) {
  const [device, setDevice] = useState(initialFilters?.device ?? "all");
  const [market, setMarket] = useState(initialFilters?.market ?? "all");
  const [scope, setScope] = useState<Scope>("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([...initialSelectedKeywordIds]);
  const [tag, setTag] = useState(initialFilters?.tag ?? "all");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<AssignScheduleKeywordsForm>({
    defaultValues: { keywordIds: [...initialSelectedKeywordIds], projectId, scheduleId },
    resolver: zodResolver(assignScheduleKeywordsSchema),
  });
  const tags = [...new Set(candidates.flatMap((candidate) => candidate.tags))].sort();
  const markets = [...new Set(candidates.map((candidate) => candidate.market))].sort();
  const devices = [...new Set(candidates.map((candidate) => candidate.device))].sort();
  const matchingCandidates = filterCandidates(candidates, { device, market, search, tag });
  const selectedSet = new Set(selectedIds);
  const visibleCandidates =
    scope === "selected"
      ? candidates.filter((candidate) => selectedSet.has(candidate.id))
      : matchingCandidates;
  const activeFilters = tag !== "all" || market !== "all" || device !== "all";
  const selectableMatches = matchingCandidates.filter((candidate) => !candidate.assigned);
  const allMatchesSelected =
    selectableMatches.length > 0 &&
    selectableMatches.every((candidate) => selectedSet.has(candidate.id));

  function updateSelected(next: string[]) {
    setSelectedIds(next);
    form.setValue("keywordIds", next, { shouldValidate: true });
  }

  function close() {
    setScope("all");
    setSelectedIds([]);
    setSubmitError(null);
    form.reset({ keywordIds: [], projectId, scheduleId });
    onClose();
  }

  function toggleCandidate(candidate: ScheduleKeywordCandidate) {
    if (candidate.assigned) return;
    updateSelected(
      selectedSet.has(candidate.id)
        ? selectedIds.filter((id) => id !== candidate.id)
        : [...selectedIds, candidate.id],
    );
  }

  function selectAllMatching() {
    updateSelected(allMatchesSelected ? [] : selectableMatches.map((candidate) => candidate.id));
  }

  async function submit(values: AssignScheduleKeywordsForm) {
    setSubmitError(null);
    try {
      if (onSelect) onSelect(values.keywordIds);
      else {
        await assignKeywordsAction(values);
        onAssigned?.();
      }
      close();
    } catch {
      setSubmitError("Could not add keywords to this schedule. Try again.");
    }
  }
  return (
    <AppDrawer
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span className="min-w-0 text-[11.5px] leading-5 text-fg-muted">
            {selectedIds.length
              ? `${selectedIds.length} selected`
              : "Choose keywords to add to this schedule."}
          </span>
          <div className="flex shrink-0 items-center gap-2.5">
            <Button onClick={close} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={selectedIds.length === 0}
              form="schedule-add-keywords-form"
              loading={form.formState.isSubmitting}
              loadingLabel="Adding..."
              type="submit"
            >
              {selectedIds.length ? `Add ${selectedIds.length} keywords` : "Add keywords"}
            </Button>
          </div>
        </div>
      }
      onClose={close}
      open={open}
      title={
        <span className="block">
          <span className="block">Add keywords</span>
          <span className="mt-1 block text-[12px] font-normal text-fg-muted">
            to {scheduleName}
          </span>
        </span>
      }
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        id="schedule-add-keywords-form"
        onSubmit={(event) => {
          event.stopPropagation();
          void form.handleSubmit(submit)(event);
        }}
      >
        <div className="flex flex-col gap-2.5 border-b border-border pb-3.5">
          <ToolbarSearch
            id="schedule-keyword-search"
            label="Search keywords"
            onChange={setSearch}
            placeholder="Search keywords"
            value={search}
            variant="outlined"
          />
          <div className="flex flex-wrap gap-1.5">
            <MenuSelect
              ariaLabel="Tag"
              compact
              onChange={setTag}
              options={options(tags, "All tags")}
              selectedContent={(option) =>
                option?.value === "all" ? "Tag" : `Tag: ${option?.label}`
              }
              triggerClassName="min-h-7 rounded-full px-2.5 text-[11.5px] font-semibold"
              value={tag}
            />
            <MenuSelect
              ariaLabel="Market"
              compact
              onChange={setMarket}
              options={options(markets, "All markets")}
              selectedContent={(option) =>
                option?.value === "all" ? "Market" : `Market: ${option?.label}`
              }
              triggerClassName="min-h-7 rounded-full px-2.5 text-[11.5px] font-semibold"
              value={market}
            />
            <MenuSelect
              ariaLabel="Device"
              compact
              onChange={setDevice}
              options={options(devices, "All devices")}
              selectedContent={(option) =>
                option?.value === "all" ? "Device" : `Device: ${option?.label}`
              }
              triggerClassName="min-h-7 rounded-full px-2.5 text-[11.5px] font-semibold"
              value={device}
            />
          </div>
          {activeFilters ? (
            <p className="m-0 text-[11.5px] leading-5 text-fg-muted">
              Matches {matchingCandidates.length} now. New keywords will not join automatically.
            </p>
          ) : null}
        </div>
        {activeFilters || selectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2.5">
            <div className="flex items-center gap-1.5">
              {activeFilters ? (
                <Button onClick={selectAllMatching} size="xs" type="button" variant="secondary">
                  {allMatchesSelected
                    ? `Clear selection (${selectedIds.length})`
                    : `Select all ${selectableMatches.length} matching`}
                </Button>
              ) : null}
              {selectedIds.length ? (
                <Button onClick={() => updateSelected([])} size="xs" type="button" variant="ghost">
                  Clear
                </Button>
              ) : null}
            </div>
            {selectedIds.length ? (
              <SegmentedControl
                ariaLabel="List scope"
                fitContent
                onChange={setScope}
                options={[
                  { label: "All", value: "all" },
                  { label: `Selected (${selectedIds.length})`, value: "selected" },
                ]}
                size="xs"
                value={scope}
              />
            ) : null}
          </div>
        ) : null}
        {submitError ? (
          <p className="m-0 pt-3 text-[12px] text-red-text" role="alert">
            {submitError}
          </p>
        ) : null}
        <div className="mt-1.5 min-h-0 flex-1 overflow-y-auto">
          {visibleCandidates.map((candidate) => (
            <ScheduleKeywordCandidateRow
              candidate={candidate}
              key={candidate.id}
              onToggle={() => toggleCandidate(candidate)}
              selected={selectedSet.has(candidate.id)}
            />
          ))}
          {visibleCandidates.length === 0 ? (
            <p className="m-0 px-3 py-8 text-center text-[12px] text-fg-muted">
              No keywords match.
            </p>
          ) : null}
        </div>
      </form>
    </AppDrawer>
  );
}
