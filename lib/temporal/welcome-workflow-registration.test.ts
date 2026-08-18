import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: vi.fn().mockReturnValue({}),
  sleep: vi.fn(),
}));

vi.mock("./client", () => ({ TEMPORAL_TASK_QUEUE: "test-queue" }));
vi.mock("./scheduler-client", () => ({ getSchedulerTemporalClient: vi.fn() }));

import { WELCOME_FOLLOWUP_WORKFLOW_TYPE } from "./welcome-email-client";
import { welcomeFollowupWorkflow } from "./welcome-email-workflow";

describe("welcome follow-up workflow registration", () => {
  it("binds the workflow type constant to the exported function name", () => {
    expect(welcomeFollowupWorkflow.name).toBe(WELCOME_FOLLOWUP_WORKFLOW_TYPE);
  });

  it("re-exports the workflow from the Temporal sandbox bundle", () => {
    const source = readFileSync(resolve(import.meta.dirname, "workflows.ts"), "utf8");
    expect(source).toMatch(
      /export\s*\{\s*welcomeFollowupWorkflow\s*\}\s*from\s*"\.\/welcome-email-workflow"/,
    );
  });
});
