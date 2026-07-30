import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyPresenceBudgetExhausted } from "./ops";

const mocks = vi.hoisted(() => ({ getOpsConfig: vi.fn(), notifyOps: vi.fn() }));

vi.mock("@/lib/ops/config", () => ({ getOpsConfig: mocks.getOpsConfig }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.notifyOps }));

describe("presence inspection ops events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOpsConfig.mockReturnValue({ includeNames: false });
    mocks.notifyOps.mockResolvedValue(undefined);
  });

  it("uses only the stable property identifier when names are disabled", async () => {
    await notifyPresenceBudgetExhausted({
      deferred: 4,
      projectIds: ["project_1", "project_2"],
      property: "sc-domain:example.com",
      propertyAccountKey: "gsc:0123456789abcdef:fedcba9876543210",
    });

    expect(mocks.notifyOps).toHaveBeenCalledWith({
      fields: {
        "Affected project count": 2,
        "Affected projects": "project_1, project_2",
        "Deferred URLs": 4,
        "Property identifier": "gsc:0123456789abcdef:fedcba9876543210",
      },
      kind: "presence_inspection_budget",
      severity: "warning",
      title: "URL inspection budget exhausted",
    });
  });

  it("includes the property name when names are enabled", async () => {
    mocks.getOpsConfig.mockReturnValue({ includeNames: true });

    await notifyPresenceBudgetExhausted({
      deferred: 4,
      projectIds: ["project_1"],
      property: "sc-domain:example.com",
      propertyAccountKey: "gsc:0123456789abcdef:fedcba9876543210",
    });

    expect(mocks.notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.objectContaining({ Property: "sc-domain:example.com" }),
        title: "URL inspection budget exhausted for sc-domain:example.com",
      }),
    );
  });
});
