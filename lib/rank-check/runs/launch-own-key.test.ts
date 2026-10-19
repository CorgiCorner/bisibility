import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ quote: vi.fn(), required: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/own-key-policy-extension", () => ({
  ownProviderKeysRequired: mocks.required,
}));
vi.mock("@/lib/providers/execution-extension", () => ({
  deploymentRankUsesNativeUnits: vi.fn(async () => false),
  hostedRankCheckEstimatedCostCents: vi.fn(),
  quoteDeploymentRankReservations: mocks.quote,
}));

import { OwnProviderKeyRequiredError } from "@/lib/providers/execution-extension-errors";
import { quoteRankRunReservationForLaunch } from "./launch-preflight";

type LaunchArgs = Parameters<typeof quoteRankRunReservationForLaunch>;

const tx = {
  project: { findUnique: vi.fn(async () => ({ ownerId: "owner_1" })) },
} as unknown as LaunchArgs[0];

function launch(credentialSource: "hosted" | "own") {
  return quoteRankRunReservationForLaunch(tx, {
    connection: { credentialSource, id: "connection_1", provider: "dataforseo" },
    projectId: "project_1",
    source: "api",
    targets: [{ cost: 0.2, depth: 10, keywordId: "keyword_1" }],
  } as LaunchArgs[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.quote.mockResolvedValue({ prices: { keyword_1: "0.2600" } });
});

describe("rank-check run launch for an account that must use its own provider keys", () => {
  it("refuses a hosted run at launch, before any reservation quote", async () => {
    mocks.required.mockResolvedValue(true);
    await expect(launch("hosted")).rejects.toBeInstanceOf(OwnProviderKeyRequiredError);
    expect(mocks.quote).not.toHaveBeenCalled();
  });

  it("launches an own-key run without consulting the policy", async () => {
    mocks.required.mockResolvedValue(true);
    await expect(launch("own")).resolves.toEqual({});
    expect(mocks.required).not.toHaveBeenCalled();
  });

  it("keeps the hosted reservation for an unflagged account", async () => {
    mocks.required.mockResolvedValue(false);
    await expect(launch("hosted")).resolves.toEqual({
      providerConnectionId: "connection_1",
      rankReservationPrices: { keyword_1: "0.2600" },
    });
  });
});
