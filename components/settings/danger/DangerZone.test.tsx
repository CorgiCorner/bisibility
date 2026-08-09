import { canReadProjectAudit } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DangerZone } from "./DangerZone";

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

describe("DangerZone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function deleteProject(
    deleteWorkspace: () => Promise<{
      hasRemainingWorkspace: boolean;
      id: string;
      nextProjectPublicId: string | null;
    }>,
  ) {
    render(
      <DangerZone
        canDeleteProject
        canManageMigration
        deleteWorkspace={deleteWorkspace}
        direction="to-cloud"
        domain="example.com"
        projectId="prj_1"
        showInstanceMigration={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    fireEvent.change(screen.getByLabelText(/type example\.com to confirm/i), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
  }

  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders populated-settings audit navigation for the %s role",
    (role) => {
      const canReadAudit = canReadProjectAudit(role);

      render(
        <DangerZone
          canDeleteProject={false}
          canManageMigration={false}
          canReadAudit={canReadAudit}
          direction="to-cloud"
          projectId="prj_1"
          showInstanceMigration={false}
        />,
      );

      expect(Boolean(screen.queryByRole("link", { name: /audit log/i }))).toBe(canReadAudit);
    },
  );

  it("shows the server delete error instead of a fabricated queue failure", async () => {
    const deleteWorkspace = vi.fn(async () => {
      throw new Error("Confirmation text does not match this project.");
    });
    render(
      <DangerZone
        canDeleteProject
        canManageMigration
        deleteWorkspace={deleteWorkspace}
        direction="to-cloud"
        domain="example.com"
        projectId="prj_1"
        showInstanceMigration={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    fireEvent.change(screen.getByLabelText(/type example\.com to confirm/i), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));

    await waitFor(() =>
      expect(screen.getByText("Confirmation text does not match this project.")).toBeVisible(),
    );
    expect(
      screen.queryByText(/resource_busy|rank-check queue|checks queued/i),
    ).not.toBeInTheDocument();
  });

  it("opens a remaining project after deletion", async () => {
    await deleteProject(async () => ({
      hasRemainingWorkspace: true,
      id: "prj_1",
      nextProjectPublicId: "prj_2",
    }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/app/prj_2/overview"));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("opens onboarding after deleting the last project", async () => {
    await deleteProject(async () => ({
      hasRemainingWorkspace: false,
      id: "prj_1",
      nextProjectPublicId: null,
    }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/onboarding"));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("describes the hosted migration destination without a product name", () => {
    render(
      <DangerZone
        canDeleteProject={false}
        canManageMigration
        direction="to-cloud"
        showInstanceMigration
      />,
    );

    expect(
      screen.getByText(
        /Move this project to another bisibility instance - hosted or self-hosted\./,
      ),
    ).toBeInTheDocument();
  });
});
