import { routerMock } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { KeywordsDeviceScope, KeywordsScopeLocationSelect } from "./KeywordsScopeControls";

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
    ).toHaveClass("hover:bg-bg-sunken");
    expect(
      screen.getByRole("radio", { name: "Mobile device scope" }).nextElementSibling,
    ).toHaveClass("hover:bg-bg-sunken");
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
    expect(selected.nextElementSibling).toHaveClass("bg-nav-active", "border-border-control");
    expect(selected.nextElementSibling).toHaveClass("font-normal", "text-fg");
    expect(selected.nextElementSibling?.className).not.toContain("shadow-");
    expect(selected.nextElementSibling).not.toHaveClass("bg-accent");
  });
});

describe("KeywordsScopeLocationSelect", () => {
  it("uses a viewport-safe content width and keeps location metadata untruncated", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className="overflow-hidden">
        <KeywordsScopeLocationSelect
          basePath="/app/prj_1/rank-tracker"
          lens={{ device: "all", locationId: null }}
          locationOptions={[
            { count: 1, displayName: "United States", id: "loc_us", kind: "country" },
          ]}
        />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Location scope" }));

    const menu = screen.getByRole("menu", { name: "Location scope" });
    const paper = menu.closest<HTMLElement>(".MuiPaper-root");
    expect(paper).toHaveStyle({
      maxWidth: "calc(100vw - 32px)",
      minWidth: "min(280px, calc(100vw - 32px))",
      width: "max-content",
    });
    expect(container).not.toContainElement(paper);
    expect(document.body).toContainElement(paper);
    expect(screen.getByText("United States")).toHaveClass("whitespace-nowrap");
    expect(screen.getByText("1 keyword · country")).toHaveClass("whitespace-nowrap");
  });
});
