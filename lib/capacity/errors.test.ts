import { KeywordLimitExceededError, ProjectLimitExceededError } from "@/lib/api/resource-limits";
import { expect, it } from "vitest";
import { CapacityLimitError } from "./errors";

it("serializes stable capacity details without private hints by default", () => {
  const error = new CapacityLimitError({
    dimension: "projects",
    limit: 2,
    used: 2,
    requested: 1,
    scope: "account",
  });
  expect(JSON.parse(JSON.stringify(error))).toEqual({
    code: "plan_limit_reached",
    dimension: "projects",
    limit: 2,
    used: 2,
    requested: 1,
    scope: "account",
  });
});
it("retains optional reset and upgrade hints", () => {
  const error = new CapacityLimitError({
    dimension: "weeklyRequests",
    limit: 2,
    used: 2,
    requested: 1,
    scope: "account",
    resetsAt: "2026-11-09T00:00:00.000Z",
    suggestedPlan: "larger",
    upgradeUrl: "https://example.com/upgrade",
  });
  expect(error.toJSON()).toMatchObject({
    suggestedPlan: "larger",
    resetsAt: "2026-11-09T00:00:00.000Z",
  });
});
it("keeps legacy exception types, names and messages", () => {
  const keyword = new KeywordLimitExceededError(1);
  const project = new ProjectLimitExceededError(2);
  expect(keyword).toBeInstanceOf(CapacityLimitError);
  expect(project).toBeInstanceOf(CapacityLimitError);
  expect(keyword.name).toBe("KeywordLimitExceededError");
  expect(keyword.message).toBe(
    "This project is limited to 1 keyword. Delete keywords before adding more.",
  );
  expect(project.message).toBe(
    "This account is limited to 2 projects. Delete a project before creating another.",
  );
});
