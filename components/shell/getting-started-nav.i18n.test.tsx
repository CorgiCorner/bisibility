import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { appPath } from "@/lib/routing/app-path";
import polishShellMessages from "@/messages/core/pl/shell.json";
import { setNavigationState } from "@/tests/next-navigation";
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { GettingStartedNavLink } from "./GettingStartedNavLink";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/ui/Tooltip", () => import("@/tests/tooltip-stub"));

const projectRef = "prj_abcdefghijklmnopqrstuvwx";

describe("the sidebar setup entry in a non-English locale", () => {
  it("reads its label and progress from the catalog, never an English constant", () => {
    setNavigationState({ pathname: appPath(projectRef, "dashboard") });
    renderWithFeatureMessages(
      <GettingStartedNavLink
        currentHref={appPath(projectRef, "dashboard")}
        doneCount={3}
        projectRef={projectRef}
        settledCount={3}
        totalCount={4}
      />,
      { locale: "pl", messages: polishShellMessages },
    );

    expect(screen.getByText("Pierwsze kroki")).toBeVisible();
    expect(screen.queryByText("Get set up")).not.toBeInTheDocument();
  });

  it("labels the collapsed entry with the translated progress sentence", () => {
    setNavigationState({ pathname: appPath(projectRef, "dashboard") });
    renderWithFeatureMessages(
      <GettingStartedNavLink
        collapsed
        currentHref={appPath(projectRef, "dashboard")}
        doneCount={3}
        projectRef={projectRef}
        settledCount={3}
        totalCount={4}
      />,
      { locale: "pl", messages: polishShellMessages },
    );

    expect(
      screen.getByRole("link", { name: "Pierwsze kroki, ukończono 3 z 4 kroków" }),
    ).toBeVisible();
  });
});
