import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import AppErrorBoundary from "@/app/app/error";
import { setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/error-reporting", () => ({ reportAppError: vi.fn() }));

const productionRoots = ["app", "components", "lib"] as const;

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    if (!/\.(?:ts|tsx)$/.test(entry.name) || /\.(?:test|stories)\.(?:ts|tsx)$/.test(entry.name)) {
      return [];
    }
    return [path];
  });
}

describe("app error typography", () => {
  it("renders the generic error label and diagnostic header in sans", () => {
    setNavigationState({ pathname: "/app/example" });
    render(<AppErrorBoundary error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.getByText("View error")).toHaveClass("font-sans");
    expect(screen.getByText("View error")).not.toHaveClass("font-mono");

    const viewPath = screen.getByText("/app/example");
    expect(viewPath.parentElement).toHaveClass("font-sans");
    expect(viewPath.parentElement).not.toHaveClass("font-mono");
  });

  it("has no generic MonoText component, export, or production consumer", () => {
    const matches = productionRoots.flatMap((root) =>
      productionTypeScriptFiles(root).flatMap((path) =>
        readFileSync(path, "utf8").includes("MonoText") ? [relative(process.cwd(), path)] : [],
      ),
    );

    expect(existsSync("components/ui/MonoText.tsx")).toBe(false);
    expect(existsSync("components/ui/MonoText.test.tsx")).toBe(false);
    expect(existsSync("components/ui/MonoText.stories.tsx")).toBe(false);
    expect(matches).toEqual([]);
  });
});
