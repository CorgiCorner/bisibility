"use client";

import { Pill } from "@/components/ui/Pill";
import { Tooltip } from "@/components/ui/Tooltip";
import { researchPresenceCounts } from "@/lib/ai-research/research-presence";
import type { ResearchQuestion } from "@/lib/ai-research/research-questions";
import type { ResearchTopic } from "@/lib/ai-research/research-topics";
import { useTranslations } from "next-intl";

const PRESENCE = ["all", "missing", "shared", "only_you"] as const;

export function ResearchQuestionFilters({
  onPresence,
  onTopic,
  presence,
  questions,
  topic,
  topics,
}: Readonly<{
  onPresence: (value: (typeof PRESENCE)[number]) => void;
  onTopic: (value: string) => void;
  presence: (typeof PRESENCE)[number];
  questions: readonly ResearchQuestion[];
  topic: string;
  topics: readonly ResearchTopic[];
}>) {
  const t = useTranslations("projectAiTracking.research");
  const counts = researchPresenceCounts(questions);
  const tabs = [
    { count: counts.all, id: "all", label: t("presenceAll"), tip: t("presenceAllTip") },
    {
      count: counts.missing,
      id: "missing",
      label: t("presenceMissing"),
      tip: t("presenceMissingTip"),
    },
    { count: counts.shared, id: "shared", label: t("presenceShared"), tip: t("presenceSharedTip") },
    {
      count: counts.onlyYou,
      id: "only_you",
      label: t("presenceOnlyYou"),
      tip: t("presenceOnlyYouTip"),
    },
  ] as const;
  return (
    <div className="grid gap-2">
      <div aria-label={t("presenceLabel")} className="flex flex-wrap gap-1" role="tablist">
        {tabs.map((item) => (
          <Tooltip content={item.tip} key={item.id} semantics="description">
            <Pill
              active={presence === item.id}
              aria-selected={presence === item.id}
              onClick={() => onPresence(item.id)}
              role="tab"
              size="sm"
              type="button"
            >
              {t("presenceCount", { count: item.count, label: item.label })}
            </Pill>
          </Tooltip>
        ))}
      </div>
      <div
        aria-label={t("topicsLabel")}
        className="flex flex-wrap items-center gap-1"
        role="toolbar"
      >
        <Tooltip content={t("topicTooltip")} semantics="description">
          <span className="px-1 text-ui-caption text-fg-muted">{t("topicsLabel")}</span>
        </Tooltip>
        <Pill active={topic === "all"} onClick={() => onTopic("all")} size="sm" type="button">
          {t("presenceCount", { count: questions.length, label: t("topicAll") })}
        </Pill>
        {topics.map((item) => (
          <Pill
            active={topic === item.id}
            key={item.id}
            onClick={() => onTopic(item.id)}
            size="sm"
            type="button"
          >
            {t("presenceCount", { count: item.questionIds.length, label: item.label })}
          </Pill>
        ))}
      </div>
    </div>
  );
}

export type ResearchPresenceFilter = (typeof PRESENCE)[number];
