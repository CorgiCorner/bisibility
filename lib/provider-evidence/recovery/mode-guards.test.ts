import type { Prisma } from "@/lib/generated/prisma/client";
import { onRecoveryEnqueued } from "@/lib/provider-evidence/incidents/enqueue";
import { refreshOperationIncident } from "@/lib/provider-evidence/incidents/refresh";
import { afterEach, expect, it, vi } from "vitest";
import { identityFixture } from "./fixture.test-support";
import { importRecoveryProof } from "./proof";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
afterEach(() => vi.unstubAllEnvs());

it.each(["off", "observe"])("%s cannot write proofs or customer incidents", async (mode) => {
  vi.stubEnv("PROVIDER_RECOVERY", mode);
  const tx = new Proxy(
    {},
    {
      get: () => {
        throw new Error("Protected database access");
      },
    },
  ) as Prisma.TransactionClient;
  expect(
    await importRecoveryProof(
      tx,
      identityFixture(),
      "operation",
      { kind: "inactive", reason: "lookup_disabled" },
      new Date(),
    ),
  ).toEqual({
    accounting: "unknown",
    reason: "proof_writes_disabled",
  });
  await onRecoveryEnqueued(tx, {
    id: "intent",
    operationPk: "operation",
    attemptId: "attempt",
    accountingOnly: false,
  });
  await refreshOperationIncident(tx, "operation");
});
