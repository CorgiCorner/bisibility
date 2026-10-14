import { describe, expect, it } from "vitest";
import { historyPages, normalizedItem, pagedHistory, snapshot } from "./history.test-fixture";
import {
  appendHistoryPage,
  sameHistorySelection,
  validHistoryPages,
  validHistorySnapshot,
} from "./history-page-state";

describe("recorded history frozen page contract", () => {
  it("keeps attempts on recorded time without hiding unknown observation times", () => {
    const pages = historyPages();
    pages.attempts.records = pages.attempts.records.map((record) => ({
      ...record,
      observedAt: null,
      status: "failed",
    }));
    expect(validHistoryPages(pages)).toBe(true);
    expect(
      validHistoryPages({
        ...pages,
        attempts: { ...pages.attempts, window: { ...pages.attempts.window, basis: "observed_at" } },
      }),
    ).toBe(false);
  });

  it("loads all320 retained observations and logical attempts across pages", () => {
    const { first, rest } = pagedHistory();
    const observations = appendHistoryPage(
      first.observations,
      rest.observations,
      "observations-next",
    );
    const attempts = appendHistoryPage(first.attempts, rest.attempts, "attempts-next");
    expect(observations?.records).toHaveLength(320);
    expect(attempts?.records).toHaveLength(320);
    expect(observations?.totalCount).toBe(320);
    expect(observations?.nextCursor).toBeNull();
  });

  it.each(["sourceDigest", "asOf", "projectId", "definitionVersion"] as const)(
    "refuses changed $0 rather than mixing snapshots",
    (field) => {
      const { first, rest } = pagedHistory();
      expect(
        appendHistoryPage(
          first.observations,
          { ...rest.observations, [field]: "changed" },
          "observations-next",
        ),
      ).toBeNull();
    },
  );

  it("refuses duplicate rows, repeated cursors and falsely terminal partial pages", () => {
    const { first, rest } = pagedHistory();
    expect(
      appendHistoryPage(first.observations, first.observations, "observations-next"),
    ).toBeNull();
    expect(
      appendHistoryPage(
        first.observations,
        { ...rest.observations, nextCursor: "observations-next" },
        "observations-next",
      ),
    ).toBeNull();
    expect(
      appendHistoryPage(
        first.observations,
        { ...rest.observations, records: [] },
        "observations-next",
      ),
    ).toBeNull();
  });

  it("refuses mismatched stream windows and a row outside the authorized window", () => {
    const pages = historyPages();
    expect(
      validHistoryPages({
        ...pages,
        attempts: {
          ...pages.attempts,
          window: { ...pages.attempts.window, to: "2026-06-01T00:00:00.000Z" },
        },
      }),
    ).toBe(false);
    const record = pages.observations.records[0];
    if (!record) throw new Error("Fixture requires an observation");
    expect(
      validHistoryPages({
        ...pages,
        observations: {
          ...pages.observations,
          records: [{ ...record, observedAt: "2027-01-01T00:00:00.000Z" }],
        },
      }),
    ).toBe(false);
  });

  it("keeps normalized rank after raw expiration, but refuses a foreign check snapshot", () => {
    const page = historyPages().observations;
    const record = page.records[0];
    if (!record) throw new Error("Fixture requires an observation");
    expect(validHistorySnapshot(page, record.id, snapshot(record))).toBe(true);
    expect(
      validHistorySnapshot(page, record.id, { ...snapshot(record), projectId: "prj_foreign" }),
    ).toBe(false);
    expect(
      validHistorySnapshot(page, record.id, {
        ...snapshot(record),
        observation: { ...record, id: "chk_foreign" },
      }),
    ).toBe(false);
  });

  it("requires feature presence from same-check items and ownership from retained identity proof", () => {
    const page = historyPages().observations;
    const record = page.records[0];
    if (!record) throw new Error("Fixture requires an observation");
    const item = normalizedItem(record);
    const value = {
      ...snapshot(record, [item]),
      featureFacts: [
        {
          checkId: record.id,
          feature: "organic",
          presence: "present" as const,
          sourceItemIds: [item.id],
          ownership: "own" as const,
          identityRevision: "identity-v1",
        },
      ],
    };
    expect(validHistorySnapshot(page, record.id, value)).toBe(true);
    expect(
      validHistorySnapshot(page, record.id, {
        ...value,
        items: [{ ...item, checkId: "chk_other" }],
      }),
    ).toBe(false);
    expect(
      validHistorySnapshot(page, record.id, {
        ...value,
        items: [{ ...item, recordedAt: "2027-01-01T00:00:00.000Z" }],
      }),
    ).toBe(false);
    expect(
      validHistorySnapshot(page, record.id, {
        ...value,
        featureFacts: value.featureFacts.map((fact) => ({ ...fact, identityRevision: null })),
      }),
    ).toBe(false);
    expect(
      validHistorySnapshot(page, record.id, {
        ...value,
        featureFacts: value.featureFacts.map((fact) => ({ ...fact, feature: "local_pack" })),
      }),
    ).toBe(false);
  });

  it("does not widen project or target selection when starting a new window snapshot", () => {
    const page = historyPages().observations;
    expect(sameHistorySelection(page, { ...page, asOf: "2026-12-31T13:00:00.000Z" })).toBe(true);
    expect(sameHistorySelection(page, { ...page, projectId: "prj_foreign" })).toBe(false);
    expect(
      sameHistorySelection(page, {
        ...page,
        summary: { ...page.summary, selectionDigest: "wider-scope" },
      }),
    ).toBe(false);
  });
});
