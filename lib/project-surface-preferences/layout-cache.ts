import {
  type TablePresentation,
  tablePresentationSchema,
} from "@/lib/saved-views/presentation-model";
import type { PreferenceSurface } from "./model";

export const PERSONAL_LAYOUT_CACHE_PREFIX = "bisibility:personal-layout:v1:";
export function personalLayoutCacheKey(identity: {
  projectId: string;
  surface: PreferenceSurface;
  userId: string;
}) {
  return (
    PERSONAL_LAYOUT_CACHE_PREFIX +
    JSON.stringify([identity.userId, identity.projectId, identity.surface])
  );
}

/** Only layout is cacheable. The caller clears this namespace on logout, before another identity renders. */
export function readPersonalLayoutCache(
  storage: Pick<Storage, "getItem">,
  identity: Parameters<typeof personalLayoutCacheKey>[0],
): TablePresentation | null {
  try {
    const raw = storage.getItem(personalLayoutCacheKey(identity));
    const parsed = tablePresentationSchema.safeParse(raw ? JSON.parse(raw) : null);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearPersonalLayoutCache(storage: Pick<Storage, "key" | "length" | "removeItem">) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys)
    if (key?.startsWith(PERSONAL_LAYOUT_CACHE_PREFIX)) storage.removeItem(key);
}

export function writePersonalLayoutCache(
  storage: Pick<Storage, "setItem">,
  identity: Parameters<typeof personalLayoutCacheKey>[0],
  value: unknown,
) {
  const layout = tablePresentationSchema.safeParse(value);
  if (!layout.success) return false;
  try {
    storage.setItem(personalLayoutCacheKey(identity), JSON.stringify(layout.data));
    return true;
  } catch {
    return false;
  }
}
