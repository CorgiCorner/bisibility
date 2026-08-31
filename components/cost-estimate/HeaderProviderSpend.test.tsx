import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
          action="details"
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
          action={undefined}
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
          action="details"
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
  it.each([
    ["details", "Details", "/app/prj_example/settings/usage"],
    ["set_budget", "Set budget", "/app/prj_example/settings/usage?budget=edit"],
  ] as const)("renders one %s popover action", async (action, label, href) => {
    render(
      <SessionSpendProvider>
        <HeaderProviderSpend
          action={action}
          projectRef="prj_example"
          recorded={{ cents: 0, units: 0 }}
          tightest={null}
          usedPercent={null}
        />
      </SessionSpendProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "About provider spend" }));

    const link = screen.getByRole("link", { name: label });
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(link).toHaveAttribute("href", href);
    expect(link.tagName).toBe("A");
    expect(screen.queryByText("View usage")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit budget")).not.toBeInTheDocument();

    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(link, { button: 0 });

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    });
  });

  it("hides the complete header surface without a connected eligible provider", () => {
    const { container } = render(
      <SessionSpendProvider>
        <HeaderProviderSpend
          action={null}
          projectRef="prj_example"
          recorded={{ cents: 0, units: 0 }}
          tightest={null}
          usedPercent={null}
        />
      </SessionSpendProvider>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: "About provider spend" })).not.toBeInTheDocument();
  });
});
