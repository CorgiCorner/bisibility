import { frozenConfiguredScope } from "@/lib/measurement-definitions/canonical";
import { definitionBindingFixture } from "@/lib/measurement-definitions/fixtures";
import { expect, it, vi } from "vitest";
import { observationDefinitionForCheck } from "./persist-definition";
import type { WebObservationRunInput } from "./types";

function input(): WebObservationRunInput {
  const binding = definitionBindingFixture();
  return {
    surface: "web_serp",
    engine: "google",
    provider: "synthetic",
    completeness: "unknown",
    configuredScope: frozenConfiguredScope(binding.source.target),
    effectiveScope: null,
    items: [],
    executedAt: new Date("2026-10-12T10:00:00Z"),
    requestPolicy: {
      depth: 100,
      stopOnMatch: true,
      forcedAiOverview: false,
      evidence: {
        version: 1,
        adapterVersion: "synthetic-adapter-v1",
        observedAt: null,
        requestedAt: null,
        completeThrough: { organic_result: null },
        targetRevision: "untrusted",
        policyRevision: "untrusted",
      },
    },
  };
}
function database(rows: unknown[]) {
  return { $queryRaw: vi.fn().mockResolvedValue(rows) };
}
it("links only the exact original owner and leaves provider uncertainty unchanged", async () => {
  const binding = definitionBindingFixture();
  const original = input();
  const result = await observationDefinitionForCheck(
    database([binding]) as never,
    binding.projectId,
    binding.owner.rankCheckId,
    original,
    binding.id,
  );
  expect(result.definitionBindingId).toBe(binding.id);
  expect(result.input.requestPolicy.evidence).toMatchObject({
    targetRevision: binding.targetRevision,
    policyRevision: binding.policyRevision,
    observedAt: null,
    completeThrough: { organic_result: null },
  });
  expect(original.requestPolicy.evidence?.targetRevision).toBe("untrusted");
});
it("leaves a legacy unbound observation without claimed target or policy revisions", async () => {
  const result = await observationDefinitionForCheck(
    database([]) as never,
    "project",
    "check",
    input(),
  );
  expect(result.definitionBindingId).toBeNull();
  expect(result.input.requestPolicy.evidence).toMatchObject({
    targetRevision: null,
    policyRevision: null,
    observedAt: null,
  });
});
it.each(["check", "scope", "provider", "depth", "stop", "find", "adapter"])(
  "rejects mismatched original %s proof",
  async (kind) => {
    const binding = definitionBindingFixture();
    const observation = input();
    if (kind === "scope") observation.configuredScope.location = "Different";
    if (kind === "provider") observation.provider = "different";
    if (kind === "depth") observation.requestPolicy.depth = 20;
    if (kind === "stop") observation.requestPolicy.stopOnMatch = false;
    if (kind === "find") observation.requestPolicy.findTargetsIn = "with_subdomains";
    if (kind === "adapter") observation.requestPolicy.evidence!.adapterVersion = "different";
    await expect(
      observationDefinitionForCheck(
        database([binding]) as never,
        binding.projectId,
        kind === "check" ? "different-check" : binding.owner.rankCheckId,
        observation,
        binding.id,
      ),
    ).rejects.toThrow("original measurement request");
  },
);
it("requires the winning attempt instead of reconstructing it from a check", async () => {
  const binding = definitionBindingFixture();
  await expect(
    observationDefinitionForCheck(
      database([{ id: binding.id }]) as never,
      binding.projectId,
      binding.owner.rankCheckId,
      input(),
    ),
  ).rejects.toThrow("winning measurement attempt");
});
it("can persist a selected fallback attempt without selecting another owner", async () => {
  const binding = definitionBindingFixture();
  const winner = {
    ...binding,
    id: "winning-fallback",
    owner: { ...binding.owner, executionKey: "fallback" },
  };
  const db = database([winner]);
  const result = await observationDefinitionForCheck(
    db as never,
    winner.projectId,
    winner.owner.rankCheckId,
    input(),
    winner.id,
  );
  expect(result.definitionBindingId).toBe(winner.id);
  expect(db.$queryRaw).toHaveBeenCalledOnce();
  expect(db.$queryRaw.mock.calls[0]?.slice(1)).toContain(winner.id);
});
