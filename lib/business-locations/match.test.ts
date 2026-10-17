import { describe, expect, it } from "vitest";
import { matchBusinessCollection } from "./match";
import { subjectMatchResults } from "./subject";
import {
  cidA,
  cidB,
  identifier,
  item,
  observationRunId,
  projectId,
  revision,
} from "./test-fixtures";

const evaluate = (items = [item()], targets = [revision()]) =>
  matchBusinessCollection({ projectId, observationRunId, items, targets });
describe("recorded collection branch matcher", () => {
  it("keeps same-domain branches separate and prefers an exact slot3 over earlier weak slot1", () => {
    const a = revision(),
      b = revision("entity_b", cidB);
    const rows = evaluate([item("weak", 1, null), item("b", 2, cidB), item("a", 3, cidA)], [a, b]);
    const selected = subjectMatchResults(rows, {
      projectId,
      entityId: a.entityId,
      identityRevisionId: a.id,
    });
    expect(selected.confirmed.map((match) => match.originalOrdinals.slot)).toEqual([3]);
    expect(selected.candidates.map((match) => match.originalOrdinals.slot)).toEqual([1]);
    expect(selected.rejected[0].itemId).toBe("b");
    expect(
      subjectMatchResults(rows, { projectId, entityId: b.entityId, identityRevisionId: b.id })
        .confirmed[0].itemId,
    ).toBe("b");
    expect(selected.confirmed[0].originalOrdinals).toEqual({
      page: 2,
      block: 4,
      slot: 3,
      absolute: 17,
    });
  });
  it("matches the archive A/B fixture at A slot3 and B slot1 without domain collapse", () => {
    const a = revision(),
      b = revision("entity_b", cidB);
    const matches = evaluate([item("b", 1, cidB), item("a", 3, cidA)], [a, b]);
    expect(
      subjectMatchResults(matches, { projectId, entityId: a.entityId, identityRevisionId: a.id })
        .confirmed[0].originalOrdinals.slot,
    ).toBe(3);
    expect(
      subjectMatchResults(matches, { projectId, entityId: b.entityId, identityRevisionId: b.id })
        .confirmed[0].originalOrdinals.slot,
    ).toBe(1);
  });
  it("rejects foreign CID even when name/domain match", () => {
    expect(evaluate([item("foreign", 1, cidB)])[0]).toMatchObject({
      status: "rejected",
      reason: "stable_identifier_conflict",
      organicEligible: false,
    });
  });
  it("never rescues a conflicting Place ID with an equal CID", () => {
    const original = revision();
    const target = {
      ...original,
      snapshot: {
        ...original.snapshot,
        identifiers: [identifier("cid", cidA), identifier("place_id", "Place_A")],
      },
    };
    const observed = item();
    expect(
      evaluate(
        [
          {
            ...observed,
            identifiers: [
              ...observed.identifiers,
              {
                namespace: "google_business",
                engine: "google",
                type: "place_id",
                value: "Place_B",
              },
            ],
          },
        ],
        [target],
      )[0],
    ).toMatchObject({ status: "rejected", reason: "stable_identifier_conflict" });
  });
  it("marks IDs naming two known branches as contradictory rather than confirming either", () => {
    const a = {
      ...revision(),
      snapshot: { ...revision().snapshot, identifiers: [identifier("cid", cidA)] },
    };
    const b = {
      ...revision("entity_b", cidB),
      snapshot: {
        ...revision("entity_b", cidB).snapshot,
        identifiers: [identifier("place_id", "Place_B")],
      },
    };
    const observed = item();
    const results = evaluate(
      [
        {
          ...observed,
          identifiers: [
            ...observed.identifiers,
            { namespace: "google_business", engine: "google", type: "place_id", value: "Place_B" },
          ],
        },
      ],
      [a, b],
    );
    expect(
      results.every(
        (match) => match.status === "unresolved" && match.reason === "contradictory_identifiers",
      ),
    ).toBe(true);
  });
  it("keeps a known exact other branch out of weak candidates for an unverified branch", () => {
    const unverified = { ...revision(), snapshot: { ...revision().snapshot, identifiers: [] } };
    expect(evaluate([item("b", 1, cidB)], [unverified, revision("entity_b", cidB)])[0].status).toBe(
      "rejected",
    );
  });
  it("only creates candidates from a shared domain/name without stable evidence", () => {
    expect(evaluate([item("weak", 1, null)])[0]).toMatchObject({
      status: "candidate",
      matchedBy: "name_and_domain",
      organicEligible: false,
    });
  });
  it("does not compare unrelated namespaces or infer CID/Place aliases", () => {
    const observed = item();
    expect(
      evaluate([
        { ...observed, identifiers: [{ ...observed.identifiers[0], namespace: "other" }] },
      ])[0].status,
    ).toBe("candidate");
    expect(
      evaluate([
        {
          ...observed,
          identifiers: [
            { namespace: "google_business", engine: "google", type: "place_id", value: cidA },
          ],
        },
      ])[0].status,
    ).toBe("candidate");
  });
  it("leaves repeated exact items and duplicate registry IDs unresolved", () => {
    expect(
      evaluate([item("first", 1), item("second", 3)]).every(
        (match) => match.reason === "ambiguous_exact_items" && !match.organicEligible,
      ),
    ).toBe(true);
    expect(
      evaluate([item()], [revision(), revision("entity_b", cidA)]).every(
        (match) => match.reason === "ambiguous_registry_identity",
      ),
    ).toBe(true);
  });
  it.each([Number(cidA), NaN, Infinity])(
    "retains unsafe numeric evidence as unknown even beside a valid exact ID: %s",
    (unsafe) => {
      const target = {
        ...revision(),
        snapshot: { ...revision().snapshot, identifiers: [identifier("place_id", "Place_A")] },
      };
      const observed = {
        ...item("unsafe", 1, unsafe),
        identifiers: [
          { namespace: "google_business", engine: "google", type: "cid" as const, value: unsafe },
          {
            namespace: "google_business",
            engine: "google",
            type: "place_id" as const,
            value: "Place_A",
          },
        ],
      };
      expect(evaluate([observed], [target])[0]).toMatchObject({
        status: "unresolved",
        reason: "unsafe_numeric_identifier",
      });
    },
  );
  it.each(["promoted", "unknown"] as const)(
    "does not classify %s exact matches as organic eligible",
    (promotion) => {
      expect(evaluate([{ ...item(), promotion }])[0]).toMatchObject({
        status: "confirmed",
        organicEligible: false,
        promotion,
      });
    },
  );
  it("a proven promoted Finder appearance cannot invalidate the organic identity match", () => {
    const promotion = "promoted" as const;
    const listing = (id: string, group: number, value: "organic" | "promoted" | "unknown") => ({
      ...item(id, group),
      surface: "local_finder" as const,
      resultKind: "listing" as const,
      promotion: value,
      originalOrdinals: {
        page: null,
        block: null,
        slot: null,
        absolute: group,
        group,
        scale: "finder_group" as const,
      },
    });
    const matches = evaluate([listing("ad", 1, promotion), listing("organic", 2, "organic")]);
    expect(matches[1]).toMatchObject({ status: "confirmed", organicEligible: true });
    expect(matches[0].organicEligible).toBe(false);
    expect(
      evaluate([listing("a", 1, "organic"), listing("b", 2, "organic")]).every(
        (row) => row.reason === "ambiguous_exact_items" && !row.organicEligible,
      ),
    ).toBe(true);
  });
  it("preserves source ordinals and excludes nonlocal or positionless identity confirmations", () => {
    expect(evaluate([{ ...item(), resultKind: "organic_result" }])[0].organicEligible).toBe(false);
    expect(
      evaluate([
        { ...item(), originalOrdinals: { page: null, block: null, slot: null, absolute: null } },
      ])[0].organicEligible,
    ).toBe(false);
    expect(
      evaluate([{ ...item(), originalOrdinals: { ...item().originalOrdinals, slot: -1 } }])[0]
        .reason,
    ).toBe("invalid_ordinals");
  });
  it("keeps repeated item/source-slot identities explicit without deduplication or renumbering", () => {
    const result = evaluate([item("one", 3), item("two", 3)]);
    expect(
      result.every(
        (match) =>
          match.reason === "duplicate_observation_identity" && match.originalOrdinals.slot === 3,
      ),
    ).toBe(true);
    expect(
      evaluate([item("one", 1), item("one", 3)]).every(
        (match) => match.reason === "duplicate_observation_identity",
      ),
    ).toBe(true);
  });
  it("does not treat different result kinds as a duplicate source slot", () => {
    const local = item("local", 3),
      organic = { ...item("organic", 3, null), resultKind: "organic_result" as const };
    const matches = evaluate([local, organic]);
    expect(matches[0]).toMatchObject({ status: "confirmed", organicEligible: true });
    expect(matches[1].reason).not.toBe("duplicate_observation_identity");
  });
  it("refuses cross-project/run collections and leaves empty collections empty", () => {
    expect(() => evaluate([{ ...item(), projectId: "foreign_project" }])).toThrow(
      "another project",
    );
    expect(() => evaluate([{ ...item(), observationRunId: "foreign_run" }])).toThrow(
      "another project",
    );
    expect(evaluate([])).toEqual([]);
  });
});
