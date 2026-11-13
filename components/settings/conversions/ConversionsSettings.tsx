"use client";

import { ConversionComparisonCard } from "@/components/settings/conversions/ConversionComparisonCard";
import { ConversionGoalsCard } from "@/components/settings/conversions/ConversionGoalsCard";
import { ConversionSourcesCard } from "@/components/settings/conversions/ConversionSourcesCard";
import type {
  ConversionActionResult,
  ConversionSource,
  ConversionsSettingsModel,
} from "@/lib/conversions/types";
import { useTranslations } from "next-intl";
import {
  conversionsSettingsBlocks,
  conversionsSettingsLayoutClassName,
} from "./conversions-settings-layout";

type Actions = {
  setPrimary: (input: {
    projectId: string;
    source: ConversionSource;
  }) => Promise<ConversionActionResult>;
  syncSource: (input: {
    projectId: string;
    source: ConversionSource;
  }) => Promise<ConversionActionResult>;
  updateGoal: (input: {
    countsRevenue?: boolean;
    displayName?: string;
    enabled?: boolean;
    goalId: string;
    projectId: string;
  }) => Promise<ConversionActionResult>;
};

export function ConversionsSettings({
  actions,
  canEdit,
  connectHref,
  model,
  projectId,
}: Readonly<{
  actions: Actions;
  canEdit: boolean;
  connectHref: string;
  model: ConversionsSettingsModel;
  projectId: string;
}>) {
  const t = useTranslations("projectSettingsConversions");
  return (
    <div
      className={conversionsSettingsLayoutClassName}
      data-conversions-blocks={conversionsSettingsBlocks.join(" ")}
    >
      <p className="m-0 text-sm text-fg-muted">{t("intro")}</p>
      <ConversionSourcesCard
        canEdit={canEdit}
        connectHref={connectHref}
        projectId={projectId}
        setPrimary={actions.setPrimary}
        sources={model.sources}
        syncSource={actions.syncSource}
      />
      {model.showComparison ? (
        <ConversionComparisonCard rows={model.comparison} sources={model.sources} />
      ) : null}
      <ConversionGoalsCard
        canEdit={canEdit}
        goals={model.goals}
        projectId={projectId}
        updateGoal={actions.updateGoal}
      />
    </div>
  );
}
