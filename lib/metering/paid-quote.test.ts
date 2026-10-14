import { expect, test } from "vitest";
import { input } from "./paid-attempt-test-fixture";

test("catalog admission accepts matching pricing proof and retains the business feature", async () => {
  const { preparePaidAttempt } = await import("./current-paid-quote");
  const request = input();
  const operation = "serp.google.organic.live.advanced";
  const options = { depth: "100", priority: "normal" };
  const priced = {
    ...request,
    reservation: { ...request.reservation, operation, options },
    context: {
      ...request.context,
      feature: "rank_check",
      requestPricing: {
        version: 1 as const,
        provider: request.reservation.provider,
        operation,
        options,
      },
    },
  };
  expect(preparePaidAttempt(priced)).toMatchObject({ operation, options });
  expect(
    preparePaidAttempt({
      ...priced,
      reservation: { ...priced.reservation, options: { priority: "normal", depth: "100" } },
    }),
  ).toMatchObject({ operation });
  expect(() =>
    preparePaidAttempt({ ...priced, context: { ...priced.context, feature: undefined } }),
  ).toThrow("pricing proof");
  for (const requestPricing of [
    { ...priced.context.requestPricing, provider: "different-provider" },
    { ...priced.context.requestPricing, operation: "different-operation" },
    { ...priced.context.requestPricing, options: { ...options, depth: "10" } },
  ]) {
    expect(() =>
      preparePaidAttempt({ ...priced, context: { ...priced.context, requestPricing } }),
    ).toThrow("pricing proof");
  }
});

test("platform quotes replace a stored manual zero with frozen host provider and customer prices", async () => {
  const { preparePaidAttempt } = await import("./current-paid-quote");
  const request = input();
  const quote = {
    estimate: [
      { unit: "cents", value: 20000n, scale: 4 },
      { unit: "requests", value: 1n, scale: 0 },
      { unit: "customer_cents", value: 30000n, scale: 4 },
    ],
    costOwner: "provider-account",
    creditAccountRef: "wallet",
    customerPriceVersion: "database-policy",
    platformPools: ["pool"],
    estimateSource: "measured" as const,
  };
  const prepared = preparePaidAttempt({
    ...request,
    reservation: {
      ...request.reservation,
      fundingSource: "platform",
      estimateSource: "manual",
      estimate: [{ unit: "cents", value: 0n, scale: 4 }],
    },
    platformQuote: quote,
  });
  // Provider price provenance cannot describe the independently priced customer charge.
  expect(prepared).not.toHaveProperty("estimateSource");
  expect(prepared.customerPriceVersion).toBe("database-policy");
  expect(prepared.estimate).toContainEqual({ unit: "budget_cents", value: 30000n, scale: 4 });
  expect(prepared.estimate).toContainEqual({ unit: "cents", value: 20000n, scale: 4 });
  expect(prepared.estimate).toContainEqual({ unit: "paid_attempts", value: 1n, scale: 0 });
});
test("billable calls without priced estimates or platform policy fail closed", async () => {
  const { preparePaidAttempt } = await import("./current-paid-quote");
  const request = input();
  expect(() =>
    preparePaidAttempt({
      ...request,
      reservation: { ...request.reservation, estimate: undefined },
    }),
  ).toThrow("quote");
  expect(() =>
    preparePaidAttempt({
      ...request,
      reservation: { ...request.reservation, fundingSource: "platform" },
    }),
  ).toThrow("quote");
  expect(() =>
    preparePaidAttempt({
      ...request,
      reservation: { ...request.reservation, estimateSource: "unknown" },
    }),
  ).toThrow("quote");
});
test("retained business context cannot disagree with the financial or credential identity", async () => {
  const { preparePaidAttempt } = await import("./current-paid-quote");
  const request = input();
  for (const context of [
    { ...request.context, projectId: "different-project" },
    { ...request.context, providerCredentialVersion: "rotated-version" },
    { ...request.context, secret: "not-content-free" },
  ])
    expect(() => preparePaidAttempt({ ...request, context })).toThrow();
});
test("receipt projection uses BYOK cost or acknowledged platform charge and preserves unknown", async () => {
  const { projectAdmissionMeasurements } = await import("./paid-measurements");
  const { nativeReceipt } = await import("./paid-attempt-test-fixture");
  const known = projectAdmissionMeasurements(input().reservation, nativeReceipt());
  expect(known.measurements).toContainEqual({
    unit: "budget_cents",
    certainty: "measured",
    quantity: { unit: "budget_cents", value: 20000n, scale: 4 },
  });
  const unknown = projectAdmissionMeasurements(input().reservation, nativeReceipt(true));
  expect(unknown.measurements).toContainEqual({
    unit: "budget_cents",
    certainty: "unknown",
    quantity: null,
  });
  const platform = projectAdmissionMeasurements(
    { ...input().reservation, fundingSource: "platform" },
    {
      ...nativeReceipt(),
      measurements: [
        {
          unit: "customer_cents",
          certainty: "measured",
          quantity: { unit: "customer_cents", value: 30000n, scale: 4 },
        },
      ],
    },
  );
  expect(platform.measurements).toContainEqual({
    unit: "budget_cents",
    certainty: "measured",
    quantity: { unit: "budget_cents", value: 30000n, scale: 4 },
  });
});

