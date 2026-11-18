import { describe, expect, it } from "vitest";
import { composerFixture } from "./composer-fixtures.test-support";
import { isCompleteQuote, sumForecasts } from "./composer-quote";
import { createFakeModelPlaygroundLaunchService } from "./launch-service.fake.test-support";

describe("free forecast completeness", () => {
  it("sums exact decimal strings only for complete same-currency estimates", async () => {
    const fixture = composerFixture();
    const service = createFakeModelPlaygroundLaunchService(fixture);
    const quote = await service.preview(
      { input: fixture.input, revision: "one" },
      new AbortController().signal,
    );
    expect(sumForecasts(quote.forecasts)).toBe("0.0024");
    quote.forecasts[0].money.amount = "0.0000000000000000001";
    quote.forecasts[1].money.amount = "0.0000000000000000002";
    expect(sumForecasts(quote.forecasts)).toBe("0.0000000000000000003");
    quote.forecasts[1].money.currency = "EUR";
    expect(sumForecasts(quote.forecasts)).toBeNull();
    quote.forecasts[1].money.currency = "USD";
    quote.forecasts[1].complete = false;
    expect(sumForecasts(quote.forecasts)).toBeNull();
    quote.forecasts[1].complete = true;
    quote.forecasts[1].money = {
      amount: null,
      currency: "USD",
      certainty: "unknown",
      basis: "unknown",
      rateCardVersion: null,
    };
    expect(sumForecasts(quote.forecasts)).toBeNull();
  });
  it("rejects missing, duplicate or malformed forecast rows", async () => {
    const fixture = composerFixture();
    const service = createFakeModelPlaygroundLaunchService(fixture);
    const quote = await service.preview(
      { input: fixture.input, revision: "one" },
      new AbortController().signal,
    );
    expect(isCompleteQuote(quote, fixture.input)).toBe(true);
    expect(isCompleteQuote({ ...quote, forecasts: quote.forecasts.slice(1) }, fixture.input)).toBe(
      false,
    );
    expect(
      isCompleteQuote(
        { ...quote, forecasts: [quote.forecasts[0], quote.forecasts[0]] },
        fixture.input,
      ),
    ).toBe(false);
    quote.forecasts[0].money.amount = "NaN";
    expect(isCompleteQuote(quote, fixture.input)).toBe(false);
  });
  it("accepts only the exact reviewed revision and idempotency key", async () => {
    const fixture = composerFixture();
    const service = createFakeModelPlaygroundLaunchService(fixture);
    const quote = await service.preview(
      { input: fixture.input, revision: "one" },
      new AbortController().signal,
    );
    const request = {
      version: 1 as const,
      revision: quote.revision,
      requestId: crypto.randomUUID(),
      previewId: quote.previewId,
      configHash: quote.configHash,
      quoteToken: quote.quoteToken,
      byokConsent: "non_guaranteed_estimate_v1" as const,
    };
    await expect(service.launch({ ...request, revision: "two" })).rejects.toThrow();
    await expect(service.launch({ ...request, configHash: "f".repeat(64) })).rejects.toThrow();
    expect(await service.launch(request)).toEqual(await service.launch(request));
    const other = await service.preview(
      { input: fixture.input, revision: "two" },
      new AbortController().signal,
    );
    await expect(
      service.launch({
        ...request,
        revision: "two",
        previewId: other.previewId,
        configHash: other.configHash,
        quoteToken: other.quoteToken,
      }),
    ).rejects.toThrow("Idempotency key");
  });
});
