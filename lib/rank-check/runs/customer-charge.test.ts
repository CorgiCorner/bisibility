import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ quote: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: object) => unknown) => fn({}),
  },
}));
vi.mock("./launch-preflight", () => ({ quoteRankRunReservation: mocks.quote }));

import { hostedReservationCustomerCents } from "./customer-charge";

const target = { keywordId: "keyword_1", cost: 1, depth: 10 as const };

beforeEach(() => {
  vi.clearAllMocks();
});

it("returns the hosted reservation customer charge", async () => {
  mocks.quote.mockResolvedValue({ rankReservationPrices: { keyword_1: "1.5000" } });

  await expect(
    hostedReservationCustomerCents({
      connection: { credentialSource: "hosted", id: "connection_1", provider: "serpapi" },
      projectId: "project_1",
      source: "app",
      targets: [target],
    }),
  ).resolves.toBe(1.5);
  expect(mocks.quote).toHaveBeenCalledOnce();
});

it("does not quote your keys or a target without a positive provider cost", async () => {
  await expect(
    hostedReservationCustomerCents({
      connection: { credentialSource: "own", id: "connection_1", provider: "dataforseo" },
      projectId: "project_1",
      source: "app",
      targets: [target],
    }),
  ).resolves.toBeUndefined();
  await expect(
    hostedReservationCustomerCents({
      connection: { credentialSource: "hosted", id: "connection_1", provider: "serpapi" },
      projectId: "project_1",
      source: "api",
      targets: [{ ...target, cost: 0 }],
    }),
  ).resolves.toBeUndefined();
  expect(mocks.quote).not.toHaveBeenCalled();
});
