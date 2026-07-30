import { canProjectAction } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TagsSegments } from "./TagsSegments";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

const tags = [{ color: "var(--yellow)", count: 2, label: "docs" }];

describe("TagsSegments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders tag counts", () => {
    render(<TagsSegments tags={tags} />);

    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("2 keywords")).toBeInTheDocument();
  });

  it("renames tags through the provided action", async () => {
    const renameTag = vi.fn().mockResolvedValue({
      ok: true,
      value: { merged: false, renamed: 2 },
    });
    const deleteTag = vi.fn().mockResolvedValue({ ok: true, value: { deleted: 2 } });
    render(
      <TagsSegments deleteTag={deleteTag} projectId="prj_1" renameTag={renameTag} tags={tags} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Rename docs" }));
    fireEvent.change(screen.getByLabelText("New name for docs"), {
      target: { value: "guides" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save docs tag name" }));

    await waitFor(() =>
      expect(renameTag).toHaveBeenCalledWith({
        fromName: "docs",
        projectId: "prj_1",
        toName: "guides",
      }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("adds tags through the provided action", async () => {
    const createTag = vi.fn().mockResolvedValue({ ok: true, value: { created: true } });
    const renameTag = vi.fn().mockResolvedValue({
      ok: true,
      value: { merged: false, renamed: 2 },
    });
    const deleteTag = vi.fn().mockResolvedValue({ ok: true, value: { deleted: 2 } });
    const addProps = { createTag };
    render(
      <TagsSegments
        {...addProps}
        deleteTag={deleteTag}
        projectId="prj_1"
        renameTag={renameTag}
        tags={tags}
      />,
    );

    fireEvent.change(screen.getByLabelText("New tag name"), {
      target: { value: "Integration" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add tag" }));

    await waitFor(() =>
      expect(createTag).toHaveBeenCalledWith({ name: "Integration", projectId: "prj_1" }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("deletes tags after confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const renameTag = vi.fn().mockResolvedValue({
      ok: true,
      value: { merged: false, renamed: 2 },
    });
    const deleteTag = vi.fn().mockResolvedValue({ ok: true, value: { deleted: 2 } });
    render(
      <TagsSegments deleteTag={deleteTag} projectId="prj_1" renameTag={renameTag} tags={tags} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete docs" }));

    await waitFor(() =>
      expect(deleteTag).toHaveBeenCalledWith({ name: "docs", projectId: "prj_1" }),
    );
    expect(confirm).toHaveBeenCalledWith("Delete docs from 2 keywords?");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders tag actions for the %s role at the matrix thresholds",
    (role) => {
      const canCreate = canProjectAction(role, "create", "keyword");
      const canUpdate = canProjectAction(role, "update", "keyword");
      const canDelete = canProjectAction(role, "delete", "keyword");
      render(
        <TagsSegments
          createTag={canCreate ? vi.fn() : undefined}
          deleteTag={canDelete ? vi.fn() : undefined}
          projectId="prj_1"
          renameTag={canUpdate ? vi.fn() : undefined}
          tags={tags}
        />,
      );

      expect(Boolean(screen.queryByLabelText("New tag name"))).toBe(canCreate);
      expect(Boolean(screen.queryByRole("button", { name: "Rename docs" }))).toBe(canUpdate);
      expect(Boolean(screen.queryByRole("button", { name: "Delete docs" }))).toBe(canDelete);
    },
  );

  it("shows migration guidance instead of tag write controls while read-only", () => {
    render(
      <TagsSegments
        createTag={vi.fn()}
        deleteTag={vi.fn()}
        projectId="prj_1"
        readOnly
        renameTag={vi.fn()}
        tags={tags}
      />,
    );

    expect(screen.getByText(/Read-only during migration/)).toBeVisible();
    expect(screen.queryByLabelText("New tag name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename docs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete docs" })).not.toBeInTheDocument();
  });
});
