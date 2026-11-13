"use client";

import { previewBrandNames, updateProjectBrandNames } from "@/lib/actions/brand-names";
import {
  addManualCompetitor as addManualCompetitorAction,
  updateCompetitorAliases,
} from "@/lib/actions/competitor-set";
import type { ProjectBrandNamesView } from "@/lib/ai-tracking/brand-name-projection";
import {
  aiVisibilitySourcesInsightHref,
  overviewFilterHref,
} from "@/lib/ai-tracking/overview-href";
import type { AiVisibilityOverviewLoad } from "@/lib/ai-tracking/overview-model";
import { capacityActionClient } from "@/lib/capacity/action";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AiVisibilityOverviewView, type OverviewHrefs } from "./AiVisibilityOverviewView";

const addManualCompetitor = capacityActionClient(addManualCompetitorAction);

export function AiVisibilityOverview({
  brandNames,
  enabledEngines = [],
  hrefs,
  model,
  projectId,
}: Readonly<{
  brandNames: ProjectBrandNamesView;
  enabledEngines?: readonly string[];
  hrefs: OverviewHrefs;
  model: AiVisibilityOverviewLoad;
  projectId: string;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sources =
    hrefs.sources == null
      ? null
      : aiVisibilitySourcesInsightHref(
          pathname,
          new URLSearchParams(searchParams.toString()),
          model.filters,
        );
  return (
    <AiVisibilityOverviewView
      brandNames={brandNames}
      enabledEngines={enabledEngines}
      hrefs={{ ...hrefs, sources }}
      model={model}
      onAddCompetitor={async (domain) => {
        await addManualCompetitor({ aliases: [], domain, projectId: brandNames.projectId });
        router.refresh();
      }}
      onFilter={(filters) => {
        router.push(
          overviewFilterHref(pathname, new URLSearchParams(searchParams.toString()), filters),
        );
      }}
      onPreviewNames={(entity, draft) =>
        previewBrandNames({
          ...draft,
          entityId: entity.entityKind === "competitor" ? entity.entityId : undefined,
          entityKind: entity.entityKind,
          from: model.windowFrom ?? undefined,
          projectId: brandNames.projectId,
        })
      }
      onSaveNames={async (entity, draft) => {
        if (entity.entityKind === "project") {
          await updateProjectBrandNames({ ...draft, projectId: brandNames.projectId });
        } else {
          await updateCompetitorAliases({
            aliases: draft.aliases,
            competitorId: entity.entityId,
            excludedNames: draft.excludedNames,
            projectId: brandNames.projectId,
          });
        }
        router.refresh();
      }}
      onSplitAlias={async (row, alias) => {
        const entity = model.overview.brands.find((item) => item.id === row.entityId);
        if (!entity || entity.kind === "candidate") throw new Error("Missing brand.");
        const aliases = entity.aliases.filter((name) => name !== alias);
        if (row.kind === "project") {
          await updateProjectBrandNames({
            aliases,
            excludedNames: [...entity.excludedNames],
            projectId: brandNames.projectId,
          });
        } else {
          await updateCompetitorAliases({
            aliases,
            competitorId: row.entityId,
            excludedNames: [...entity.excludedNames],
            projectId: brandNames.projectId,
          });
        }
        router.refresh();
      }}
      projectId={projectId}
    />
  );
}
