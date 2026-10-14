import type { CanonicalSavedViewResource } from "./canonical-model";
import type { EffectivePersonalPreference } from "./effective-personal-preference";
import type { TablePresentation } from "./presentation-model";

/** Session-projected IDs and layout only; no owner IDs, rank evidence or schedules. */
export type KeywordPersonalViewContext = {
  privateCreation?: { canCreatePrivate: boolean; reason: "temporarily_unavailable" | null };
  views: readonly CanonicalSavedViewResource[];
  preference: EffectivePersonalPreference;
  presentation: TablePresentation | null;
  scopeKey: string;
};
