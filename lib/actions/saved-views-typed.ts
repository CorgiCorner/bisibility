import type { CreateSavedViewInput, KeywordSavedView } from "@/lib/keywords/saved-view-model";
import type { CreateProjectSavedViewInput, SavedViewResource } from "@/lib/saved-views/model";
import { createSavedView } from "./saved-views";

// Next 16 requires every export of a "use server" module to be an async function, so
// the narrowed signatures cannot live next to the action as overloads. The action
// validates the surface at runtime through createProjectSavedViewSchema; these
// aliases only name the return type each surface actually receives.

export const createKeywordSavedView = createSavedView as (
  input: CreateSavedViewInput,
) => Promise<KeywordSavedView>;

export const createProjectSavedView = createSavedView as (
  input: CreateProjectSavedViewInput,
) => Promise<SavedViewResource>;
