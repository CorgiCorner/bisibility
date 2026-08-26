import { describe, expect, it, vi } from "vitest";
import { lockProjectForProviderMutation } from "./project-lock";

describe("provider mutation project lock", () => {
  it("locks the internal project row", async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: "project_1" }]) };
    await lockProjectForProviderMutation(tx as never, "project_1");
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });
});
