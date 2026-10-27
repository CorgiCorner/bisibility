"use client";

import {
  KeywordsScopeControls,
  KeywordsScopeLocationChip,
} from "@/components/keywords/KeywordsScopeControls";
import type { ComponentProps } from "react";
import { FiltersDrawer } from "./KeywordsGridOverlays";
import { pickGridProps } from "./keywords-grid-projection";

const scopeProps = ["lens", "locationOptions", "query"] as const;
type ScopeProps = Pick<Parameters<typeof KeywordsScopeControls>[0], (typeof scopeProps)[number]> & {
  activeViewId: string | null;
  keywordsPath: string;
};

function scopeProjection(props: ScopeProps) {
  return {
    ...pickGridProps(props, scopeProps),
    basePath: props.keywordsPath,
    viewId: props.activeViewId,
  };
}

export function KeywordsGridScopeChip(props: Readonly<ScopeProps>) {
  return props.lens.locationId ? <KeywordsScopeLocationChip {...scopeProjection(props)} /> : null;
}

export function KeywordsGridScopeControl(props: Readonly<ScopeProps>) {
  return <KeywordsScopeControls {...scopeProjection(props)} />;
}

const filterProps = [
  "filters",
  "onChange",
  "onClose",
  "open",
  "rows",
  "facets",
  "onApply",
] as const;
type FilterDrawerProps = ScopeProps &
  Pick<ComponentProps<typeof FiltersDrawer>, (typeof filterProps)[number]>;

export function KeywordsGridFilterDrawer(props: Readonly<FilterDrawerProps>) {
  return <FiltersDrawer {...scopeProjection(props)} {...pickGridProps(props, filterProps)} />;
}
