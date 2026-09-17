import type { DateFormat } from "@/lib/dates/format";
import { resolveSearchBackfillPresentation } from "./control-presentation";
import type {
  SearchBackfillFacts,
  SearchBackfillKind,
  SearchBackfillPresentation,
  SearchSyncActionLabelKey,
  SearchSyncControlAction,
  SearchSyncQueueReason,
  SearchSyncStatusTitle,
  SearchSyncSupportingTextFact,
} from "./control-types";

export {
  resolveSearchBackfillPresentation,
  selectSearchImportCoverage,
} from "./control-presentation";
export type {
  SearchBackfillFacts,
  SearchBackfillKind,
  SearchBackfillPresentation,
  SearchImportCoverage,
  SearchImportQueueFacts,
  SearchImportRuntimeFacts,
  SearchSyncActionLabelKey,
  SearchSyncControlAction,
  SearchSyncQueueReason,
  SearchSyncStatusTitle,
  SearchSyncSupportingTextFact,
} from "./control-types";
export { SEARCH_SYNC_STATUS_VOCABULARY } from "./control-types";

export type SearchSyncSemanticState =
  | "complete"
  | "error"
  | "needs_reauth"
  | "not_connected"
  | "paused_user"
  | "property_required"
  | "quota"
  | "running";
export type SearchSyncControlFacts = SearchBackfillFacts;
export type SearchSyncControlModel = {
  action: SearchSyncControlAction;
  actionLabel: string | null;
  actionLabelKey: SearchSyncActionLabelKey;
  kind: SearchBackfillKind;
  queueReason: SearchSyncQueueReason;
  semanticState: SearchSyncSemanticState;
  status: SearchSyncStatusTitle;
  supportingText: string | null;
  supportingTextFact: SearchSyncSupportingTextFact;
};
function semanticState(facts: SearchSyncControlFacts, model: SearchBackfillPresentation) {
  if (facts.connectionStatus === "not_connected") return "not_connected" as const;
  if (facts.connectionStatus === "connected_no_property") return "property_required" as const;
  if (model.kind === "paused_user") return "paused_user" as const;
  if (model.kind === "paused_provider") return "quota" as const;
  if (model.kind === "needs_reauth") return "needs_reauth" as const;
  if (model.kind === "complete") return "complete" as const;
  return model.kind === "needs_retry" ? "error" : "running";
}

export function resolveSearchSyncControl(
  facts: SearchSyncControlFacts,
  dateFormat: DateFormat = "month_first",
): SearchSyncControlModel {
  const model = resolveSearchBackfillPresentation(facts, dateFormat);
  return {
    action: model.action,
    actionLabel: model.actionLabel,
    actionLabelKey: model.actionLabelKey,
    kind: model.kind,
    queueReason: model.queueReason,
    semanticState: semanticState(facts, model),
    status: model.title,
    supportingText: model.supportingText,
    supportingTextFact: model.supportingTextFact,
  };
}
