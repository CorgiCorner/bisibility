"use client";

import { KeywordsScopeControls } from "@/components/keywords/KeywordsScopeControls";
import type { ReactNode } from "react";
import { pickGridProps } from "./keywords-grid-projection";
import type { KeywordsGridProps } from "./keywords-grid-types";
import { SavedViewsControl } from "./SavedViewsControl";

const savedViewProps = [
  "activeFiltersSummary",
  "activeViewId",
  "config",
  "createSavedViewAction",
  "deletableSavedViewIds",
  "deleteSavedViewAction",
  "projectId",
  "savedViews",
] as const;
const scopeProps = ["lens", "locationOptions", "onQueryNavigation", "query"] as const;
type Props = Pick<Parameters<typeof SavedViewsControl>[0], (typeof savedViewProps)[number]> &
  Pick<Parameters<typeof KeywordsScopeControls>[0], (typeof scopeProps)[number]> & {
    createSavedViewAction: KeywordsGridProps["createSavedViewAction"];
    deleteSavedViewAction: KeywordsGridProps["deleteSavedViewAction"];
    keywordsPath: string;
  };

export function KeywordsGridScopeView(props: Readonly<Props>): {
  control: ReactNode;
  savedView: ReactNode;
} {
  return {
    control: (
      <KeywordsScopeControls
        {...pickGridProps(props, scopeProps)}
        basePath={props.keywordsPath}
        viewId={props.activeViewId}
      />
    ),
    savedView: <SavedViewsControl {...pickGridProps(props, savedViewProps)} />,
  };
}
