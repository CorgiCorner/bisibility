import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeaderProviderSpend } from "./HeaderProviderSpend";
import { SessionSpendProvider, useSessionSpend } from "./SessionSpendProvider";

function AddSessionSpend() {
  const { addSpend } = useSessionSpend();
  return (
    <button onClick={() => addSpend(2)} type="button">
      Add session spend
    </button>
  );
}

describe("HeaderProviderSpend", () => {
  it("shows the tightest allocation and no prohibited copy", () => {
    const { container } = render(
      <SessionSpendProvider>
        <HeaderProviderSpend
          projectRef="prj_example"
          recorded={{ cents: 1240, units: 28 }}
          tightest={{ provider: "SerpApi", usedPercent: 100 }}
          usedPercent={100}
        />
      </SessionSpendProvider>,
    );
    expect(screen.getByText("BUDGET")).toBeInTheDocument();
    expect(screen.getByText("SerpApi 100% used")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/utili(?:zation|sation)/i);
  });
  it("keeps the explicit unavailable state", () => {
    render(
      <SessionSpendProvider>
        <HeaderProviderSpend
          projectRef="prj_example"
          recorded={null}
          tightest={null}
          usedPercent={null}
        />
      </SessionSpendProvider>,
    );
    expect(screen.getByText("Temporarily unavailable")).toBeInTheDocument();
  });
  it("does not mix client session spend into the server budget figures", () => {
    const { container } = render(
      <SessionSpendProvider>
        <HeaderProviderSpend
          projectRef="prj_example"
          recorded={{ cents: 1240, units: 28 }}
          tightest={{ provider: "SerpApi", usedPercent: 86 }}
          usedPercent={86}
        />
        <AddSessionSpend />
      </SessionSpendProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add session spend" }));

    expect(container.querySelector("[title]")).toHaveAttribute(
      "title",
      "$12.40 + 28 searches recorded this month",
    );
    expect(screen.getByText("SerpApi 86% used")).toBeInTheDocument();
  });
});
