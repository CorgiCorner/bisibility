import { errorFromUnknown } from "@/lib/api/error-mapper";
import { ProjectLimitExceededError } from "@/lib/api/resource-limits";
import { domainError } from "@/lib/api/surface";
import { CapacityLimitError } from "@/lib/capacity/errors";
import { errorToolResult, restFailureToolError } from "@/lib/mcp/result";
import { OperationAccessDeniedError } from "@/lib/operations/access-error";
import { expect, it } from "vitest";
import { capacityActionClient, withCapacityFailure } from "./action";

it("keeps unexpected client action failures as rejections", async () => {
  const error = new Error("Unexpected transfer failure.");
  const action = capacityActionClient(async () => {
    throw error;
  });
  await expect(action()).rejects.toBe(error);
});

it("retains the legacy operator-limit rejection for existing action callers", async () => {
  const error = new ProjectLimitExceededError(3);
  await expect(
    withCapacityFailure(async () => {
      throw error;
    }),
  ).rejects.toBe(error);
});

it("retains the same typed details across REST, MCP and Server Actions", async () => {
  const error = new CapacityLimitError({
    dimension: "projects",
    used: 5,
    limit: 5,
    requested: 1,
    scope: "account",
    suggestedPlan: "pro",
    upgradeUrl: "/pricing",
  });
  expect(() => domainError(error)).toThrow(error);
  const response = errorFromUnknown(
    error,
    new Headers(),
    new URL("https://example.com/api/v1/projects"),
  );
  expect(response.status).toBe(403);
  const body = await response.json();
  expect(body).toMatchObject({ code: "plan_limit_reached", details: error.toJSON() });
  expect(errorToolResult(restFailureToolError(body, 403))).toMatchObject({
    isError: true,
    structuredContent: { error: { code: "plan_limit_reached", payload: body } },
  });
  const action = await withCapacityFailure(async () => {
    throw error;
  });
  expect(JSON.parse(JSON.stringify(action))).toMatchObject({
    ok: false,
    capacityFailure: { code: "plan_limit_reached", details: error.toJSON() },
  });
});

it("reuses main's subscription_required response and never disguises it as a capacity limit", async () => {
  const error = new OperationAccessDeniedError({ subscriptionRequired: true });
  const response = errorFromUnknown(
    error,
    new Headers(),
    new URL("https://example.com/api/v1/projects"),
  );
  const body = await response.json();
  expect(body).toMatchObject({
    code: "subscription_required",
    subscriptionRequired: true,
    type: "https://bisibility.com/problems/subscription-required",
  });
  expect(restFailureToolError(body, 403)).toMatchObject({
    code: "subscription_required",
    status: 403,
  });
});
