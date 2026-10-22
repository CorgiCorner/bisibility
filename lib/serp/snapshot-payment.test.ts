import { paymentFingerprint } from "@/lib/action-payment/token";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertSnapshotPaymentScope, prepareSnapshotExtensionPayment } from "./snapshot-payment";

const mock = vi.hoisted(() => ({
  check: vi.fn(),
  connection: vi.fn(),
  view: vi.fn(),
  payment: vi.fn(),
  hostedCost: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/execution-extension", () => ({
  hostedRankCheckEstimatedCostCents: mock.hostedCost,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    rankCheck: { findFirst: mock.check },
    providerConnection: { findFirst: mock.connection },
  },
}));
vi.mock("@/lib/action-payment/session", () => ({ prepareActionPayment: mock.payment }));
vi.mock("./snapshot-extension-view", () => ({ loadSnapshotExtensionView: mock.view }));

const input = { actorId: "actor", projectId: "project", checkId: "check_original", nextStart: 20 };
const context = {
  version: 1,
  connectionId: "original-connection",
  capturedAt: new Date().toISOString(),
  keyword: "example",
  domain: "example.com",
  device: "desktop",
  nextStart: 20,
  ended: false,
  location: {
    gl: "us",
    hl: "en",
    primaryGeoCode: null,
    primaryGeoName: "United States",
    secondaryGeoName: "United States",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.hostedCost.mockResolvedValue(0.25);
  mock.check.mockResolvedValue({ provider: "serpapi", raw: { snapshotContinuation: context } });
  mock.view.mockResolvedValue({ reason: "available" });
  mock.connection.mockResolvedValue({
    id: "original-connection",
    publicId: "conn_original",
    provider: "serpapi",
    credentialSource: "own",
    credentialsEncrypted: "fixture",
    project: { ownerId: "owner" },
  });
  mock.payment.mockResolvedValue({ quote: { id: "quote" }, options: [] });
});

describe("snapshot extension payment", () => {
  it("never shows a quote as valid beyond the original snapshot window", async () => {
    const deadline = new Date(Date.now() + 30_000).toISOString();
    mock.view.mockResolvedValue({ reason: "available", expiresAt: deadline });
    mock.payment.mockResolvedValue({
      quote: { expiresAt: new Date(Date.now() + 600_000).toISOString() },
    });
    const result = await prepareSnapshotExtensionPayment(input, false);
    if (!result.ok) throw new Error("Expected quote");
    expect(result.payment.quote.expiresAt).toBe(deadline);
  });
  it("quotes one new search on the original own key, with the exact saved context", async () => {
    const result = await prepareSnapshotExtensionPayment(input, false);
    expect(result.ok).toBe(true);
    expect(mock.connection).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "original-connection",
          projectId: "project",
          provider: "serpapi",
          kind: "serp",
          credentialSource: { in: ["own", "hosted"] },
          enabled: true,
          status: "connected",
        },
      }),
    );
    expect(mock.payment).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "actor",
        ownerId: "owner",
        projectId: "project",
        requirePayment: false,
        feature: "rank_check",
        source: "app",
        request: {
          operation: "snapshot_extension",
          checkId: input.checkId,
          context,
          nextStart: 20,
        },
        children: [{ key: "snapshot-page", costCents: 0, quantity: 1, cached: false }],
      }),
    );
    const descriptor = mock.payment.mock.calls[0][0].provider.payment;
    expect(descriptor.estimateQuantity("rank_check", 1)).toBe("1");
  });

  it("quotes credits for the original hosted SerpApi connection, without an own key", async () => {
    mock.connection.mockResolvedValue({
      id: "original-connection",
      publicId: "conn_original",
      provider: "serpapi",
      credentialSource: "hosted",
      credentialsEncrypted: null,
      project: { ownerId: "owner" },
    });
    const result = await prepareSnapshotExtensionPayment(input, false);
    expect(result.ok).toBe(true);
    expect(mock.hostedCost).toHaveBeenCalledWith("serpapi", 10);
    expect(mock.payment).toHaveBeenCalledWith(
      expect.objectContaining({
        connection: expect.objectContaining({ credentialSource: "hosted" }),
        children: [{ key: "snapshot-page", costCents: 0.25, quantity: 1, cached: false }],
      }),
    );
  });
  it("requires the new quote on execution, independently of the original rank purchase", async () => {
    const acceptedPayment = { quoteToken: "new-extension-quote" };
    await prepareSnapshotExtensionPayment({ ...input, acceptedPayment }, true);
    expect(mock.payment).toHaveBeenCalledWith(
      expect.objectContaining({ requirePayment: true, acceptedPayment }),
    );
  });

  it.each(["expired", "running", "failed", "unsupported"])(
    "does not quote %s snapshots",
    async (reason) => {
      mock.view.mockResolvedValue({ reason });
      expect(await prepareSnapshotExtensionPayment(input, false)).toEqual({ ok: false, reason });
      expect(mock.payment).not.toHaveBeenCalled();
    },
  );

  it("allows quoting a retry only after authoritative not-sent proof", async () => {
    mock.view.mockResolvedValue({ reason: "not_sent" });
    expect((await prepareSnapshotExtensionPayment(input, false)).ok).toBe(true);
  });

  it("rejects a stale offset and a disconnected original key without selecting another source", async () => {
    expect(await prepareSnapshotExtensionPayment({ ...input, nextStart: 30 }, false)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    mock.connection.mockResolvedValue(null);
    expect(await prepareSnapshotExtensionPayment(input, false)).toEqual({
      ok: false,
      reason: "disconnected",
    });
    expect(mock.payment).not.toHaveBeenCalled();
  });

  it("rejects context changed between the quote read and the locked claim", () => {
    const scope = { checkId: input.checkId, context, nextStart: 20 };
    expect(() => assertSnapshotPaymentScope(paymentFingerprint(scope), scope)).not.toThrow();
    expect(() =>
      assertSnapshotPaymentScope(paymentFingerprint(scope), { ...scope, nextStart: 30 }),
    ).toThrow();
    expect(() =>
      assertSnapshotPaymentScope(paymentFingerprint(scope), {
        ...scope,
        context: { ...context, connectionId: "different-key" },
      }),
    ).toThrow();
  });
});
