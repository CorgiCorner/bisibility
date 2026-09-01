import { propertyDisplayName } from "@/lib/search-insights/queries/context-model";
import {
  resolveSearchBackfillPresentation,
  type SearchBackfillFacts,
} from "@/lib/search-insights/sync/control-model";
import type { ProviderConsumerStatus } from "./types";

type SearchModuleInput = SearchBackfillFacts & {
  property: string | null;
};

function consumerState(
  kind: ReturnType<typeof resolveSearchBackfillPresentation>["kind"],
  input: SearchModuleInput,
): ProviderConsumerStatus["state"] {
  if (kind === "complete") return "kept_current";
  if (kind === "needs_reauth") return "needs_reauth";
  if (kind === "needs_retry") return "sync_failed";
  if (kind === "paused_user") return "paused_by_user";
  return kind === "running" && input.observability?.readyThrough.d7.current
    ? "first_view_ready"
    : "backfill_running";
}

export function searchModuleConsumerStatus(input: SearchModuleInput): ProviderConsumerStatus {
  if (input.connectionStatus === "connected" && !input.state) {
    return {
      ...(input.property ? { detail: propertyDisplayName(input.property) } : {}),
      state: "not_configured",
      summary: "Not configured",
    };
  }
  const presentation = resolveSearchBackfillPresentation(input);
  return {
    ...(input.property ? { detail: propertyDisplayName(input.property) } : {}),
    state: consumerState(presentation.kind, input),
    summary: [
      presentation.title,
      input.observability ? presentation.description : null,
      presentation.supportingText,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" · "),
  };
}
