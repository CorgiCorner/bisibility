import { canProjectAction } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManagedCompetitorControls } from "./ManagedCompetitorControls";

vi.mock("@/lib/actions/competitors", () => ({
  removeManagedCompetitor: vi.fn(),
  renameManagedCompetitor: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const competitor = {
  domain: "example.net",
  id: "competitor_1",
  initials: "EX",
  label: "Example",
};

describe("ManagedCompetitorControls", () => {
  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders competitor row actions for the %s role at the matrix thresholds",
    (role) => {
      const canUpdate = canProjectAction(role, "update", "competitor");
      const canDelete = canProjectAction(role, "delete", "competitor");
      render(
        <ManagedCompetitorControls
          canDelete={canDelete}
          canUpdate={canUpdate}
          competitor={competitor}
          projectId="project_1"
        />,
      );

      expect(Boolean(screen.queryByRole("button", { name: "Rename Example" }))).toBe(canUpdate);
      expect(Boolean(screen.queryByRole("button", { name: "Remove Example" }))).toBe(canDelete);
    },
  );
});
