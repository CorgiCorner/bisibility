import { appRootPath } from "@/lib/routing/app-path";
import { setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/AdminRefresh", () => ({
  AdminRefresh: () => <a href="/app/admin">Refresh</a>,
}));

import { AdminShell } from "./AdminShell";

describe("AdminShell", () => {
  beforeEach(() => {
    setNavigationState({ pathname: "/app/admin" });
  });

  it("renders dedicated sticky chrome and a constrained content column", () => {
    const { container } = render(
      <AdminShell>
        <p>Admin content</p>
      </AdminShell>,
    );

    expect(screen.getByRole("banner")).toHaveClass("sticky", "top-0");
    expect(container.querySelector("main")).toHaveClass("max-w-[1180px]");
    expect(screen.getByRole("link", { name: "Refresh" })).toHaveAttribute("href", "/app/admin");
    expect(screen.getByRole("link", { name: /Back to app/ })).toHaveAttribute(
      "href",
      appRootPath(),
    );
    expect(screen.getByText("Admin content")).toBeInTheDocument();
  });

  it("does not link the active Operations tab at the admin root", () => {
    render(<AdminShell>Content</AdminShell>);

    expect(screen.queryByRole("link", { name: "Operations" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Administration" })).toHaveAttribute(
      "href",
      "/app/admin/administration",
    );
    expect(screen.getByRole("link", { name: "Audit" })).toHaveAttribute("href", "/app/admin/audit");
    expect(screen.getByText("Operations")).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["/app/admin/administration", "Administration"],
    ["/app/admin/audit", "Audit"],
  ])("marks %s active", (pathname, label) => {
    setNavigationState({ pathname });
    render(<AdminShell>Content</AdminShell>);

    expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    expect(screen.getByText(label)).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Operations" })).toHaveAttribute("href", "/app/admin");
    expect(screen.getByRole("link", { name: "Operations" })).not.toHaveAttribute("aria-current");
  });
});
