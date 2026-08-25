import { describe, expect, it } from "vitest";
import { workspaceRoleLine } from "./workspace-role-line";

describe("workspaceRoleLine", () => {
  it("omits a trailing domain from the project name", () => {
    expect(workspaceRoleLine("owner", "Sample project - acme.dev", "acme.dev")).toBe(
      "Owner in Sample project",
    );
  });

  it("keeps names that are not the domain suffix", () => {
    expect(workspaceRoleLine("member", "Acme", "acme.dev")).toBe("Member in Acme");
  });
});
