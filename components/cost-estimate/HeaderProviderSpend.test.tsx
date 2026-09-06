import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeaderProviderSpend } from "./HeaderProviderSpend";
import { SessionSpendProvider } from "./SessionSpendProvider";

describe("HeaderProviderSpend", () => {
  it("renders a cap pill with a mini bar and aggregate percent", () => {
    render(
      <SessionSpendProvider>
        <HeaderProviderSpend
          action="details"
          projectRef="prj_example"
          recorded={{ cents: 1240, units: 28 }}
          tightest={{ provider: "SerpApi", usedPercent: 100 }}
          usedPercent={62}
        />
      </SessionSpendProvider>,
    );

    const link = screen.getByRole("link", { name: "Monthly cap 62% used" });
    expect(link).toHaveAttribute("href", "/app/prj_example/settings/usage");
    expect(link).toHaveTextContent("62% used");
    expect(screen.queryByText("BUDGET")).not.toBeInTheDocument();
    expect(screen.queryByText("SerpApi")).not.toBeInTheDocument();
  });

  it("renders a no-cap pill that links to set a budget", () => {
    render(
      <SessionSpendProvider>
        <HeaderProviderSpend
          action="set_budget"
          projectRef="prj_example"
          recorded={{ cents: 0, units: 0 }}
          tightest={null}
          usedPercent={null}
        />
      </SessionSpendProvider>,
    );

    expect(screen.getByRole("link", { name: "No budget, set one" })).toHaveAttribute(
      "href",
      "/app/prj_example/settings/usage?budget=edit",
    );
    expect(screen.getByText("No budget · Set one")).toBeInTheDocument();
  });

  it("shows spent amount before the no-budget call to action when spend exists", () => {
    render(
      <SessionSpendProvider>
        <HeaderProviderSpend
          action="set_budget"
          projectRef="prj_example"
          recorded={{ cents: 1246, units: 4 }}
          tightest={null}
          usedPercent={null}
        />
      </SessionSpendProvider>,
    );

    expect(
      screen.getByRole("link", { name: "$12.46 spent with no budget, set one" }),
    ).toHaveTextContent("$12.46 · no budget · Set one");
  });

  it("keeps the unavailable state as a muted pill", () => {
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

    expect(screen.getByText("Spend unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("hides the header pill without a connected eligible provider", () => {
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
  });
});
