import {
  ProviderRecoveryAdmissionError,
  ProviderUsagePersistenceError,
} from "@/lib/providers/usage";
import { expect, it, vi } from "vitest";
import type { RunCheckInput } from "./runner-input";

const mocks = vi.hoisted(() => ({ write: vi.fn(), item: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { rankCheckRunItem: { findFirst: mocks.item } } }));
vi.mock("@/lib/integrations/provider-recovery/refusal-journal", () => ({
  recordRankRefusals: mocks.write,
}));
vi.mock("@/lib/provider-usage/credential-version", () => ({
  ownCredentialVersion: () => "version",
}));

import { recordRunnerRefusal } from "./runner-refusal";

it("preserves the typed refusal only before any earlier paid page was fenced", async () => {
  mocks.item.mockResolvedValue({ id: "item" });
  mocks.write.mockResolvedValue(undefined);
  const refusal = new ProviderRecoveryAdmissionError("account_blocked", { kind: "account" });
  const input = { rankCheckId: "check", connection: { id: "connection" } } as RunCheckInput;
  await expect(recordRunnerRefusal(refusal, input, "dataforseo", 0)).resolves.toBeUndefined();
  await expect(recordRunnerRefusal(refusal, input, "dataforseo", 1)).rejects.toBeInstanceOf(
    ProviderUsagePersistenceError,
  );
  expect(mocks.write).toHaveBeenCalledTimes(2);
});

it("never exposes a retryable provider failure when recording the refusal fails", async () => {
  mocks.write.mockRejectedValueOnce(new Error("database unavailable"));
  const refusal = new ProviderRecoveryAdmissionError("account_blocked", { kind: "account" });
  const input = { rankCheckId: "check", connection: { id: "connection" } } as RunCheckInput;
  await expect(recordRunnerRefusal(refusal, input, "dataforseo", 0)).rejects.toBeInstanceOf(
    ProviderUsagePersistenceError,
  );
});
