import { describe, expect, it } from "vitest";
import {
  acceptMeasurementQuote,
  beginMeasurementDraft,
  editMeasurementDraft,
  previewRequest,
  quoteBlock,
  scheduleChanged,
  selectionBlock,
} from "./draft";
import {
  fixtureChoices,
  fixtureNow,
  fixtureProjectId,
  fixtureQuote,
  fixtureSnapshot,
  fixtureSpec,
} from "./test-fixtures";

const requestFor = (draft = beginMeasurementDraft(fixtureSnapshot)) =>
  previewRequest(draft, fixtureProjectId, fixtureSpec);
function quoted() {
  const draft = beginMeasurementDraft(fixtureSnapshot);
  const request = requestFor(draft);
  return acceptMeasurementQuote(draft, request, fixtureQuote(request));
}
describe("measurement presentation draft and fail-closed quote gates", () => {
  it("editing changes only draft and invalidates quote/consent, without modifying baseline", () => {
    const draft = { ...quoted(), acknowledgement: "manual" as const };
    const next = editMeasurementDraft(draft, { selection: { ...draft.selection, depth: 50 } });
    expect(next.quote).toBeNull();
    expect(next.acknowledgement).toBeNull();
    expect(next.baseline.selection.depth).toBe(20);
    expect(scheduleChanged(next)).toBe(true);
  });
  it("minimizes nested intent fields rather than copying extra actor/raw metadata into a request", () => {
    const dirty = {
      ...fixtureSnapshot,
      actorId: "private-actor",
      selection: { ...fixtureSnapshot.selection, raw: "private-raw" },
      schedule: { ...fixtureSnapshot.schedule!, ownerId: "private-owner" },
    };
    const request = requestFor(beginMeasurementDraft(dirty));
    expect(JSON.stringify(request)).not.toContain("private-");
  });
  it.each(["maps", "local_finder"] as const)(
    "does not activate unsupported %s or fall back to organic",
    (surface) => {
      expect(selectionBlock({ ...fixtureSnapshot.selection, surface }, fixtureChoices)).toBe(
        "unsupported_surface",
      );
    },
  );
  it.each([
    { device: "mobile" as const, depth: 300 },
    { geoId: "unsupported-point" },
    { languageCode: "made-up" },
    { capabilityVersion: "unknown-v99" },
  ])("rejects unavailable selection %j without changing it", (change) => {
    const selection = { ...fixtureSnapshot.selection, ...change };
    const original = structuredClone(selection);
    expect(selectionBlock(selection, fixtureChoices)).not.toBeNull();
    expect(selection).toEqual(original);
  });
  it("retains named disabled/reauth failures and rejects ambiguous same-surface manifests", () => {
    for (const connection of ["disabled", "needs_reauth"] as const) {
      const choices = {
        ...fixtureChoices,
        providers: [{ ...fixtureChoices.providers[0], connection }],
      };
      expect(selectionBlock(fixtureSnapshot.selection, choices)).toBe(
        connection === "disabled" ? "provider_disabled" : "needs_reauth",
      );
    }
    expect(
      selectionBlock(fixtureSnapshot.selection, {
        ...fixtureChoices,
        providers: [
          {
            ...fixtureChoices.providers[0],
            capabilities: [
              fixtureChoices.providers[0].capabilities[0],
              fixtureChoices.providers[0].capabilities[0],
            ],
          },
        ],
      }),
    ).toBe("ambiguous_capability");
  });
  it("discards a stale preview response for an edited draft and resets acknowledgement for a fresh quote", () => {
    const draft = beginMeasurementDraft(fixtureSnapshot);
    const request = requestFor(draft);
    const changed = editMeasurementDraft(draft, { selection: { ...draft.selection, depth: 50 } });
    expect(acceptMeasurementQuote(changed, request, fixtureQuote(request))).toBe(changed);
    expect(
      acceptMeasurementQuote(
        { ...draft, acknowledgement: "manual" },
        request,
        fixtureQuote(request),
      ).acknowledgement,
    ).toBeNull();
  });
  it("rejects expiry at the exact boundary, changed settings, rate or capability and unknown rate", () => {
    const draft = quoted();
    const request = requestFor(draft);
    expect(quoteBlock(draft, request, fixtureChoices, 4, new Date("2026-10-12T10:10:00Z"))).toBe(
      "preview_expired",
    );
    expect(quoteBlock(draft, request, fixtureChoices, 5, fixtureNow)).toBe("settings_conflict");
    expect(quoteBlock(draft, request, fixtureChoices, 4, fixtureNow, "manual", "rate-v2")).toBe(
      "rate_changed",
    );
    expect(quoteBlock(draft, request, fixtureChoices, 4, fixtureNow, "manual", null)).toBe(
      "rate_unavailable",
    );
    expect(
      quoteBlock(
        { ...draft, quote: { ...draft.quote!, capabilityVersion: "v2" } },
        request,
        fixtureChoices,
        4,
        fixtureNow,
      ),
    ).toBe("capability_changed");
  });
  it("preserves exact decimal strings and unknown estimates without inventing zero or adding provider units", () => {
    const draft = quoted();
    const quote = {
      ...draft.quote!,
      manualEstimates: [
        {
          providerId: "dataforseo",
          unit: "cents" as const,
          quantity: "0.00000000000000000001",
          certainty: "partial" as const,
          unknownTargets: 3,
        },
        {
          providerId: "serpapi",
          unit: "searches" as const,
          quantity: null,
          certainty: "unknown" as const,
          unknownTargets: 2,
        },
      ],
    };
    expect(
      quoteBlock({ ...draft, quote }, requestFor(draft), fixtureChoices, 4, fixtureNow),
    ).toBeNull();
    expect(quote.manualEstimates[0].quantity).toBe("0.00000000000000000001");
    expect(quote.manualEstimates[1].quantity).toBeNull();
  });
  it.each(["-1", "NaN", "Infinity", "1e-2", "1,000"])(
    "rejects malformed exact amount %s",
    (quantity) => {
      const draft = quoted();
      expect(
        quoteBlock(
          {
            ...draft,
            quote: {
              ...draft.quote!,
              manualEstimates: [{ ...draft.quote!.manualEstimates[0], quantity }],
            },
          },
          requestFor(draft),
          fixtureChoices,
          4,
          fixtureNow,
        ),
      ).toBe("invalid_quote");
    },
  );
  it("keeps missing/unknown budget blockers distinct; a signed explicit pause cannot launch but may stop future work", () => {
    const draft = quoted();
    const pause = editMeasurementDraft(draft, { schedule: { ...draft.schedule!, enabled: false } });
    const request = requestFor(pause);
    const quote = {
      ...fixtureQuote(request),
      run: {
        ...fixtureQuote(request).run,
        budget: {
          ...fixtureQuote(request).run.budget,
          blocked: true,
          reason: "usage_reconciliation_required" as const,
        },
      },
    };
    const reviewed = acceptMeasurementQuote(pause, request, quote);
    expect(quoteBlock(reviewed, request, fixtureChoices, 4, fixtureNow)).toBe(
      "usage_reconciliation_required",
    );
    expect(quoteBlock(reviewed, request, fixtureChoices, 4, fixtureNow, "schedule")).toBeNull();
    expect(
      quoteBlock(
        {
          ...draft,
          quote: {
            ...draft.quote!,
            run: {
              ...draft.quote!.run,
              budget: { ...draft.quote!.run.budget, reason: "budget_missing" },
            },
          },
        },
        requestFor(draft),
        fixtureChoices,
        4,
        fixtureNow,
      ),
    ).toBe("budget_missing");
  });
  it("requires a separately bound schedule preview; a manual token alone never authorizes schedule writes", () => {
    const draft = quoted();
    expect(
      quoteBlock(
        { ...draft, quote: { ...draft.quote!, schedulePreview: null } },
        requestFor(draft),
        fixtureChoices,
        4,
        fixtureNow,
        "schedule",
      ),
    ).toBe("preview_required");
    expect(
      quoteBlock(
        {
          ...draft,
          quote: {
            ...draft.quote!,
            schedulePreview: { token: "schedule-only", expiresAt: "2026-10-12T09:59:00Z" },
          },
        },
        requestFor(draft),
        fixtureChoices,
        4,
        fixtureNow,
        "schedule",
      ),
    ).toBe("preview_expired");
  });
  it("does not compute a fixed monthly multiplier; requires server calendar evidence for enabled schedule save", () => {
    const draft = quoted();
    for (const dueOccurrences of [28, 29, 31]) {
      const quote = { ...draft.quote!, calendar: { ...draft.quote!.calendar!, dueOccurrences } };
      expect(
        quoteBlock(
          { ...draft, quote },
          requestFor(draft),
          fixtureChoices,
          4,
          fixtureNow,
          "schedule",
        ),
      ).toBeNull();
      expect(quote.calendar.dueOccurrences).toBe(dueOccurrences);
    }
    expect(
      quoteBlock(
        { ...draft, quote: { ...draft.quote!, calendar: null } },
        requestFor(draft),
        fixtureChoices,
        4,
        fixtureNow,
        "schedule",
      ),
    ).toBe("invalid_quote");
  });
});
