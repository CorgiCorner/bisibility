"use client";

import { AiVisibilityOverviewFilters } from "@/components/ai-tracking/AiVisibilityOverviewFilters";
import { AiVisibilityTabs } from "@/components/ai-tracking/AiVisibilityTabs";
import { aiVisibilityBlocks } from "@/components/tracking-loading/ai-visibility-layout";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { OverviewFilters } from "@/lib/ai-tracking/overview-model";
import type { SourceOverrideType } from "@/lib/ai-tracking/source-types";
import type { AiSourcePlanState, AiVisibilitySourcesLoad } from "@/lib/ai-tracking/sources-model";
import { LinkSimpleIcon } from "@phosphor-icons/react/dist/csr/LinkSimple";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AiVisibilitySourcesPlan } from "./AiVisibilitySourcesPlan";
import { AiVisibilitySourcesTable } from "./AiVisibilitySourcesTable";
import {
  AiVisibilitySourcesTiles,
  activeSourcePill,
  type SourcePill,
  sourcePillRows,
} from "./AiVisibilitySourcesTiles";

export function AiVisibilitySourcesView({
  error,
  model,
  onAdd,
  onClearType,
  onFilter,
  onRemove,
  onSetType,
  onUpdatePlan,
  pending,
  projectId,
}: Readonly<{
  error: string | null;
  model: AiVisibilitySourcesLoad;
  onAdd: (domain: string, url: string | null) => void;
  onClearType: (domain: string) => void;
  onFilter: (filters: OverviewFilters) => void;
  onRemove: (domain: string) => void;
  onSetType: (domain: string, type: SourceOverrideType) => void;
  onUpdatePlan: (
    domain: string,
    patch: { note?: string | null; state?: AiSourcePlanState },
  ) => void;
  pending: boolean;
  projectId: string;
}>) {
  const t = useTranslations("projectAiTracking");
  const [group, setGroup] = useState<"domains" | "pages">("domains");
  const [pill, setPill] = useState<SourcePill>("all");
  const { sources } = model;
  const selected = activeSourcePill(sources, pill);
  const rows = sourcePillRows(group === "pages" ? sources.pages : sources.rows, selected);
  const ready = model.hasAnswers && sources.totalAnswers > 0;
  return (
    <div
      className="flex min-w-0 flex-col gap-5"
      data-visibility-blocks={aiVisibilityBlocks.sources.join(" ")}
      data-visibility-tab="sources"
    >
      <AiVisibilityTabs active="sources" projectId={projectId} />
      <p className="m-0 text-ui-body text-fg-muted">{t("sources.lead")}</p>
      {model.hasAnswers ? (
        <AiVisibilityOverviewFilters
          engines={model.engines}
          filters={model.filters}
          markets={model.markets}
          onFilter={onFilter}
          topics={model.topics}
        />
      ) : null}
      {model.hasAnswers && sources.truncated ? (
        <p className="m-0 text-ui-caption text-fg-muted">
          {t("sources.truncated", { count: sources.limit })}
        </p>
      ) : null}
      {error ? (
        <p className="m-0 text-ui-caption text-fg-muted" role="alert">
          {error}
        </p>
      ) : null}
      {!model.hasAnswers ? (
        <EmptyState
          description={t("sources.emptyDescription")}
          icon={<LinkSimpleIcon aria-hidden size={22} weight="regular" />}
          title={t("sources.emptyTitle")}
        />
      ) : null}
      {model.hasAnswers && sources.totalAnswers === 0 ? (
        <p className="m-0 text-ui-body text-fg-muted">{t("sources.filteredEmpty")}</p>
      ) : null}
      {ready ? (
        <>
          <AiVisibilitySourcesTiles onPill={setPill} pill={selected} sources={sources} />
          <div className="flex justify-end">
            <SegmentedControl
              ariaLabel={t("sources.group")}
              onChange={setGroup}
              options={[
                { label: t("sources.domains"), value: "domains" },
                { label: t("sources.pages"), value: "pages" },
              ]}
              size="toolbar"
              value={group}
            />
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="lg:col-start-3">
              <AiVisibilitySourcesPlan
                canWrite={model.canWrite}
                onRemove={onRemove}
                onUpdate={onUpdatePlan}
                pending={pending}
                plan={sources.plan}
              />
            </div>
            <div className="min-w-0 lg:col-span-2 lg:col-start-1 lg:row-start-1">
              <AiVisibilitySourcesTable
                canWrite={model.canWrite}
                group={group}
                onAdd={(domain, url) => onAdd(domain, group === "pages" ? url : null)}
                onClearType={onClearType}
                onRemove={onRemove}
                onSetType={onSetType}
                pending={pending}
                rows={rows}
                totalAnswers={sources.totalAnswers}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
