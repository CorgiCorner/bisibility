import type { ActionResult } from "@/lib/actions/action-result";
import type {
  SetPersonalDefaultInput,
  UserProjectSurfacePreference,
} from "@/lib/project-surface-preferences/model";
import type {
  CanonicalSavedViewResource,
  CreateSavedViewV2Input,
  DeleteSavedViewV2Input,
  UpdateSavedViewV2Input,
} from "@/lib/saved-views/canonical-model";
import type { ProjectViewConfig } from "@/lib/saved-views/config-model";
import type { EffectivePersonalPreference } from "@/lib/saved-views/effective-personal-preference";

export type PersonalViewLabels = {
  cancel: string;
  conflict: string;
  delete: string;
  discard: string;
  failed: string;
  general: string;
  modified: string;
  name: string;
  personal: string;
  privateUnavailable: string;
  privateSharing: string;
  project: string;
  latestRevision: string;
  openLatest: string;
  reloadLatest: string;
  reviewLatest: string;
  saveAs: string;
  saved: string;
  saveChanges: string;
  saving: string;
  setDefault: string;
  unavailableDefault: string;
  unavailableView: string;
  visibility: string;
};

export type PersonalSavedViewsControlProps = {
  activeViewId: string | null;
  canCreateShared: boolean;
  canCreatePrivate?: boolean;
  privateCreationReason?: string;
  config: Extract<ProjectViewConfig, { version: 2 }>;
  createAction: (
    input: CreateSavedViewV2Input,
  ) => Promise<ActionResult<CanonicalSavedViewResource>>;
  deleteAction: (input: DeleteSavedViewV2Input) => Promise<ActionResult<unknown>>;
  labels: PersonalViewLabels;
  modified: boolean;
  onDiscard: () => void;
  onClearDraft?: () => void;
  onRefresh: () => void;
  onSelect: (view: CanonicalSavedViewResource | null) => void;
  preference: EffectivePersonalPreference;
  projectId: string;
  scopeSummary: string;
  /** Opaque session/project/surface identity; changing it discards all client draft state. */
  scopeKey: string;
  setDefaultAction: (
    input: SetPersonalDefaultInput,
  ) => Promise<ActionResult<UserProjectSurfacePreference>>;
  updateAction: (
    input: UpdateSavedViewV2Input,
  ) => Promise<ActionResult<CanonicalSavedViewResource>>;
  views: readonly CanonicalSavedViewResource[];
};

export const personalViewLabelKeys = [
  "cancel",
  "conflict",
  "delete",
  "discard",
  "failed",
  "general",
  "modified",
  "name",
  "personal",
  "privateUnavailable",
  "privateSharing",
  "project",
  "latestRevision",
  "openLatest",
  "reloadLatest",
  "reviewLatest",
  "saveAs",
  "saved",
  "saveChanges",
  "saving",
  "setDefault",
  "unavailableDefault",
  "unavailableView",
  "visibility",
] as const;
