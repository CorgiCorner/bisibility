import { Prisma } from "@/lib/generated/prisma/client";
import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), samples: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { aiTrackingSample: { findMany: mocks.samples } } }));
vi.mock("@/lib/metering/usage-read", () => ({ readCanonicalUsage: mocks.read }));

import { listTrackingSamples } from "./samples";

test("retains explicit no-dispatch zero evidence without inventing a Meter operation", async () => {
  mocks.samples.mockResolvedValue([
    {
      id: "sample",
      publicId: "asm_000000000000000000000000",
      createdAt: new Date(),
      dispatch: "terminal",
      providerTaskId: null,
      plan: { credentialConnectionId: "connection", credentialVersion: "v1" },
      receipt: {
        providerCostEntryId: null,
        operationRef: null,
        amountUsd: "0",
        state: "confirmed",
        noDispatch: true,
      },
    },
  ]);
  expect((await listTrackingSamples("project", "run")).items[0]?.receipt).toMatchObject({
    amountUsd: "0",
    state: "confirmed",
    noDispatch: true,
    operationRef: null,
  });
});

test("sample UI and exports replace persisted costs with effective canonical receipts", async () => {
  vi.stubEnv("METERING_NAMESPACE", "test");
  mocks.samples.mockResolvedValue([
    {
      id: "sample",
      publicId: "asm_000000000000000000000000",
      createdAt: new Date(),
      plan: { credentialConnectionId: "connection", credentialVersion: "v1" },
      receipt: { providerCostEntryId: "op", amountUsd: "9", state: "confirmed" },
    },
  ]);
  mocks.read.mockResolvedValue([
    {
      id: "op",
      namespace: "test",
      connectionId: "connection",
      providerCredentialVersion: "v1",
      measurementStatus: "recorded",
      costCents: new Prisma.Decimal(100),
    },
  ]);
  expect((await listTrackingSamples("project", "run")).items[0]?.receipt).toMatchObject({
    amountUsd: "1",
    operationRef: { version: 1, namespace: "test", operationId: "op" },
  });
  mocks.read.mockResolvedValue([]);
  expect((await listTrackingSamples("project", "run")).items[0]?.receipt).toMatchObject({
    amountUsd: null,
    state: "unknown",
  });
  vi.unstubAllEnvs();
});
