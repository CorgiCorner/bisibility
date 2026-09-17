import { describe, expect, it } from "vitest";
import { type WorkspaceRoleLineMessages, workspaceRoleLine } from "./workspace-role-line";

const englishMessages = {
  inProject: ({ project, role }) => `${role} in ${project}`,
  roles: { admin: "Admin", auditor: "Auditor", member: "Member", owner: "Owner", viewer: "Viewer" },
} satisfies WorkspaceRoleLineMessages;

describe("workspaceRoleLine", () => {
  it("omits a trailing domain from the project name", () => {
    expect(
      workspaceRoleLine("owner", "Sample project - example.com", "example.com", englishMessages),
    ).toBe("Owner in Sample project");
  });

  it("keeps names that are not the domain suffix", () => {
    expect(workspaceRoleLine("member", "Example", "example.org", englishMessages)).toBe(
      "Member in Example",
    );
  });

  it("uses the stable role key with a non-English whole-message translator", () => {
    const messages = {
      inProject: ({ project, role }) => `${role} w ${project}`,
      roles: {
        admin: "Administrator",
        auditor: "Audytor",
        member: "Członek",
        owner: "Właściciel",
        viewer: "Obserwator",
      },
    } satisfies WorkspaceRoleLineMessages;

    expect(workspaceRoleLine("auditor", "Projekt - example.org", "example.org", messages)).toBe(
      "Audytor w Projekt",
    );
  });
});
