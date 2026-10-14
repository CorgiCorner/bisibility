"use client";

import { PersonalSavedViewsControl } from "@/components/saved-views/PersonalSavedViewsControl";
import {
  type PersonalViewLabels,
  personalViewLabelKeys,
} from "@/components/saved-views/personal-control-types";
import { createSavedViewV2, deleteSavedViewV2, updateSavedViewV2 } from "@/lib/actions/saved-views";
import type { CompetitorSavedViewConfig } from "@/lib/competitors/saved-view-model";
import type { CompetitorSavedViewV2Config } from "@/lib/competitors/saved-view-v2-model";
import { setPersonalDefault } from "@/lib/project-surface-preferences/actions";
import type { KeywordPersonalViewContext } from "@/lib/saved-views/keyword-personal-context";
import { canonicalSavedViewHref } from "@/lib/saved-views/navigation";
import { emptyTablePresentation } from "@/lib/saved-views/presentation-model";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function CompetitorPersonalViewControl({
  context,
  config,
  activeViewId,
  projectId,
  canCreateShared,
  modified,
  onDiscard,
  onClearDraft,
}: Readonly<{
  context: KeywordPersonalViewContext;
  config: CompetitorSavedViewConfig;
  activeViewId: string | null;
  projectId: string;
  canCreateShared: boolean;
  modified: boolean;
  onDiscard: () => void;
  onClearDraft?: () => void;
}>) {
  const router = useRouter();
  const t = useTranslations("shared.personalViews");
  const labels = Object.fromEntries(
    personalViewLabelKeys.map((key) => [key, t(key)]),
  ) as PersonalViewLabels;
  const active = context.views.find(
    (view) => view.id === activeViewId && view.surface === "competitors",
  );
  const baseline =
    active?.config.surface === "competitors" && active.config.version === 2
      ? active.config
      : {
          grouped: false,
          pageSize: 100 as const,
          presentation: structuredClone(emptyTablePresentation),
          sort: { direction: "asc" as const, field: "keyword" },
        };
  const definition: CompetitorSavedViewV2Config = { ...baseline, ...config, version: 2 };
  return (
    <PersonalSavedViewsControl
      activeViewId={activeViewId}
      canCreateShared={canCreateShared}
      canCreatePrivate={context.privateCreation?.canCreatePrivate ?? false}
      config={definition}
      createAction={createSavedViewV2}
      deleteAction={deleteSavedViewV2}
      updateAction={updateSavedViewV2}
      setDefaultAction={setPersonalDefault}
      labels={labels}
      modified={modified}
      preference={context.preference}
      projectId={projectId}
      scopeKey={context.scopeKey}
      scopeSummary={`${config.scope.locationId} · ${config.scope.device}`}
      views={context.views}
      onRefresh={() => router.refresh()}
      onClearDraft={onClearDraft}
      onSelect={(view) =>
        router.push(canonicalSavedViewHref(projectId, "competitors", view?.id ?? null))
      }
      onDiscard={() => {
        onDiscard();
        router.push(canonicalSavedViewHref(projectId, "competitors", active?.id ?? activeViewId));
      }}
    />
  );
}
