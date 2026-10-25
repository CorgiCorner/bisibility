import { makePublicId } from "@/lib/db/public-id";
import type { ProviderDispatchIdentity } from "@/lib/generated/prisma/client";
import { envelope } from "@/lib/provider-evidence/dataforseo/fixtures.test-support";
import { parseRecoveryGet } from "@/lib/provider-evidence/dataforseo/parser";
import { afterEach, expect, it, vi } from "vitest";
import { captureRecoveryResult } from "./result";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
afterEach(() => vi.unstubAllEnvs());
it.each(["off", "observe", "legacy-read-only", "editable"])(
  "result acquisition %s stops before any database access",
  async (mode) => {
    vi.stubEnv("PROVIDER_RECOVERY", ["off", "observe"].includes(mode) ? mode : "on");
    vi.stubEnv("DEMO_MODE", mode === "editable" ? "editable" : "");
    vi.stubEnv("READ_ONLY_DEMO", mode === "legacy-read-only" ? "1" : "0");
    vi.stubEnv("DEMO_USER_ID", makePublicId("usr"));
    vi.stubEnv("DEMO_OWNER_ID", makePublicId("usr"));
    vi.stubEnv("DEMO_PROJECT_ID", makePublicId("prj"));
    const tx = new Proxy(
      {},
      {
        get: () => {
          throw new Error("Capture accessed database");
        },
      },
    );
    const identity = {
      payerKind: "byok",
      payerAccountRef: "connection",
      connectionId: "connection",
      providerCredentialVersion: "v1",
      rankCheckId: "check",
    } as ProviderDispatchIdentity;
    const outcome = {
      kind: "evidence" as const,
      ...parseRecoveryGet(envelope()),
      proofSource: {
        accountId: "connection",
        credentialVersion: "v1",
        knownId: true,
        listedCostCents: null,
      },
    };
    expect(await captureRecoveryResult(tx as never, identity, "attempt", outcome, new Date())).toBe(
      mode === "observe" ? "restore_disabled" : "lookup_disabled",
    );
  },
);
