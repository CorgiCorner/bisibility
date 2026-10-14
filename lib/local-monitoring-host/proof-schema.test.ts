import { localDigest } from "@/lib/local-monitoring-store/canonical";
import { describe, expect, it } from "vitest";
import { originalProofStorageConflict } from "./errors";
import { hostCustody, originalReply } from "./host.test-fixture";
import {
  normalizeOriginalProofBinding,
  originalProofBinding,
  originalSubmitBodyHash,
  originalSubmitProofSchema,
} from "./proof-schema";
import { canonicalLocalSubmitReply } from "./submission-reply";

describe("minimal original acceptance proof identity", () => {
  it("binds project, namespace, attempt, lease and immutable request without exposing coordinates", () => {
    const binding = originalProofBinding(hostCustody());
    const key = localDigest(normalizeOriginalProofBinding(binding));
    for (const change of [
      { projectId: "another-project" },
      { namespace: "another-namespace" },
      { attemptId: "another-attempt" },
      { preparedLeaseId: "another-lease" },
      { requestHash: "another-request" },
    ])
      expect(localDigest(normalizeOriginalProofBinding({ ...binding, ...change }))).not.toBe(key);
    expect(key).not.toContain(binding.projectId);
    expect(key).not.toContain(binding.credentialVersion);
  });
  it("ignores incidental server row properties while retaining only the explicit custody contract", () => {
    const binding = originalProofBinding(hostCustody());
    const row = { ...binding, id: "internal-row", record: {}, createdAt: "irrelevant" };
    expect(localDigest(normalizeOriginalProofBinding(row))).toBe(
      localDigest(normalizeOriginalProofBinding(binding)),
    );
  });
  it("rejects modified proof body, invented exhaustiveness and raw payload/header fields", () => {
    const custody = hostCustody();
    const outcome = canonicalLocalSubmitReply(originalReply());
    const value = {
      version: 1,
      source: "dispatched_original_submit",
      custody,
      outcome,
      exhaustive: true,
      bodyHash: originalSubmitBodyHash(custody, outcome),
    };
    expect(originalSubmitProofSchema.parse(value).outcome).toEqual(outcome);
    expect(() =>
      originalSubmitProofSchema.parse({
        ...value,
        outcome: { ...outcome, taskIds: ["changed-task"] },
      }),
    ).toThrow();
    expect(() => originalSubmitProofSchema.parse({ ...value, exhaustive: false })).toThrow();
    expect(() =>
      originalSubmitProofSchema.parse({
        ...value,
        headers: { Authorization: "synthetic-not-a-secret" },
        raw: {},
      }),
    ).toThrow();
  });
  it("does not classify database custody constraints as a diagnostic infrastructure fallback", () => {
    expect(
      originalProofStorageConflict({
        code: "P2010",
        meta: { driverAdapterError: { cause: { originalCode: "23514" } } },
      }),
    ).toBe(true);
    expect(originalProofStorageConflict({ code: "P2003" })).toBe(true);
    expect(originalProofStorageConflict({ code: "57014" })).toBe(false);
    expect(originalProofStorageConflict({ code: "ECONNRESET" })).toBe(false);
  });
});
