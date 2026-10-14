"use client";

import { PersonalSavedViewsControl } from "@/components/saved-views/PersonalSavedViewsControl";
import {
  type PersonalViewLabels,
  personalViewLabelKeys,
} from "@/components/saved-views/personal-control-types";
import { createSavedViewV2, deleteSavedViewV2, updateSavedViewV2 } from "@/lib/actions/saved-views";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { rankTrackerScope } from "@/lib/keywords/rank-tracker-report-scope";
import { keywordSavedViewConfigV2 } from "@/lib/keywords/saved-view-v2-model";
import { keywordViewModified } from "@/lib/keywords/view-modified-state";
import { setPersonalDefault } from "@/lib/project-surface-preferences/actions";
import type { KeywordPersonalViewContext } from "@/lib/saved-views/keyword-personal-context";
import { canonicalSavedViewHref } from "@/lib/saved-views/navigation";
import type { TablePresentation } from "@/lib/saved-views/presentation-model";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function KeywordPersonalViewControl({
  context,
  presentation,
  query,
  projectId,
  canCreateShared,
  scopeSummary,
  onDiscardLayout,
  layoutModified = false,
}: Readonly<{
  context: KeywordPersonalViewContext;
  presentation: TablePresentation;
  query: RankTrackerQueryState;
  projectId: string;
  canCreateShared: boolean;
  scopeSummary: string;
  onDiscardLayout: () => void;
  layoutModified?: boolean;
}>) {
  const router = useRouter();
  const t = useTranslations("shared.personalViews");
  const labels = Object.fromEntries(
    personalViewLabelKeys.map((key) => [key, t(key)]),
  ) as PersonalViewLabels;
  const config = keywordSavedViewConfigV2({
    reportScope: rankTrackerScope(query),
    filters: query.filters,
    grouped: query.grouped,
    lens: query.lens,
    pageSize: query.pageSize,
    presentation,
    search: query.search,
    sort: query.sort,
  });
  const active = context.views.find(
    (view) => view.id === query.savedViewId && view.config.surface === "keywords",
  );
  const modified = keywordViewModified(
    config,
    active?.config.surface === "keywords" ? active.config : null,
    layoutModified,
  );
  return (
    <PersonalSavedViewsControl
      activeViewId={query.savedViewId}
      canCreateShared={canCreateShared}
      canCreatePrivate={context.privateCreation?.canCreatePrivate ?? false}
      privateCreationReason={
        context.privateCreation?.reason ? labels.privateUnavailable : undefined
      }
      config={config}
      createAction={createSavedViewV2}
      updateAction={updateSavedViewV2}
      deleteAction={deleteSavedViewV2}
      labels={labels}
      modified={modified}
      preference={context.preference}
      projectId={projectId}
      scopeKey={context.scopeKey}
      scopeSummary={scopeSummary}
      views={context.views}
      setDefaultAction={setPersonalDefault}
      onRefresh={() => router.refresh()}
      onClearDraft={onDiscardLayout}
      onSelect={(view) =>
        router.push(canonicalSavedViewHref(projectId, "keywords", view?.id ?? null))
      }
      onDiscard={() => {
        onDiscardLayout();
        router.push(canonicalSavedViewHref(projectId, "keywords", active?.id ?? null));
      }}
    />
  );
}
