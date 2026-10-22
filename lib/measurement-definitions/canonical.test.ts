import { describe, expect, it } from "vitest";
import {
  currentHeadMatches,
  definitionFingerprint,
  frozenConfiguredScope,
  frozenRequest,
  sameDefinitionBytes,
  targetHeadMatches,
} from "./canonical";
import { definitionHorizonCompatibility } from "./compatibility";
import {
  definitionBindingFixture,
  definitionHeadFixture,
  definitionSourceFixture,
} from "./fixtures";
import { definitionSourceSchema, persistedPolicySchema } from "./schema";

describe("persisted measurement definition proof", () => {
  it("rejects A->B->A even when text and settings return to the original bytes", () => {
    const a = definitionSourceFixture();
    const head = definitionHeadFixture(a);
    const returned = structuredClone(a);
    returned.epochs.keywordTarget = "2";
    expect(currentHeadMatches(head, returned)).toBe(false);
    expect(targetHeadMatches(head, returned)).toBe(false);
    expect(definitionFingerprint(a)).not.toBe(definitionFingerprint(returned));
  });
  it.each([
    "projectTarget",
    "projectPolicy",
    "keywordTarget",
    "keywordPolicy",
    "location",
    "checkSchedule",
  ] as const)("requires persisted %s epoch, not a hash of observations", (epoch) => {
    const source = definitionSourceFixture();
    const changed = structuredClone(source);
    changed.epochs[epoch] = "2";
    expect(currentHeadMatches(definitionHeadFixture(source), changed)).toBe(false);
  });
  it("also detects source bytes changed without an epoch (integrity defense)", () => {
    const source = definitionSourceFixture();
    const changed = structuredClone(source);
    changed.target.device = "mobile";
    expect(currentHeadMatches(definitionHeadFixture(source), changed)).toBe(false);
  });
  it("keeps the current target on a policy-only change, with a new policy boundary", () => {
    const source = definitionSourceFixture();
    const changed = structuredClone(source);
    changed.epochs.projectPolicy = "2";
    changed.policy.defaults!.serpDepth = 20;
    expect(targetHeadMatches(definitionHeadFixture(source), changed)).toBe(true);
    expect(currentHeadMatches(definitionHeadFixture(source), changed)).toBe(false);
  });
  it("allows fetch depth20/100 at the same canonical revision only with both complete-through20 proofs", () => {
    const left = definitionBindingFixture();
    const right = { ...left, request: { ...left.request, depth: 20 as const } };
    expect(
      definitionHorizonCompatibility(left, right, 20, {
        leftCompleteThrough: 20,
        rightCompleteThrough: 20,
      }),
    ).toEqual({ compatible: true, reason: null });
    expect(
      definitionHorizonCompatibility(left, right, 20, {
        leftCompleteThrough: 100,
        rightCompleteThrough: null,
      }).reason,
    ).toBe("unproven_prefix");
    expect(
      definitionHorizonCompatibility(left, { ...right, policyRevision: "changed" }, 20, {
        leftCompleteThrough: 20,
        rightCompleteThrough: 20,
      }).reason,
    ).toBe("definition_boundary");
  });
  it("captures assigned schedule null-depth inheritance, without silently using legacy keyword schedule", () => {
    const source = definitionSourceFixture();
    source.policy.keywordSchedule = {
      id: "legacy",
      frequency: "daily",
      cronExpression: null,
      timezone: "UTC",
      jitterMinutes: 1,
      serpDepth: 10,
    };
    source.policy.checkSchedule = {
      id: "current",
      publicId: "sch_current",
      projectId: source.projectId,
      frequency: "weekly",
      cronExpression: null,
      timezone: "UTC",
      jitterMinutes: 1,
      serpDepth: null,
      enabled: true,
      archivedAt: null,
      providerPolicy: null,
      timeOfDay: null,
      isDefault: false,
    };
    expect(frozenRequest(source, "synthetic").depth).toBe(100);
    expect(frozenRequest(source, "synthetic", 20).depth).toBe(20);
  });
  it("rejects unsafe numeric epochs, extra secret fields and cross-project schedules", () => {
    const source = definitionSourceFixture();
    expect(
      definitionSourceSchema.safeParse({
        ...source,
        epochs: { ...source.epochs, keywordTarget: 9007199254740992 },
      }).success,
    ).toBe(false);
    expect(
      persistedPolicySchema.safeParse({ ...source.policy.config, credential: "must-not-retain" })
        .success,
    ).toBe(false);
    const schedule = {
      id: "foreign",
      publicId: "sch_foreign",
      projectId: "other",
      frequency: "manual",
      cronExpression: null,
      timezone: "UTC",
      jitterMinutes: 0,
      serpDepth: 20,
      enabled: true,
      archivedAt: null,
      providerPolicy: null,
      timeOfDay: null,
      isDefault: false,
    };
    expect(
      definitionSourceSchema.safeParse({
        ...source,
        policy: { ...source.policy, checkSchedule: schedule },
      }).success,
    ).toBe(false);
  });
  it("freezes the actual transport scope, distinct from display labels", () => {
    const source = definitionSourceFixture();
    source.target.location.displayName = "UI label";
    source.target.location.languageCode = "UI language";
    expect(frozenConfiguredScope(source.target)).toEqual({
      location: "Synthetic",
      language: "en",
      device: "desktop",
    });
  });
  it("freezes adapter-specific stop target semantics", () => {
    const source = definitionSourceFixture();
    source.policy.config!.adapters[0].nativeFindTargetsIn = "with_subdomains_on_match";
    expect(frozenRequest(source, "synthetic").findTargetsIn).toBe("with_subdomains");
    source.policy.defaults!.serpStopOnMatch = false;
    expect(frozenRequest(source, "synthetic").findTargetsIn).toBeNull();
    source.policy.config!.adapters[0].nativeFindTargetsIn = "none";
    source.policy.defaults!.serpStopOnMatch = true;
    expect(frozenRequest(source, "synthetic").findTargetsIn).toBeNull();
  });
  it.each(["project", "override", "schedule"] as const)(
    "freezes Top20 without early stopping from %s depth",
    (origin) => {
      const source = definitionSourceFixture();
      source.policy.config!.adapters[0].nativeFindTargetsIn = "with_subdomains_on_match";
      if (origin === "project") source.policy.defaults!.serpDepth = 20;
      if (origin === "schedule")
        source.policy.keywordSchedule = {
          id: "schedule",
          frequency: "daily",
          cronExpression: null,
          timezone: "UTC",
          jitterMinutes: 0,
          serpDepth: 20,
        };
      const request = frozenRequest(source, "synthetic", origin === "override" ? 20 : undefined);
      expect(request).toMatchObject({ depth: 20, stopOnMatch: false, findTargetsIn: null });
      expect(source.policy.defaults!.serpStopOnMatch).toBe(true);
    },
  );
  it.each([10, 50, 100] as const)("retains configured early stopping at Top%i", (depth) => {
    const source = definitionSourceFixture();
    expect(frozenRequest(source, "synthetic", depth).stopOnMatch).toBe(true);
    source.policy.defaults!.serpStopOnMatch = false;
    expect(frozenRequest(source, "synthetic", depth).stopOnMatch).toBe(false);
  });
  it("rejects a retired generated workspace host using the actual tracked-domain authority", () => {
    const source = definitionSourceFixture();
    source.target.domain = "workspace-aabbccdd.bisibility.cloud";
    expect(() => frozenRequest(source, "synthetic")).toThrow(
      "Current measurement definition is unavailable.",
    );
  });
  it("requires captured planner identity and treats its change as a policy boundary", () => {
    const source = definitionSourceFixture();
    source.epochs.checkSchedule = "0";
    source.policy.checkSchedule = {
      id: "assigned",
      publicId: "sch_first",
      projectId: source.projectId,
      frequency: "weekly",
      cronExpression: null,
      timezone: "UTC",
      jitterMinutes: 0,
      serpDepth: 20,
      enabled: true,
      archivedAt: null,
      providerPolicy: null,
      timeOfDay: null,
      isDefault: false,
    };
    const head = definitionHeadFixture(source);
    const changed = structuredClone(source);
    changed.policy.checkSchedule!.publicId = "sch_second";
    changed.epochs.checkSchedule = "1";
    expect(currentHeadMatches(head, changed)).toBe(false);
    const missing = { ...source.policy.checkSchedule, publicId: undefined };
    expect(
      definitionSourceSchema.safeParse({
        ...source,
        policy: { ...source.policy, checkSchedule: missing },
      }).success,
    ).toBe(false);
  });
  it("retains timestamps in byte comparisons", () => {
    expect(sameDefinitionBytes(new Date(0), new Date(1))).toBe(false);
  });
});
