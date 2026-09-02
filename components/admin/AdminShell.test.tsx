import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
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

const ownedRoots = [
  "components/integrations",
  "components/admin",
  "components/audit",
  "app/app/admin",
  "app/app/(workspace)/[project]/integrations",
  "app/app/(workspace)/[project]/settings/(sections)/data-sources",
] as const;

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.name.endsWith(".tsx") || /\.(?:test|stories)\.tsx$/.test(entry.name)) return [];
    return [path];
  });
}

function forbiddenMonoUsages(path: string) {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.includes("font-mono"))
    .map(
      ({ line, lineNumber }) => `${relative(process.cwd(), path)}:${lineNumber}: ${line.trim()}`,
    );
}

describe("owned typography semantics", () => {
  it("uses Mono only for the diagnostics digest and raw stack trace", () => {
    const violations = ownedRoots.flatMap(sourceFiles).flatMap(forbiddenMonoUsages);
    const diagnosticsPath = "app/app/AppErrorDiagnostics.tsx";
    const diagnostics = forbiddenMonoUsages(diagnosticsPath);
    const diagnosticsSource = readFileSync(diagnosticsPath, "utf8");

    expect([...violations, ...diagnostics]).toEqual([
      expect.stringMatching(/AppErrorDiagnostics\.tsx:\d+: details\.digest && "font-mono",/),
      expect.stringMatching(/AppErrorDiagnostics\.tsx:\d+: <pre className=.*font-mono/),
    ]);
    expect(diagnosticsSource).not.toContain("MonoText");
    expect(diagnosticsSource).toMatch(
      /<span\s+className=\{cn\([\s\S]*?details\.digest && "font-mono",[\s\S]*?\)\}\s*>\s*\{details\.digest \?\? "no reference"\}\s*<\/span>/u,
    );
  });
});
