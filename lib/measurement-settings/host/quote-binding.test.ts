import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-test-key-only-0123456789")],
}));

import { createPreviewToken, PreviewTokenError } from "@/lib/rank-check/runs/preview-token";
import { settingsHash } from "./hash";
import {
  type SettingsQuoteBinding,
  settingsQuoteClock,
  signSettingsQuote,
  verifySettingsQuote,
} from "./quote-binding";

const asOf = new Date("2026-10-12T10:00:00Z");
const binding: SettingsQuoteBinding & { actorId: string } = {
  actorId: "synthetic-preview-issuer-A",
  projectId: "synthetic-project",
  providerId: "dataforseo",
  depth: 20,
  selection: { geoId: "synthetic-geo", device: "desktop", languageCode: "en", depth: 20 },
  source: { epoch: "4", priceVersion: "synthetic-price-v1", taskPostPriority: "high" },
};
describe("purpose-bound host quotes AUTHORED_NOT_RUN", () => {
  it("binds purpose, source epoch, exact intent, provider and native route priority", () => {
    const signed = signSettingsQuote("schedule", binding, asOf);
    expect(verifySettingsQuote("schedule", signed.token, binding, asOf).projectId).toBe(
      binding.projectId,
    );
    for (const purpose of ["manual", "intent"] as const)
      expect(() => verifySettingsQuote(purpose, signed.token, binding, asOf)).toThrow(
        PreviewTokenError,
      );
    for (const changed of [
      { ...binding, source: { ...(binding.source as object), epoch: "6" } },
      { ...binding, source: { ...(binding.source as object), taskPostPriority: "normal" } },
      { ...binding, selection: { depth: 50 } },
      { ...binding, projectId: "foreign" },
    ])
      expect(() => verifySettingsQuote("schedule", signed.token, changed, asOf)).toThrow(
        PreviewTokenError,
      );
  });
  it("uses an original bounded calendar clock, never treats decoded candidate as authority", () => {
    const signed = signSettingsQuote("schedule", binding, asOf);
    expect(settingsQuoteClock(signed.token, new Date(asOf.getTime() + 1000))).toEqual(asOf);
    const candidate =
      Buffer.from(JSON.stringify({ exp: Math.floor(asOf.getTime() / 1000) + 600 })).toString(
        "base64url",
      ) + ".tampered";
    expect(settingsQuoteClock(candidate, asOf)).toEqual(asOf);
    expect(() => verifySettingsQuote("schedule", candidate, binding, asOf)).toThrow(
      PreviewTokenError,
    );
    expect(() =>
      verifySettingsQuote("schedule", signed.token, binding, new Date(asOf.getTime() + 600000)),
    ).toThrow(PreviewTokenError);
    expect(() => settingsQuoteClock(signed.token, new Date(asOf.getTime() + 601000))).toThrow(
      PreviewTokenError,
    );
  });
});

describe("settings quote issuer authority", () => {
  it.each(["manual", "schedule", "intent"] as const)(
    "%s quote rejects a different authorized issuer",
    (purpose) => {
      const issued = signSettingsQuote(purpose, binding, asOf);
      expect(verifySettingsQuote(purpose, issued.token, binding, asOf).projectId).toBe(
        binding.projectId,
      );
      expect(() =>
        verifySettingsQuote(
          purpose,
          issued.token,
          { ...binding, actorId: "synthetic-preview-issuer-B" },
          asOf,
        ),
      ).toThrow(PreviewTokenError);
    },
  );
  it.each(["manual", "schedule", "intent"] as const)(
    "%s legacy issuerless quote requires a new preview",
    (purpose) => {
      // Real old wire protocol signed by the maintained HMAC engine; not a malformed token.
      const legacy = createPreviewToken(
        {
          projectId: binding.projectId,
          depth: binding.depth,
          providerId: binding.providerId,
          trigger: "manual",
          estimateCents: -1,
          selectionHash: settingsHash(`selection:${purpose}`, binding.selection),
          sourceHash: settingsHash(`quote:${purpose}`, binding.source),
        },
        asOf,
      );
      expect(() => verifySettingsQuote(purpose, legacy.token, binding, asOf)).toThrow(
        PreviewTokenError,
      );
    },
  );
  it("rejects missing issuer without guessing a default actor", () => {
    const { actorId: _actor, ...issuerless } = binding;
    // @ts-expect-error The private host binding requires a trusted actor.
    expect(() => signSettingsQuote("manual", issuerless, asOf)).toThrow(PreviewTokenError);
  });
  it("does not expose raw issuer identity in the token envelope", () => {
    const issued = signSettingsQuote("manual", binding, asOf);
    const payload = JSON.parse(
      Buffer.from(issued.token.split(".")[0], "base64url").toString("utf8"),
    );
    expect(payload).not.toHaveProperty("actorId");
    expect(JSON.stringify(payload)).not.toContain(binding.actorId);
  });
});
