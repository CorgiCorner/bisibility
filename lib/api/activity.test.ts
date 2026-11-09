import { describe, expect, it, vi } from "vitest";
import { recordApiAction, recordApiSeen } from "./activity";
import type { ApiAuth } from "./auth";

const record = vi.hoisted(() => vi.fn());
vi.mock("@/lib/activity/record-extension", () => ({ recordUserActivity: record }));
const user = { kind: "personal_token", user: { id: "u", email: "u@example.invalid" } } as ApiAuth;
const write = {
  method: "POST",
  path: "/test",
  requiredScope: "write",
  projectAccess: "write",
  operationId: "change",
} as const;

describe("API activity", () => {
  it("excludes project keys and internal MCP calls", () => {
    record.mockClear();
    expect(recordApiSeen({ kind: "project_key" } as ApiAuth, false)).toBeNull();
    expect(recordApiSeen(user, true)).toBeNull();
    expect(record).not.toHaveBeenCalled();
  });
  it("distinguishes read and estimate requests from actions", () => {
    record.mockClear();
    const activity = recordApiSeen(user, false);
    recordApiAction(activity, "GET", write, "write");
    recordApiAction(activity, "POST", write, "read");
    expect(record).toHaveBeenCalledTimes(1);
    recordApiAction(activity, "POST", write, "write");
    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[1][0].kind).toBe("acted");
  });
});
