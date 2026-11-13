"use client";

import { AiVisibilityTabs } from "@/components/ai-tracking/AiVisibilityTabs";
import { aiVisibilityBlocks } from "@/components/tracking-loading/ai-visibility-layout";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type {
  BrandNameCount,
  ProjectBrandNamesView,
} from "@/lib/ai-tracking/brand-name-projection";
import type { BrandNameDraft } from "@/lib/ai-tracking/brand-name-schema";
import { overviewEnginesIncludingEnabled } from "@/lib/ai-tracking/overview-engine-rows";
import type {
  AiVisibilityOverviewLoad,
  OverviewFilters,
  OverviewSpellingRow,
} from "@/lib/ai-tracking/overview-model";
import { ChatCircleIcon as ChatCircle } from "@phosphor-icons/react/dist/csr/ChatCircle";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AiVisibilityOverviewBrands } from "./AiVisibilityOverviewBrands";
import { AiVisibilityOverviewEngines } from "./AiVisibilityOverviewEngines";
import { AiVisibilityOverviewFilters } from "./AiVisibilityOverviewFilters";
import { AiVisibilityOverviewInsight } from "./AiVisibilityOverviewInsight";
import { AiVisibilityOverviewSpellings } from "./AiVisibilityOverviewSpellings";
import { AiVisibilityOverviewStats } from "./AiVisibilityOverviewStats";
import { AiVisibilityOverviewTrend } from "./AiVisibilityOverviewTrend";

type NameTarget = { entityId: string; entityKind: "competitor" | "project" };

export type OverviewHrefs = {
  addPrompt: string;
  competitors: string;
  engines: string | null;
  run: string;
  schedules: string;
  sources: string | null;
};

export function AiVisibilityOverviewView({
  brandNames,
  hrefs,
  model,
  onAddCompetitor,
  onFilter,
  onPreviewNames,
  onSaveNames,
  onSplitAlias,
  projectId,
  enabledEngines = [],
}: Readonly<{
  brandNames: ProjectBrandNamesView;
  hrefs: OverviewHrefs;
  model: AiVisibilityOverviewLoad;
  onAddCompetitor: (domain: string) => Promise<void>;
  onFilter: (filters: OverviewFilters) => void;
  onPreviewNames: (entity: NameTarget, draft: BrandNameDraft) => Promise<BrandNameCount>;
  onSaveNames: (entity: NameTarget, draft: BrandNameDraft) => Promise<void>;
  onSplitAlias: (row: OverviewSpellingRow, alias: string) => Promise<void>;
  projectId: string;
  enabledEngines?: readonly string[];
}>) {
  const t = useTranslations("projectAiTracking");
  const { overview } = model;
  const ready = model.hasAnswers && overview.totalAnswers > 0;
  const engineRows = overviewEnginesIncludingEnabled(overview.engines, enabledEngines);
  return (
    <div
      className="flex min-w-0 flex-col gap-5"
      data-visibility-blocks={aiVisibilityBlocks.overview.join(" ")}
      data-visibility-tab="overview"
    >
      <AiVisibilityTabs
        actions={
          <>
            <Button component={Link} href={hrefs.run} size="sm" variant="secondary">
              {t("overview.runNow")}
            </Button>
            <Button component={Link} href={hrefs.addPrompt} size="sm">
              {t("overview.addPrompts")}
            </Button>
          </>
        }
        active="overview"
        projectId={projectId}
      />
      <p className="m-0 text-ui-body text-fg-muted">{t("overview.lead")}</p>
      {model.hasAnswers ? (
        <AiVisibilityOverviewFilters
          engines={model.engines}
          filters={model.filters}
          markets={model.markets}
          onFilter={onFilter}
          topics={model.topics}
        />
      ) : null}
      {model.hasAnswers && overview.truncated ? (
        <p className="m-0 text-ui-caption text-fg-muted">
          {t("overview.truncated", { count: overview.limit })}
        </p>
      ) : null}
      {!model.hasAnswers ? (
        <EmptyState
          action={
            <span className="flex flex-wrap justify-center gap-2">
              <Button component={Link} href={hrefs.addPrompt} size="sm">
                {t("overview.addPrompts")}
              </Button>
              <Button component={Link} href={hrefs.run} size="sm" variant="secondary">
                {t("overview.runNow")}
              </Button>
            </span>
          }
          description={t("overview.emptyDescription")}
          icon={<ChatCircle aria-hidden size={22} weight="regular" />}
          title={t("overview.emptyTitle")}
        />
      ) : null}
      {model.hasAnswers && overview.totalAnswers === 0 ? (
        <p className="m-0 text-ui-body text-fg-muted">{t("overview.filteredEmpty")}</p>
      ) : null}
      {ready ? (
        <>
          <AiVisibilityOverviewStats overview={overview} />
          <AiVisibilityOverviewInsight
            insight={overview.insight}
            projectId={projectId}
            sourcesHref={hrefs.sources}
          />
          <AiVisibilityOverviewBrands
            brandNames={brandNames}
            canAddCompetitor={model.canAddCompetitor}
            competitorsHref={hrefs.competitors}
            onAddCompetitor={onAddCompetitor}
            onPreviewNames={onPreviewNames}
            onSaveNames={onSaveNames}
            overview={overview}
          />
          <AiVisibilityOverviewSpellings onSplitAlias={onSplitAlias} rows={overview.spellings} />
          {engineRows.length > 0 ? (
            <AiVisibilityOverviewEngines manageHref={hrefs.engines} rows={engineRows} />
          ) : null}
          <AiVisibilityOverviewTrend days={overview.days} schedulesHref={hrefs.schedules} />
        </>
      ) : engineRows.length > 0 ? (
        <AiVisibilityOverviewEngines manageHref={hrefs.engines} rows={engineRows} />
      ) : null}
    </div>
  );
}
