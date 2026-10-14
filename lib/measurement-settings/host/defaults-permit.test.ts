import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-preview-key-only-0123456789")],
}));

import { consumeDefaultsWritePermit, verifyDefaultsWritePermit } from "./defaults-permit";
import { signSettingsQuote } from "./quote-binding";

const now = new Date("2026-10-13T12:00:00Z");
const binding = {
  projectId: "original",
  actorId: "writer",
  depth: 50 as const,
  providerId: null,
  source: { sourceHash: "epoch-A", credential: "key-A" },
  selection: { depth: 50, stopOnMatch: false, frequency: "daily" },
};
describe("defaults writer requires real reviewed authority", () => {
  it("refuses a client-shaped permit even for the right project", () => {
    expect(() =>
      consumeDefaultsWritePermit({ projectId: "original" }, "original", "writer"),
    ).toThrow(/review/i);
  });
  it("consumes an exact real HMAC permit once and refuses a foreign project", () => {
    const token = signSettingsQuote("defaults", binding, now).token;
    const foreign = verifyDefaultsWritePermit("defaults", token, binding, now);
    expect(() => consumeDefaultsWritePermit(foreign, "foreign", "writer")).toThrow();
    const original = verifyDefaultsWritePermit("defaults", token, binding, now);
    consumeDefaultsWritePermit(original, "original", "writer");
    expect(() => consumeDefaultsWritePermit(original, "original", "writer")).toThrow();
  });
  it.each([
    { ...binding, actorId: "other" },
    { ...binding, source: { sourceHash: "epoch-B", credential: "key-A" } },
    { ...binding, source: { sourceHash: "epoch-A", credential: "key-B" } },
    { ...binding, selection: { ...binding.selection, stopOnMatch: true } },
    { ...binding, selection: { ...binding.selection, frequency: "paused" } },
  ])("refuses changed identity/source/draft before a write permit, case %#", (changed) => {
    const token = signSettingsQuote("defaults", binding, now).token;
    expect(() => verifyDefaultsWritePermit("defaults", token, changed, now)).toThrow();
  });
  it("refuses expired and other-purpose quotes", () => {
    const signed = signSettingsQuote("defaults", binding, now);
    expect(() =>
      verifyDefaultsWritePermit(
        "defaults",
        signed.token,
        binding,
        new Date(now.getTime() + 601_000),
      ),
    ).toThrow();
    expect(() => verifyDefaultsWritePermit("intent", signed.token, binding, now)).toThrow();
  });
  it("seals a real key principal, refuses a substituted issuer, and cannot reuse its permit", () => {
    const signed = signSettingsQuote("defaults", binding, now);
    const permit = verifyDefaultsWritePermit("defaults", signed.token, binding, now, {
      kind: "project_key",
      id: "writer",
    });
    expect(() => consumeDefaultsWritePermit(permit, "original", "owner")).toThrow();
    expect(consumeDefaultsWritePermit(permit, "original", "writer")).toEqual({
      kind: "project_key",
      id: "writer",
    });
    expect(() => consumeDefaultsWritePermit(permit, "original", "writer")).toThrow();
    expect(() =>
      verifyDefaultsWritePermit("defaults", signed.token, binding, now, {
        kind: "project_key",
        id: "other",
      }),
    ).toThrow();
    expect(() =>
      verifyDefaultsWritePermit("intent", signed.token, binding, now, {
        kind: "project_key",
        id: "writer",
      }),
    ).toThrow();
  });
});
