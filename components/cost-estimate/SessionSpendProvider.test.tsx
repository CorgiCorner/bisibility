import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionSpendProvider, useSessionSpend } from "./SessionSpendProvider";

function SpendProbe() {
  const { addSpend, sessionCents } = useSessionSpend();
  return (
    <>
      <span>{sessionCents}</span>
      <button onClick={() => addSpend(25)} type="button">
        Add spend
      </button>
    </>
  );
}

describe("SessionSpendProvider", () => {
  it("accumulates positive spend for the current browser session", () => {
    render(
      <SessionSpendProvider>
        <SpendProbe />
      </SessionSpendProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add spend" }));
    fireEvent.click(screen.getByRole("button", { name: "Add spend" }));

    expect(screen.getByText("50")).toBeInTheDocument();
  });
});
