import { OperationAccessDeniedError } from "@/lib/operations/access-error";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiResearchPaidFailure, outcome } from "./outcome";
import { AiPreDispatchRefusal } from "./validation";

const payment = {
  actionId: "act_1",
  quoteId: null,
  option: { id: "own", payableUnit: "usd" },
  state: "unknown",
  charge: { value: null, unit: "usd", certainty: "unknown" },
} as unknown as ConstructorParameters<typeof AiResearchPaidFailure>[1];

afterEach(() => vi.restoreAllMocks());

describe("paid AI research failures", () => {
  it("logs the redacted original cause while the customer still gets the generic refusal", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cause = Object.assign(new Error("permission denied for table report_rows"), {
      code: "P2010",
    });
    const result = await outcome(async () => {
      throw new AiResearchPaidFailure(cause, payment);
    });
    expect(result).toMatchObject({ ok: false, reason: "provider_error", retryBlocked: true });
    expect(log).toHaveBeenCalledTimes(1);
    const [message, context] = log.mock.calls[0];
    expect(message).toBe("[ai-research] paid attempt failed after provider dispatch");
    expect(context).toMatchObject({
      name: "Error",
      code: "P2010",
      actionId: "act_1",
      paymentState: "unknown",
    });
    expect(String(context.error)).toContain("permission denied for table report_rows");
  });

  it("does not log refusals that never reached a paid dispatch", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await outcome(async () => ({ ok: true }) as never);
    expect(log).not.toHaveBeenCalled();
  });
});

it("preserves a pre-dispatch subscription refusal for the REST mapper", async () => {
  const error = new OperationAccessDeniedError({ subscriptionRequired: true });
  await expect(
    outcome(async () => {
      throw new AiPreDispatchRefusal(error);
    }),
  ).rejects.toBe(error);
});

it("keeps other pre-dispatch operation refusals generic", async () => {
  await expect(
    outcome(async () => {
      throw new AiPreDispatchRefusal(new OperationAccessDeniedError());
    }),
  ).resolves.toMatchObject({ ok: false, reason: "analysis_refused" });
});
