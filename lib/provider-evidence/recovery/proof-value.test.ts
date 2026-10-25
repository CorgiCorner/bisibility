import { envelope } from "@/lib/provider-evidence/dataforseo/fixtures.test-support";
import { parseRecoveryGet } from "@/lib/provider-evidence/dataforseo/parser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { identityFixture } from "./fixture.test-support";
import { verifiedProofValue } from "./proof-value";

beforeEach(() => vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64")));
afterEach(() => vi.unstubAllEnvs());
it.each([
  [1, "verified"],
  [2, "conflict"],
  [null, "unknown"],
] as const)("RE-6 recovered ID requires agreeing ID List cost %s", (listedCostCents, kind) => {
  const result = verifiedProofValue(identityFixture(), {
    kind: "evidence",
    ...parseRecoveryGet(envelope(20000, 0.01)),
    proofSource: {
      accountId: "original",
      credentialVersion: "v1",
      knownId: false,
      listedCostCents,
    },
  });
  expect(result.kind).toBe(kind);
});
it("RE-6 stable account/native hash ignores retrieval time and separates original accounts", () => {
  const evidence = {
    kind: "evidence" as const,
    ...parseRecoveryGet(envelope(20000, 0.01)),
    proofSource: {
      accountId: "original",
      credentialVersion: "v1",
      knownId: true,
      listedCostCents: null,
    },
  };
  const first = verifiedProofValue(identityFixture(), evidence);
  const second = verifiedProofValue(identityFixture(), structuredClone(evidence));
  expect(first).toEqual(second);
  expect(
    verifiedProofValue(identityFixture(), {
      ...evidence,
      proofSource: { ...evidence.proofSource, accountId: "other" },
    }),
  ).not.toEqual(first);
});
