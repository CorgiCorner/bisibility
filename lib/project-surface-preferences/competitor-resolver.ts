import type { CompetitorSavedViewConfig } from "@/lib/competitors/saved-view-model";
import { competitorViewLegacyScope } from "@/lib/competitors/saved-view-v2-model";
import { type CompetitorScope, competitorMarketKey } from "@/lib/competitors/scope-model";
import {
  cloneTablePresentation,
  type TablePresentation,
} from "@/lib/saved-views/presentation-model";
import type { ViewSelection } from "./selection-resolver";

export function resolveCompetitorPersonalView(input: {
  availableMarketKeys: ReadonlySet<string>;
  availableTags: ReadonlySet<string>;
  availableSortFields: ReadonlySet<string>;
  explicitFilters?: Partial<CompetitorSavedViewConfig["filters"]>;
  explicitScope?: CompetitorScope | null;
  explicitPresentation?: {
    grouped?: boolean;
    pageSize?: 25 | 50 | 100;
    sort?: { direction: "asc" | "desc"; field: string };
  };
  generalConfig?: CompetitorSavedViewConfig | null;
  personalPresentation?: TablePresentation | null;
  selection: ViewSelection;
}) {
  const saved =
    input.selection.kind === "saved_view" && input.selection.view.config.surface === "competitors"
      ? input.selection.view.config
      : null;
  if (
    input.selection.kind === "unavailable_explicit_view" ||
    (input.selection.kind === "saved_view" && !saved)
  )
    return {
      config: null,
      notice: input.selection.notice,
      presentation: null,
      status: "unavailable_view" as const,
    };
  const base = saved ? competitorViewLegacyScope(saved) : input.generalConfig;
  const scope = input.explicitScope !== undefined ? input.explicitScope : base?.scope;
  if (!scope)
    return {
      config: null,
      notice: input.selection.notice,
      presentation: null,
      status: "no_target" as const,
    };
  const config: CompetitorSavedViewConfig = {
    filters: {
      ...(base?.filters ?? { excludedKeywordIds: [], position: "all", tag: null }),
      ...input.explicitFilters,
    },
    scope: { ...scope },
    surface: "competitors",
    version: 1,
  };
  const viewPresentation = saved?.version === 2 ? saved.presentation : null;
  const presentation =
    input.selection.kind === "saved_view" && input.selection.source === "url"
      ? (viewPresentation ?? input.personalPresentation)
      : (input.personalPresentation ?? viewPresentation);
  const sort = input.explicitPresentation?.sort ?? (saved?.version === 2 ? saved.sort : null);
  const unavailableSort = sort !== null && !input.availableSortFields.has(sort.field);
  return {
    config,
    notice: input.selection.notice,
    presentation: presentation ? cloneTablePresentation(presentation) : null,
    grouped: input.explicitPresentation?.grouped ?? (saved?.version === 2 ? saved.grouped : false),
    pageSize: input.explicitPresentation?.pageSize ?? (saved?.version === 2 ? saved.pageSize : 50),
    sort: sort ? { ...sort } : null,
    status:
      !input.availableMarketKeys.has(competitorMarketKey(scope)) ||
      (config.filters.tag !== null && !input.availableTags.has(config.filters.tag))
        ? ("unavailable_scope" as const)
        : unavailableSort
          ? ("unavailable_sort" as const)
          : ("ready" as const),
  };
}
