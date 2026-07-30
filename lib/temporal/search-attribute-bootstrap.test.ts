import { describe, expect, it, vi } from "vitest";
import {
  ensureRankCheckSearchAttributes,
  shouldProvisionRankCheckSearchAttributes,
} from "./search-attribute-bootstrap";

function connection(customAttributes: Record<string, number> = {}) {
  const operatorService = {
    addSearchAttributes: vi.fn().mockResolvedValue({}),
    listSearchAttributes: vi.fn().mockResolvedValue({ customAttributes }),
  };
  return {
    connection: {
      operatorService,
      withDeadline: vi.fn((_deadline, operation) => operation()),
    } as never,
    operatorService,
  };
}

describe("rank-check search attribute bootstrap", () => {
  it.each(["localhost:7233", "127.0.0.1:7233", "[::1]:7233", "temporal:7233"])(
    "enables provisioning for supported local address %s",
    (address) => {
      expect(shouldProvisionRankCheckSearchAttributes(address)).toBe(true);
    },
  );

  it("skips external services", () => {
    expect(shouldProvisionRankCheckSearchAttributes("temporal.example.com:7233")).toBe(false);
  });

  it("creates only missing Keyword attributes", async () => {
    const state = connection({ keywordId: 2 });

    await expect(
      ensureRankCheckSearchAttributes(state.connection, {
        address: "localhost:7233",
        namespace: "default",
      }),
    ).resolves.toEqual({ attributes: ["projectId", "provider"], status: "created" });
    expect(state.operatorService.addSearchAttributes).toHaveBeenCalledWith({
      namespace: "default",
      searchAttributes: { projectId: 2, provider: 2 },
    });
  });

  it("is idempotent when all attributes already exist", async () => {
    const state = connection({ keywordId: 2, projectId: 2, provider: 2 });

    await expect(
      ensureRankCheckSearchAttributes(state.connection, {
        address: "temporal:7233",
        namespace: "default",
      }),
    ).resolves.toEqual({ attributes: [], status: "exists" });
    expect(state.operatorService.addSearchAttributes).not.toHaveBeenCalled();
  });

  it("treats a concurrent successful provisioner as an idempotent result", async () => {
    const state = connection();
    state.operatorService.addSearchAttributes.mockRejectedValueOnce(new Error("already exists"));
    state.operatorService.listSearchAttributes
      .mockResolvedValueOnce({ customAttributes: {} })
      .mockResolvedValueOnce({
        customAttributes: { keywordId: 2, projectId: 2, provider: 2 },
      });

    await expect(
      ensureRankCheckSearchAttributes(state.connection, {
        address: "localhost:7233",
        namespace: "default",
      }),
    ).resolves.toEqual({ attributes: [], status: "exists" });
  });

  it("fails before schedule startup when an existing attribute has the wrong type", async () => {
    const state = connection({ keywordId: 1 });

    await expect(
      ensureRankCheckSearchAttributes(state.connection, {
        address: "localhost:7233",
        namespace: "default",
      }),
    ).rejects.toThrow("Temporal search attribute keywordId must have type Keyword.");
    expect(state.operatorService.addSearchAttributes).not.toHaveBeenCalled();
  });
});
