import { routerMock } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { KeywordsDeviceScope } from "./KeywordsScopeControls";

describe("KeywordsDeviceScope", () => {
  beforeEach(() => routerMock.push.mockClear());

  it("gives inactive device options a visible hover state", () => {
    render(
      <KeywordsDeviceScope
        basePath="/app/prj_1/rank-tracker"
        lens={{ device: "all", locationId: null }}
      />,
    );

    expect(
      screen.getByRole("radio", { name: "All device scope" }).nextElementSibling,
    ).not.toHaveClass("hover:bg-bg-elev");
    expect(
      screen.getByRole("radio", { name: "Desktop device scope" }).nextElementSibling,
    ).toHaveClass("hover:bg-nav-active");
    expect(
      screen.getByRole("radio", { name: "Mobile device scope" }).nextElementSibling,
    ).toHaveClass("hover:bg-nav-active");
  });

  it("uses the quiet select-sized toolbar treatment", () => {
    render(
      <KeywordsDeviceScope
        basePath="/app/prj_1/rank-tracker"
        lens={{ device: "all", locationId: null }}
      />,
    );

    const selected = screen.getByRole("radio", { name: "All device scope" });
    expect(selected.parentElement?.parentElement).toHaveClass(
      "inline-flex",
      "min-h-[34px]",
      "bg-transparent",
      "text-[12.5px]",
    );
    expect(selected.parentElement).toHaveClass("flex-none");
    expect(selected.nextElementSibling).toHaveClass("bg-nav-active", "border-border-strong");
    expect(selected.nextElementSibling?.className).not.toContain("shadow-");
    expect(selected.nextElementSibling).not.toHaveClass("bg-accent");
  });
});
