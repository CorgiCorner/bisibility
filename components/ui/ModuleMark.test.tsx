import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { BellIcon as Bell, type Icon, type IconProps } from "@phosphor-icons/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModuleMark } from "./ModuleMark";

const TestIcon = (({ size, weight, ...props }: IconProps) => (
  <svg data-weight={weight} height={size} width={size} {...props} />
)) as Icon;

describe("ModuleMark", () => {
  it("stays server-compatible so server surfaces can render icon components locally", () => {
    const source = readFileSync(join(process.cwd(), "components/ui/ModuleMark.tsx"), "utf8");

    expect(source).not.toMatch(/^\s*["']use client["'];/);
  });

  it("keeps the decorative two-layer halo available", () => {
    const { container } = render(<ModuleMark icon={Bell} variant="halo" />);

    const outer = container.firstElementChild;
    expect(outer).toHaveAttribute("aria-hidden", "true");
    expect(outer).toHaveAttribute("data-module-mark", "halo");
    expect(outer).toHaveClass(
      "h-[54px]",
      "w-[54px]",
      "rounded-[13px]",
      "[background:color-mix(in_srgb,var(--accent-soft)_52%,var(--bg-elev))]",
    );
    expect(outer?.firstElementChild).toHaveClass(
      "h-11",
      "w-11",
      "rounded-control",
      "bg-accent-soft",
      "text-accent-solid",
      "[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--accent-solid)_12%,transparent),inset_0_1px_2px_-0.5px_var(--module-mark-top),inset_0_-1px_2.5px_-0.5px_var(--module-mark-bottom)]",
    );
    expect(outer?.querySelector("svg")).toHaveAttribute("width", "25");
  });

  it("supports compact sizing and owns the outlined glyph weight", () => {
    const { container } = render(<ModuleMark compact icon={TestIcon} variant="soft" />);

    const mark = container.firstElementChild;
    expect(mark).toHaveClass("h-10", "w-10", "rounded-control");
    expect(mark?.querySelector("svg")).toHaveAttribute("width", "20");
    expect(mark?.querySelector("svg")).toHaveAttribute("data-weight", "regular");
  });

  it("exposes an accessible label and optional halo border", () => {
    const { container } = render(
      <ModuleMark bordered icon={Bell} label="Alerts module" variant="halo" />,
    );

    expect(screen.getByRole("img", { name: "Alerts module" })).toHaveClass("border-accent/30");
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

function productionComponentFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionComponentFiles(path);
    if (!entry.name.endsWith(".tsx") || /\.(?:stories|test)\.tsx$/.test(entry.name)) return [];
    return [path];
  });
}

describe("ModuleMark production usage", () => {
  it("uses bordered soft marks on every production component surface", () => {
    const roots = [join(process.cwd(), "app"), join(process.cwd(), "components")];
    const violations = roots.flatMap((root) =>
      productionComponentFiles(root).flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return [...source.matchAll(/<ModuleMark\b[^>]*\/>/gs)].flatMap(([usage]) => {
          if (/\bvariant=["']halo["']/.test(usage))
            return [`${relative(process.cwd(), file)} uses halo`];
          if (!/\bbordered(?:\s|=|\/>)/.test(usage)) {
            return [`${relative(process.cwd(), file)} is not bordered`];
          }
          return [];
        });
      }),
    );

    expect(violations).toEqual([]);
  });
});
