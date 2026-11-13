export type MergeTagRecord = {
  alertTargets: { id: string; ruleId: string }[];
  id: string;
  keywordIds: string[];
  name: string;
  pageIds: string[];
  ruleId: string | null;
};

export type MergeSavedView = {
  config: unknown;
  id: string;
  name: string;
  surface: string;
};

export type TagMergePlan = {
  alertTargetsToDrop: string[];
  alertTargetsToMove: string[];
  counts: {
    alerts: number;
    keywordSegments: number;
    keywords: number;
    pages: number;
    savedViews: number;
  };
  keywordIds: string[];
  moveRule: boolean;
  pageLinksToDrop: string[];
  pageLinksToMove: string[];
  savedViewUpdates: { config: Record<string, unknown>; id: string }[];
};

function tagKey(name: string) {
  return name.trim().toLocaleLowerCase();
}

/** Rewrites one saved-view config, dropping a duplicate when both tags are already selected. */
export function retargetSavedViewConfig(config: unknown, fromName: string, toName: string) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const record = config as { filters?: { tags?: unknown } };
  const tags = record.filters?.tags;
  if (!Array.isArray(tags)) return null;
  const from = tagKey(fromName);
  const seen = new Set<string>();
  const next: string[] = [];
  let changed = false;
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const key = tagKey(tag);
    const replacement = key === from ? toName : tag;
    const replacementKey = tagKey(replacement);
    if (key === from) changed = true;
    if (seen.has(replacementKey)) {
      changed = true;
      continue;
    }
    seen.add(replacementKey);
    next.push(replacement);
  }
  if (!changed) return null;
  return {
    ...record,
    filters: { ...record.filters, tags: next },
  };
}

export function planTagMerge(
  source: MergeTagRecord,
  target: MergeTagRecord,
  views: readonly MergeSavedView[],
): TagMergePlan {
  const targetPages = new Set(target.pageIds);
  const pageLinksToDrop = source.pageIds.filter((pageId) => targetPages.has(pageId));
  const pageLinksToMove = source.pageIds.filter((pageId) => !targetPages.has(pageId));
  const seenRules = new Set(target.alertTargets.map((row) => row.ruleId));
  const alertTargetsToDrop: string[] = [];
  const alertTargetsToMove: string[] = [];
  for (const row of source.alertTargets) {
    if (seenRules.has(row.ruleId)) alertTargetsToDrop.push(row.id);
    else {
      seenRules.add(row.ruleId);
      alertTargetsToMove.push(row.id);
    }
  }
  const savedViewUpdates: TagMergePlan["savedViewUpdates"] = [];
  let keywordSegments = 0;
  let savedViews = 0;
  for (const view of views) {
    const config = retargetSavedViewConfig(view.config, source.name, target.name);
    if (!config) continue;
    savedViewUpdates.push({ config, id: view.id });
    if (view.surface === "keywords") keywordSegments += 1;
    else savedViews += 1;
  }
  return {
    alertTargetsToDrop,
    alertTargetsToMove,
    counts: {
      alerts: source.alertTargets.length,
      keywordSegments,
      keywords: source.keywordIds.length,
      pages: source.pageIds.length,
      savedViews,
    },
    keywordIds: source.keywordIds,
    moveRule: Boolean(source.ruleId) && !target.ruleId,
    pageLinksToDrop,
    pageLinksToMove,
    savedViewUpdates,
  };
}