test("funding tags exclude the opposite funding budget on the same connection", async () => {
  const { preparePaidAttempt, platformAllocationTag } = await import("./current-paid-quote");
  const request = input();
  request.reservation.scope.tags = [
    platformAllocationTag(request.reservation.provider, request.context.connectionId),
  ];
  expect(preparePaidAttempt(request).scope.tags).not.toContain(request.reservation.scope.tags[0]);
});

test("resumed original work refuses a higher current BYOK or customer quote", async () => {
  const { preparePaidAttempt } = await import("./current-paid-quote");
  const request = input();
  request.context.recoveryMaxCostCents = "2";
  expect(preparePaidAttempt(request).estimate).toContainEqual({
    unit: "cents",
    value: 2n,
    scale: 0,
  });
  expect(() =>
    preparePaidAttempt({
      ...request,
      reservation: {
        ...request.reservation,
        estimate: [{ unit: "cents", value: 20001n, scale: 4 }],
      },
    }),
  ).toThrow();
  const platform = {
    ...request,
    reservation: { ...request.reservation, fundingSource: "platform" as const },
    platformQuote: {
      estimate: [
        { unit: "cents", value: 1n, scale: 0 },
        { unit: "customer_cents", value: 20001n, scale: 4 },
      ],
      costOwner: "provider-account",
      creditAccountRef: "wallet",
      customerPriceVersion: "frozen",
      estimateSource: "measured" as const,
      platformPools: ["pool"],
    },
  };
  expect(() => preparePaidAttempt(platform)).toThrow();
  expect(
    preparePaidAttempt({
      ...platform,
      context: { ...request.context, recoveryMaxCostCents: "2.0001" },
    }),
  ).toMatchObject({ fundingSource: "platform" });
});

test("resumed unit-priced searches enforce the valued budget rather than the provider zero", async () => {
  const { preparePaidAttempt } = await import("./current-paid-quote");
  const request = input();
  const priced = {
    ...request,
    reservation: {
      ...request.reservation,
      provider: "serpapi",
      operation: "search",
      estimate: [
        { unit: "cents", value: 0n, scale: 4 },
        { unit: "units", value: 1n, scale: 0 },
      ],
    },
    context: {
      ...request.context,
      feature: "rank_check",
      recoveryMaxCostCents: "2",
      requestPricing: {
        version: 1 as const,
        provider: "serpapi",
        operation: "search",
        options: {},
        budgetValuation: {
          source: "manual" as const,
          perUnitCents: "2.0001",
          unitsPerCheck: 1 as const,
        },
      },
    },
  };
  expect(() => preparePaidAttempt(priced)).toThrow();
  expect(
    preparePaidAttempt({
      ...priced,
      context: { ...priced.context, recoveryMaxCostCents: "2.0001" },
    }),
  ).toMatchObject({ fundingSource: "byok" });
});
