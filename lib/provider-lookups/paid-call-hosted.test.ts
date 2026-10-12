import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { expect, it, vi } from "vitest";
import { runHostedPaidProviderCall } from "./paid-call-hosted";

const mocks = vi.hoisted(() => ({ run: vi.fn(), attribution: vi.fn() }));
vi.mock("./paid-call-deployment", () => ({ runDeploymentPaidCall: mocks.run }));
vi.mock("@/lib/provider-usage/tag", () => ({
  createProviderRequestAttribution: mocks.attribution,
}));
it("preserves hosted budget refusal identity and admission details", async () => {
  const error = new DeploymentAdmissionExhaustedError("budget", {
    scope: "wallet",
    surface: "programmatic",
    projectId: "project",
    resetAt: new Date("2026-11-01"),
  });
  mocks.run.mockRejectedValueOnce(error);
  await expect(
    runHostedPaidProviderCall({
      call: vi.fn(),
      connection: { id: "connection", credentialsEncrypted: null, provider: "dataforseo" },
      estimatedCostCents: 1,
      feature: "keyword_research",
      itemCount: 1,
      projectId: "project",
      provider: { id: "dataforseo" } as Parameters<typeof runHostedPaidProviderCall>[0]["provider"],
      source: "api",
      trigger: "manual",
    }),
  ).rejects.toBe(error);
});
