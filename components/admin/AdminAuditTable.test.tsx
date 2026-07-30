import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminAuditTable } from "./AdminAuditTable";

const entries = [
  {
    action: "instance_admin.account_viewed",
    actorEmail: "admin@example.com",
    createdAt: "2026-07-18T00:10:00.000Z",
    id: "audit_abcdefghijklmnopqrstuvwx",
    result: "ok" as const,
    targetId: "usr_abcdefghijklmnopqrstuvwx",
    targetType: "user",
  },
  {
    action: "instance_admin.account_deactivate_blocked",
    actorEmail: null,
    createdAt: "2026-07-18T00:05:00.000Z",
    id: "audit_bbcdefghijklmnopqrstuvwx",
    result: "blocked" as const,
    targetId: "usr_bbcdefghijklmnopqrstuvwx",
    targetType: "user",
  },
  {
    action: "instance_admin.ops_test.send",
    actorEmail: "operator@example.com",
    createdAt: "2026-07-18T00:00:00.000Z",
    id: "audit_cccdefghijklmnopqrstuvwx",
    result: "failed" as const,
    targetId: null,
    targetType: "instance_ops",
  },
] as const;

describe("AdminAuditTable", () => {
  it("renders URL filters and the prototype-aligned audit columns", () => {
    render(<AdminAuditTable entries={entries} filter="account" nextCursor={null} />);

    expect(screen.getByRole("heading", { name: "Admin activity" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "instance_admin.* entries. Visible to instance admins only; admins are not anonymous to each other.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("href", "/app/admin/audit");
    expect(screen.getByRole("link", { name: /Account/ })).toHaveAttribute(
      "href",
      "/app/admin/audit?filter=account",
    );
    expect(screen.getByRole("link", { name: /Account/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Ops" })).toHaveAttribute(
      "href",
      "/app/admin/audit?filter=ops",
    );
    expect(screen.getByRole("link", { name: "Setup" })).toHaveAttribute(
      "href",
      "/app/admin/audit?filter=setup",
    );

    const table = screen.getByRole("table", { name: "Instance administrator activity" });
    for (const heading of ["Time", "Actor", "Action", "Target", "Result"]) {
      expect(within(table).getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
  });

  it("renders actor identity, action, copyable targets, and every result state", () => {
    render(<AdminAuditTable entries={entries} filter="all" nextCursor={null} />);

    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("instance_admin.account_viewed")).toBeInTheDocument();
    expect(screen.getByText("user:usr_abcdefghijklmnopqrstuvwx")).toHaveAttribute(
      "title",
      "user:usr_abcdefghijklmnopqrstuvwx",
    );
    expect(
      screen.getByRole("button", {
        name: "Copy audit target user:usr_abcdefghijklmnopqrstuvwx",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("instance_ops:unavailable")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy audit target instance_ops:unavailable" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.getByText("ok")).toHaveClass("text-green");
    expect(screen.getByText("blocked")).toHaveClass("text-yellow");
    expect(screen.getByText("failed")).toHaveClass("text-red");
  });

  it("links to the next cursor while preserving the active filter", () => {
    render(
      <AdminAuditTable entries={entries} filter="ops" nextCursor="audit_3:2026-07-18T00:00Z" />,
    );

    expect(screen.getByRole("link", { name: "Older entries" })).toHaveAttribute(
      "href",
      "/app/admin/audit?filter=ops&cursor=audit_3%3A2026-07-18T00%3A00Z",
    );
  });

  it("renders one honest empty-state line without pagination", () => {
    const { container } = render(<AdminAuditTable entries={[]} filter="setup" nextCursor={null} />);

    expect(screen.getByText("No instance-admin audit entries match this filter.")).toHaveClass(
      "text-fg-muted",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Older entries" })).not.toBeInTheDocument();
    expect(container.querySelectorAll("p.text-fg-muted")).toHaveLength(2);
  });
});
