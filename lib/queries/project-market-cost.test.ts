import { beforeEach, describe, expect, it, vi } from "vitest";

const estimate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cost-estimate/project-estimate", () => ({ monthlyTrackingCostCents: estimate }));

import { marketMonthlyCostCents } from "./project-market-cost";

const legacy = { frequency: "daily" as const, cronExpression: null, serpDepth: 100 };
const named = {
  ...legacy,
  enabled: true,
  archivedAt: null,
  serpDepth: 50,
  providerPolicy: "serpapi",
};
const connection = (provider: string, amountCents: string, priority: number) => ({
  provider,
  enabled: true,
  kind: "serp" as const,
  status: "connected",
  priority,
  credentialSource: "own",
  rates: [{ feature: "rank_check", amountCents }],
});
const project = {
  defaults: legacy,
  providerConnections: [connection("dataforseo", "2", 0), connection("serpapi", "7", 1)],
};
describe("market schedule cost authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estimate.mockImplementation((_count, context) => context.overrideCents);
  });
  it.each([null, { ...named, enabled: false }, { ...named, archivedAt: new Date(0) }])(
    "keeps missing/disabled/archived membership at zero despite legacy daily",
    (checkSchedule) => {
      expect(marketMonthlyCostCents([{ checkSchedule, schedule: legacy }], project)).toBe(0);
      expect(estimate).not.toHaveBeenCalled();
    },
  );
  it("ignores archived targets even if their schedule remains enabled", () => {
    expect(
      marketMonthlyCostCents(
        [{ archivedAt: new Date(0), checkSchedule: named, schedule: legacy }],
        project,
      ),
    ).toBe(0);
    expect(estimate).not.toHaveBeenCalled();
  });
  it("uses pinned schedule provider and depth instead of project primary and mirror", () => {
    expect(marketMonthlyCostCents([{ checkSchedule: named, schedule: legacy }], project)).toBe(7);
    expect(estimate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        providerId: "serpapi",
        overrideCents: 7,
        depth: 50,
        rawFrequency: "daily",
      }),
    );
  });
  it("keeps a missing pinned provider unknown instead of switching price source", () => {
    expect(
      marketMonthlyCostCents(
        [{ checkSchedule: { ...named, providerPolicy: "missing" }, schedule: legacy }],
        project,
      ),
    ).toBeNull();
    expect(estimate).not.toHaveBeenCalled();
  });
  it("uses project primary only for inherited provider selection", () => {
    expect(
      marketMonthlyCostCents(
        [{ checkSchedule: { ...named, providerPolicy: "project" }, schedule: legacy }],
        project,
      ),
    ).toBe(2);
  });
});
