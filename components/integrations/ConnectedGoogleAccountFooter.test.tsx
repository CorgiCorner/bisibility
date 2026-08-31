import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectedGoogleAccountFooter } from "./ConnectedGoogleAccountFooter";

describe("ConnectedGoogleAccountFooter", () => {
  it("keeps the compact account and actions in one responsive row", () => {
    render(
      <ConnectedGoogleAccountFooter
        accountEmail="owner@example.com"
        onDisconnect={vi.fn()}
        switchAccountHref="/switch"
      />,
    );

    const email = screen.getByText("owner@example.com");
    const footer = email.closest('[data-slot="connected-google-account-footer"]');
    const actions = screen.getByRole("link", { name: "Reconnect account" }).parentElement;

    expect(email.parentElement?.querySelector("svg")).toBeInTheDocument();
    expect(footer).not.toHaveTextContent("Connected as");
    expect(screen.getByRole("link", { name: "Reconnect account" })).toBeInTheDocument();
    expect(footer).not.toHaveTextContent("Switch account");
    expect(footer).toHaveClass(
      "flex",
      "items-center",
      "justify-between",
      "border-t",
      "border-border-soft",
      "pt-3",
    );
    expect(email.parentElement).toHaveClass("min-w-0");
    expect(email).toHaveClass("min-w-0", "truncate");
    expect(actions).toHaveClass("ml-auto", "shrink-0");
    expect(actions).not.toHaveClass("flex-wrap");
  });

  it("preserves the standalone outer layout contract", () => {
    render(
      <ConnectedGoogleAccountFooter
        accountEmail="owner@example.com"
        layout="standalone"
        onDisconnect={vi.fn()}
        switchAccountHref="/switch"
      />,
    );

    const email = screen.getByText("owner@example.com");
    const footer = email.closest('[data-slot="connected-google-account-footer"]');

    expect(email.parentElement?.querySelector("svg")).toBeInTheDocument();
    expect(footer).not.toHaveTextContent("Connected as");
    expect(screen.getByRole("link", { name: "Reconnect account" })).toBeInTheDocument();
    expect(footer).not.toHaveTextContent("Switch account");
    expect(footer).toHaveClass(
      "flex",
      "flex-wrap",
      "items-center",
      "justify-between",
      "gap-x-5",
      "gap-y-2",
      "border-t",
      "border-border",
      "bg-bg-sunken",
      "px-5",
      "py-3.5",
      "sm:px-7",
    );
  });
});
