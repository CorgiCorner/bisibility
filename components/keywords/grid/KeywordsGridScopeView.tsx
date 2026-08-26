"use client";

import { KeywordsScopeControls } from "@/components/keywords/KeywordsScopeControls";
import type { ActiveLens, LensLocationOption } from "@/lib/keywords/lens-model";
import type { ReactNode } from "react";
import type { KeywordsGridProps } from "./keywords-grid-types";
import { SavedViewsControl } from "./SavedViewsControl";

type Props = {
  activeFiltersSummary: string;
  activeViewId: string | null;
  config: Parameters<typeof SavedViewsControl>[0]["config"];
  createSavedViewAction: KeywordsGridProps["createSavedViewAction"];
  deletableSavedViewIds: KeywordsGridProps["deletableSavedViewIds"];
  deleteSavedViewAction: KeywordsGridProps["deleteSavedViewAction"];
  keywordsPath: string;
  lens: ActiveLens;
  locationOptions: LensLocationOption[];
  projectId: string;
  onQueryNavigation?: () => void;
  query?: KeywordsGridProps["query"];
  savedViews: NonNullable<KeywordsGridProps["savedViews"]>;
};

export function KeywordsGridScopeView({
  activeFiltersSummary,
  activeViewId,
  config,
  createSavedViewAction,
  deletableSavedViewIds,
  deleteSavedViewAction,
  keywordsPath,
  lens,
  locationOptions,
  projectId,
  onQueryNavigation,
  query,
  savedViews,
}: Readonly<Props>): { control: ReactNode; savedView: ReactNode } {
  return {
    control: (
      <KeywordsScopeControls
        basePath={keywordsPath}
        lens={lens}
        locationOptions={locationOptions}
        onQueryNavigation={onQueryNavigation}
        viewId={activeViewId}
        query={query}
      />
    ),
    savedView: (
      <SavedViewsControl
        activeFiltersSummary={activeFiltersSummary}
        activeViewId={activeViewId}
        config={config}
        createSavedViewAction={createSavedViewAction}
        deletableSavedViewIds={deletableSavedViewIds}
        deleteSavedViewAction={deleteSavedViewAction}
        projectId={projectId}
        savedViews={savedViews}
      />
    ),
  };
}
