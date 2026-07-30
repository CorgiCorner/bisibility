import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppFooter } from "./AppFooter";

describe("AppFooter", () => {
  it("prioritizes schema drift with a red status", () => {
    render(<AppFooter schemaStatus="drift" workerStatus="ok" />);

    expect(screen.getByRole("link", { name: "Instance admin · Schema drift" })).toHaveAttribute(
      "href",
      "/app/admin",
    );
    expect(document.querySelector('[style*="var(--red)"]')).toBeInTheDocument();
  });

  it("shows a stale worker as down with a yellow status", () => {
    render(<AppFooter schemaStatus="ok" workerStatus="stale" />);

    expect(screen.getByRole("link", { name: "Instance admin · Worker down" })).toHaveAttribute(
      "href",
      "/app/admin",
    );
    expect(document.querySelector('[style*="var(--yellow)"]')).toBeInTheDocument();
  });

  it("shows unknown liveness as calm manual mode", () => {
    const { container } = render(<AppFooter schemaStatus="unknown" workerStatus="unknown" />);

    expect(screen.getByRole("link", { name: "Instance admin · Manual mode" })).toHaveAttribute(
      "href",
      "/app/admin",
    );
    expect(container.querySelector('[role="alert"]')).not.toBeInTheDocument();
    expect(container.querySelector('[style*="var(--yellow)"]')).not.toBeInTheDocument();
    expect(container.querySelector('[style*="var(--red)"]')).not.toBeInTheDocument();
    expect(container.querySelector('[style*="var(--fg-faint)"]')).toBeInTheDocument();
  });

  it("shows a healthy worker with a green status", () => {
    render(<AppFooter schemaStatus="ok" workerStatus="ok" />);

    expect(screen.getByRole("link", { name: "Instance admin" })).toHaveAttribute(
      "href",
      "/app/admin",
    );
    expect(document.querySelector('[style*="var(--green)"]')).toBeInTheDocument();
  });
});
