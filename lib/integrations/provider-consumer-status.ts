import { propertyDisplayName } from "@/lib/search-insights/queries/context-model";
import type { ProviderConsumerStatus, ProviderStatusKind } from "./types";

type SearchModuleInput = {
  accountStatus: ProviderStatusKind;
  completedDays: number;
  daysTotal: number;
  firstViewReady: boolean;
  importState: string | null;
  pausedReason: string | null;
  plannedRetentionMonths: number | null;
  property: string | null;
};

export function searchModuleConsumerStatus(input: SearchModuleInput): ProviderConsumerStatus {
  if (!input.property) return { state: "not_configured", summary: "Not configured" };
  const detail = propertyDisplayName(input.property);
  if (input.accountStatus === "needs_reauth") {
    return { detail, state: "needs_reauth", summary: "Needs reconnect" };
  }
  if (!input.importState) return { detail, state: "not_configured", summary: "Not configured" };
  if (input.pausedReason === "user") {
    return { detail, state: "paused_by_user", summary: "Paused by you" };
  }
  if (input.importState === "completed") {
    const months = input.plannedRetentionMonths ?? 16;
    return { detail, state: "kept_current", summary: `${months} months imported · kept current` };
  }
  if (input.firstViewReady) {
    return {
      detail,
      state: "first_view_ready",
      summary: "First 28-day view ready · full history still importing",
    };
  }
  if (input.importState === "running" || input.importState === "queued") {
    return {
      detail,
      state: "backfill_running",
      summary: `Backfill running · ${input.completedDays} of ~${input.daysTotal} days`,
    };
  }
  return { detail, state: "not_configured", summary: "Not configured" };
}
