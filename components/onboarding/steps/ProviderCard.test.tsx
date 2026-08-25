import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProviderCard, type ProviderCardState } from "./ProviderCard";
import { providerOptions } from "./StepConnectProvider.fields";

const provider = providerOptions[0];

function renderCard(state: ProviderCardState) {
  return render(
    <ProviderCard onSelect={() => undefined} provider={provider} selected state={state} />,
  );
}

function statusDot(label: string) {
  return screen.getByText(label).querySelector("span[aria-hidden]");
}

describe("onboarding ProviderCard", () => {
  it("selects with an accent outline and no fill", () => {
    const { rerender } = render(
      <ProviderCard onSelect={() => undefined} provider={provider} selected state="idle" />,
    );

    expect(screen.getByRole("radio").closest("section")).toHaveClass(
      "border-accent",
      "bg-transparent",
    );
    expect(screen.getByRole("radio").closest("section")).not.toHaveClass("bg-accent-soft");
    expect(screen.getByRole("radio").closest("section")).not.toHaveClass("ring-accent");

    rerender(
      <ProviderCard onSelect={() => undefined} provider={provider} selected={false} state="idle" />,
    );
    expect(screen.getByRole("radio").closest("section")).toHaveClass(
      "border-border-strong",
      "bg-transparent",
    );
    expect(screen.getByRole("radio").closest("section")).not.toHaveClass("border-accent");
  });
  it("uses a muted status dot for not connected", () => {
    renderCard("idle");
    expect(statusDot("Not connected")).toHaveStyle({ backgroundColor: "var(--fg-muted)" });
  });

  it("uses a yellow status dot for unsaved changes", () => {
    renderCard("dirty");
    expect(statusDot("Unsaved changes")).toHaveStyle({ backgroundColor: "var(--yellow)" });
  });

  it("uses a green status dot once connected", () => {
    renderCard("connected");
    expect(statusDot("Connected")).toHaveStyle({ backgroundColor: "var(--green)" });
  });
});
