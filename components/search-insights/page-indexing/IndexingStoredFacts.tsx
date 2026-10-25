"use client";

import type { IndexingUrl } from "@/lib/search-index/ui-model";
import { useFormatter, useTranslations } from "next-intl";
import { z } from "zod";
import { useInspectionLabel } from "./inspection-label";

const richSummary = z.object({
  verdict: z.string().nullable(),
  detectedItems: z.array(
    z.object({
      richResultType: z.string().nullable(),
      itemCount: z.number(),
      issueCount: z.number(),
    }),
  ),
});

export function IndexingRichResults({ value }: Readonly<{ value: unknown }>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const label = useInspectionLabel();
  const parsed = richSummary.safeParse(value);
  if (!parsed.success) return "-";
  const verdict = label("verdict", parsed.data.verdict);
  return (
    <div className="flex flex-col gap-1">
      <span>{verdict}</span>
      {parsed.data.detectedItems.map((item, index) => (
        <span key={`${index}:${item.richResultType}`}>
          {item.richResultType ?? "-"}
          {": "}
          {t("richCounts", {
            items: item.itemCount,
            issues: item.issueCount,
          })}
        </span>
      ))}
    </div>
  );
}

const historyState = z.object({
  coverageState: z.string().nullish(),
  verdict: z.string().nullish(),
});

type Change = NonNullable<IndexingUrl["history"]>["changes"][number];

export function IndexingHistoryLine({
  change,
  timeZone,
}: Readonly<{ change: Change; timeZone: string }>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  const label = useInspectionLabel();
  const previous = historyState.safeParse(change.previous).data;
  const next = historyState.safeParse(change.next).data;
  const baseline = !previous?.coverageState && !previous?.verdict;
  const coverageChanged = previous?.coverageState !== next?.coverageState;
  const previousLabel =
    coverageChanged && previous?.coverageState
      ? previous.coverageState
      : label("verdict", previous?.verdict);
  const nextLabel =
    (baseline || coverageChanged) && next?.coverageState
      ? next.coverageState
      : label("verdict", next?.verdict);
  const date = format.dateTime(new Date(change.at), { timeZone, dateStyle: "medium" });
  return t(baseline ? "historyBaseline" : "historyTransition", {
    date,
    previous: previousLabel,
    next: nextLabel,
  });
}
