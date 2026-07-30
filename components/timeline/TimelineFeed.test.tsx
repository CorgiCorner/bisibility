import { canProjectAction } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import type { TimelineSignalRow } from "@/lib/queries/timeline";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineFeed } from "./TimelineFeed";

vi.mock("@/components/timeline/AddNoteForm", () => ({
  AddNoteForm: ({ canCreate }: { canCreate: boolean }) =>
    canCreate ? <button type="button">Add note</button> : null,
}));
vi.mock("@/components/timeline/RemoveNoteAction", () => ({
  RemoveNoteAction: ({ signalId }: { signalId: string }) => (
    <button aria-label={`Delete ${signalId}`} type="button" />
  ),
}));

const manualNote: TimelineSignalRow = {
  createdAt: new Date("2026-07-15T10:30:00.000Z"),
  createdBy: { email: "member@example.test", name: "Member" },
  createdById: "user_1",
  happenedAt: new Date("2026-07-15T10:30:00.000Z"),
  id: "signal_1",
  keyword: null,
  keywordId: null,
  payload: { note: "Launch annotation" },
  projectId: "project_1",
  publicId: "sig_1",
  severity: "info",
  source: "manual",
  type: "note",
  url: null,
};

describe("TimelineFeed empty state", () => {
  it("identifies an out-of-range page and links back to page one", () => {
    render(
      <TimelineFeed
        canCreate
        canDelete
        projectId="prj_1"
        projectRef="prj_1"
        view={{
          filter: "all",
          hasNextPage: false,
          hasPreviousPage: true,
          isFiltered: false,
          now: new Date("2026-07-15T12:00:00.000Z"),
          page: 999,
          rows: [],
          search: "",
        }}
      />,
    );

    expect(screen.getByText("No timeline entries on this page")).toBeInTheDocument();
    expect(screen.queryByText("No timeline entries yet")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to page 1" })).toHaveAttribute(
      "href",
      "/app/prj_1/timeline",
    );
  });

  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders timeline mutations for the %s role at the matrix thresholds",
    (role) => {
      const canCreate = canProjectAction(role, "create", "signal");
      const canDelete = canProjectAction(role, "delete", "signal");
      render(
        <TimelineFeed
          canCreate={canCreate}
          canDelete={canDelete}
          projectId="prj_1"
          projectRef="prj_1"
          view={{
            filter: "all",
            hasNextPage: false,
            hasPreviousPage: false,
            isFiltered: false,
            now: new Date("2026-07-15T12:00:00.000Z"),
            page: 1,
            rows: [manualNote],
            search: "",
          }}
        />,
      );

      expect(Boolean(screen.queryByRole("button", { name: "Add note" }))).toBe(canCreate);
      expect(Boolean(screen.queryByRole("button", { name: "Delete sig_1" }))).toBe(canDelete);
    },
  );
});
