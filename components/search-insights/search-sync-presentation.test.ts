import type { SearchBackfillPresentation } from "@/lib/search-insights/sync/control-model";
import projectSearchInsightsMessages from "@/messages/core/en/project-search-insights.json";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { presentSearchSync } from "./search-sync-presentation";

type PresentationInput = Pick<
  SearchBackfillPresentation,
  "action" | "actionLabelKey" | "kind" | "supportingTextFact"
>;

describe("presentSearchSync", () => {
  it("localizes structured operation detail without changing stored facts", () => {
    const messages = structuredClone(projectSearchInsightsMessages);
    messages.projectSearchInsights.copy.syncActionPause = "Wstrzymaj";
    messages.projectSearchInsights.copy.syncDurationMinutes = "{count, number} minuty";
    messages.projectSearchInsights.copy.syncStatusImporting = "Importowanie";
    messages.projectSearchInsights.copy.syncSupportingNextRequest =
      "Nastepne zadanie za {duration}.";
    const t = createTranslator({
      locale: "pl",
      messages,
      namespace: "projectSearchInsights.copy",
    });
    const model = {
      action: "pause",
      actionLabelKey: "pause",
      kind: "running",
      supportingTextFact: { kind: "next_request", milliseconds: 10 * 60_000 },
    } as const satisfies PresentationInput;

    expect(presentSearchSync(model, t, () => null)).toEqual({
      action: "pause",
      actionLabel: "Wstrzymaj",
      status: "Importowanie",
      supportingText: "Nastepne zadanie za 10 minuty.",
    });
  });

  it("formats a paused calendar day at the client presentation boundary", () => {
    const messages = structuredClone(projectSearchInsightsMessages);
    messages.projectSearchInsights.copy.syncStatusPaused = "Wstrzymano";
    messages.projectSearchInsights.copy.syncSupportingPausedUser = "Wstrzymano {date}.";
    const t = createTranslator({
      locale: "pl",
      messages,
      namespace: "projectSearchInsights.copy",
    });
    const model = {
      action: "resume",
      actionLabelKey: "resume",
      kind: "paused_user",
      supportingTextFact: { kind: "paused_user", pausedAt: "2026-08-16T12:00:00.000Z" },
    } as const satisfies PresentationInput;

    expect(presentSearchSync(model, t, () => "16 sie 2026")).toMatchObject({
      status: "Wstrzymano",
      supportingText: "Wstrzymano 16 sie 2026.",
    });
  });
});
