import { normalizeSavedViewConfig } from "@/lib/keywords/saved-view-model";

function tagKey(label: string) {
  return label.trim().toLocaleLowerCase();
}

/** Count saved keyword views that filter on each tag name. */
export function segmentCountByTag(views: readonly { config: unknown }[]) {
  const counts = new Map<string, number>();
  for (const view of views) {
    const { filters } = normalizeSavedViewConfig(view.config);
    for (const tag of filters.tags) {
      const key = tagKey(tag);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}
