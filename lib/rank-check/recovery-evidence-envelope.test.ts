import { createHash } from "node:crypto";
import { encryptSecret } from "@/lib/providers/crypto";
import { describe, expect, it, vi } from "vitest";
import { decodeRankResult, RetainedRankResultUnsupportedError } from "./recovery-evidence";
import { readRetainedRankResultEnvelope } from "./recovery-evidence-envelope";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/metering/recovery/tokens", () => ({ recoveryInstance: () => "test-instance" }));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "test-namespace" }));

const contextHash = "ab".repeat(32);
const legacy = {
  version: 1 as const,
  contextHash,
  target: {
    attempts: [],
    expectedUrlAtCheck: null,
    keywordId: "keyword_1",
    projectId: "project_1",
    queuedTaskId: null,
  },
  result: {
    rankCheck: {
      billingUnits: null,
      checkedAt: "2026-10-23T06:00:00.000Z",
      costCents: null,
      estimatedCostCents: null,
      keywordId: "keyword_1",
      normalizationVersion: "v1",
      organicRanks: null,
      position: 4,
      previousPosition: null,
      provider: "example",
      rankingUrl: null,
      raw: null,
      requestedDepth: 100 as const,
    },
  },
};

describe("retained rank result envelopes", () => {
  it("reads a legacy envelope as unknown and still decrypts it for restore", () => {
    const body = JSON.stringify(legacy);
    expect(readRetainedRankResultEnvelope(legacy)).toMatchObject({
      completeness: "unknown",
      finishedAt: null,
      restorable: true,
      returnedDepth: null,
    });
    expect(
      decodeRankResult({
        identityHash: createHash("sha256").update(body).digest("hex"),
        payloadEncrypted: encryptSecret(body),
        schemaVersion: 1,
      }).version,
    ).toBe(1);
  });

  it.each(["complete", "partial"] as const)(
    "recognizes v2 %s without allowing restore",
    (completeness) => {
      const next = {
        ...legacy,
        completeness,
        finishedAt: "2026-10-23T06:04:00.000Z",
        returnedDepth: 40,
        version: 2 as const,
      };
      expect(readRetainedRankResultEnvelope(next)).toMatchObject({
        completeness,
        finishedAt: "2026-10-23T06:04:00.000Z",
        restorable: false,
        returnedDepth: 40,
      });
      const body = JSON.stringify(next);
      expect(() =>
        decodeRankResult({
          identityHash: createHash("sha256").update(body).digest("hex"),
          payloadEncrypted: encryptSecret(body),
          schemaVersion: 2,
        }),
      ).toThrow(RetainedRankResultUnsupportedError);
    },
  );
});
