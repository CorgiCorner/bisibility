import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppFooter } from "./AppFooter";

vi.mock("@/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui")>();
  return {
    ...actual,
    ThemeSegments: ({ size }: { size?: "sm" | "md" }) => (
      <span data-size={size} data-testid="theme-segments" />
    ),
  };
});

function expectAdminLink(name: string) {
  const link = screen.getByRole("link", { name });
  expect(link).toHaveAttribute("href", "/app/admin");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noreferrer noopener");
  expect(link).toHaveClass("[&_svg]:size-[1em]");
  const icon = link.querySelector("svg");
  expect(icon).not.toBeNull();
  expect(icon).toHaveAttribute("aria-hidden", "true");
  return link;
}

describe("AppFooter", () => {
  it("prioritizes schema drift with a red status", () => {
    render(<AppFooter schemaStatus="drift" showInstanceAdmin workerStatus="ok" />);

    expectAdminLink("Instance admin · Schema drift");
    expect(document.querySelector('[style*="var(--red)"]')).toBeInTheDocument();
  });

  it("shows a stale worker as down with a yellow status", () => {
    render(<AppFooter schemaStatus="ok" showInstanceAdmin workerStatus="stale" />);

    expectAdminLink("Instance admin · Worker down");
    expect(document.querySelector('[style*="var(--yellow)"]')).toBeInTheDocument();
  });

  it("shows unknown liveness as calm manual mode", () => {
    const { container } = render(
      <AppFooter schemaStatus="unknown" showInstanceAdmin workerStatus="unknown" />,
    );

    expectAdminLink("Instance admin · Manual mode");
    expect(container.querySelector('[role="alert"]')).not.toBeInTheDocument();
    expect(container.querySelector('[style*="var(--yellow)"]')).not.toBeInTheDocument();
    expect(container.querySelector('[style*="var(--red)"]')).not.toBeInTheDocument();
    expect(container.querySelector('[style*="var(--fg-muted)"]')).toBeInTheDocument();
  });

  it("shows a healthy worker with a green status", () => {
    render(<AppFooter schemaStatus="ok" showInstanceAdmin workerStatus="ok" />);

    expectAdminLink("Instance admin");
    expect(document.querySelector('[style*="var(--green)"]')).toBeInTheDocument();
  });

  it("keeps the theme switch visible without exposing instance admin details", () => {
    render(<AppFooter showInstanceAdmin={false} />);

    expect(screen.getByTestId("theme-segments")).toHaveAttribute("data-size", "sm");
    expect(screen.queryByRole("link", { name: /Instance admin/ })).not.toBeInTheDocument();
    expect(document.querySelector('[style*="var(--green)"]')).not.toBeInTheDocument();
  });

  it("mounts the theme switch beside the instance status for instance admins", () => {
    render(<AppFooter schemaStatus="ok" showInstanceAdmin workerStatus="ok" />);

    expect(screen.getByTestId("theme-segments")).toHaveAttribute("data-size", "sm");
    expectAdminLink("Instance admin");
  });
});
