import { expect, it } from "vitest";
import { ProviderUsagePersistenceError } from "./usage";
import { providerUsageFailureDetails, safeProviderUsageCause } from "./usage-failure-details";

it("keeps closed-set cause classification and source locations while removing secrets", () => {
  const cause = Object.assign(
    new Error("postgresql://user:password@database.example.com/app?api_key=fixture-secret"),
    {
      name: "PrismaClientKnownRequestError",
      code: "P2024",
      stack:
        "Error: api_key=fixture-secret\n at query (/app/lib/provider-usage/request-journal.ts:128:20)\n at privateToken (/private/fixture-secret.ts:2:3)",
    },
  );
  const error = new ProviderUsagePersistenceError({
    cause,
    phase: "settlement",
    attemptId: "79e01e67-ec10-4c12-a053-c5a906897b28",
  });
  expect(providerUsageFailureDetails(error)).toMatchObject({
    phase: "settlement",
    operationId: "79e01e67-ec10-4c12-a053-c5a906897b28",
    causes: expect.arrayContaining([
      {
        name: "PrismaClientKnownRequestError",
        code: "P2024",
        locations: ["lib/provider-usage/request-journal.ts:128:20"],
      },
    ]),
  });
  const output = JSON.stringify([
    providerUsageFailureDetails(error),
    safeProviderUsageCause(error).stack,
  ]);
  expect(output).not.toMatch(/fixture-secret|postgresql|password|api_key|privateToken/);
});

it("ignores arbitrary names, codes, unsafe operation IDs, getters and cause cycles", () => {
  const cause = Object.assign(new Error("private"), {
    name: "fixture-secret",
    code: "fixture-secret",
  });
  Object.defineProperty(cause, "meta", {
    get() {
      throw new Error("getter must not run");
    },
  });
  cause.cause = cause;
  const error = new ProviderUsagePersistenceError({ cause, attemptId: "api_key=fixture-secret" });
  const details = providerUsageFailureDetails(error);
  expect(details).not.toHaveProperty("operationId");
  expect(details.causes).toContainEqual({ name: "unknown", code: "unknown", locations: [] });
  expect(JSON.stringify(details)).not.toContain("fixture-secret");
});
