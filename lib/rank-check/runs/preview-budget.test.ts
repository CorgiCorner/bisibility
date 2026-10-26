import {
  BudgetExhaustedError,
  ProviderAllocationExhaustedError,
} from "@/lib/metering/admission-errors";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ available: vi.fn() }));
vi.mock("@/lib/provider-usage/enforcement", async (original) => ({
  ...(await original<typeof import("@/lib/provider-usage/enforcement")>()),
  assertProviderAllocationAvailable: mocks.available,
}));

import { allocationBudget } from "./preview-budget";

beforeEach(() => vi.clearAllMocks());

it("returns a blocked preview with the project reconciliation reason", async () => {
  mocks.available.mockRejectedValue(
    new BudgetExhaustedError({
      projectId: "project",
      capCents: 5000,
      spentCents: 0.2,
      valuationIncomplete: true,
    }),
  );
  await expect(
    allocationBudget("project", "dataforseo", "connection", 0.2, [20], "app"),
  ).resolves.toEqual({ blocked: true, reason: "usage_reconciliation_required", surface: "app" });
});

it("preserves the connection reconciliation reason in a blocked preview", async () => {
  mocks.available.mockRejectedValue(
    new ProviderAllocationExhaustedError(
      "connection",
      "app",
      null,
      "usage_reconciliation_required",
    ),
  );
  await expect(
    allocationBudget("project", "dataforseo", "connection", 0.2, [20], "app"),
  ).resolves.toEqual({ blocked: true, reason: "usage_reconciliation_required", surface: "app" });
});
