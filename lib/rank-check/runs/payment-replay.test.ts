import { expect, it, vi } from "vitest";
import { findPaymentRunReplay, paymentReplayQuoteId } from "./payment-replay";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
it("recovers only a committed same-principal quote identity even after browser expiry", async () => {
  const quoteId = "11111111-1111-4111-8111-111111111111";
  const token = `${Buffer.from(JSON.stringify({ id: quoteId, exp: 1 })).toString("base64url")}.old-signature`;
  const findFirst = vi.fn().mockResolvedValue({
    publicId: "rcr_existing",
    status: "queued",
    targetCount: 1,
    keywordCount: 1,
    estimatedCostCents: 1,
  });
  const input = {
    project: { id: "project" },
    actorId: "actor",
    origin: { source: "app" },
    acceptedPayment: { quoteToken: token },
  };
  expect(
    await findPaymentRunReplay(input as never, { rankCheckRun: { findFirst } } as never),
  ).toMatchObject({ publicId: "rcr_existing" });
  expect(findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        projectId: "project",
        requestedById: "actor",
        source: "app",
        credentialKind: null,
        credentialId: null,
        selectionSpec: { path: ["rankPaymentQuoteId"], equals: quoteId },
      },
    }),
  );
  findFirst.mockResolvedValue(null);
  expect(
    await findPaymentRunReplay(
      { ...input, actorId: "other" } as never,
      { rankCheckRun: { findFirst } } as never,
    ),
  ).toBeNull();
  expect(paymentReplayQuoteId("malformed")).toBeNull();
  expect(paymentReplayQuoteId("x".repeat(12001))).toBeNull();
});
