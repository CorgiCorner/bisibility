import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeaderProviderSpend } from "./HeaderProviderSpend";
import { SessionSpendProvider } from "./SessionSpendProvider";

describe("HeaderProviderSpend", () => {
  it("renders truthful spend values when the summary is available", async () => {
    render(
      <SessionSpendProvider>
        <HeaderProviderSpend capCents={5_000} projectRef="prj_example" spentCents={1_240} />
      </SessionSpendProvider>,
    );

    expect(screen.getByText("$12.40 / $50.00")).toBeInTheDocument();
    expect(screen.queryByText("$0.00 this session")).not.toBeInTheDocument();
    screen.getByRole("button", { name: "About provider spend" }).click();
    expect(await screen.findByText("$0.00 this session")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit budget" })).toHaveAttribute(
      "href",
      "/app/prj_example/settings#provider-usage",
    );
  });

  it("renders an explicit unknown state instead of inventing zero spend", () => {
    render(
      <SessionSpendProvider>
        <HeaderProviderSpend capCents={null} projectRef="prj_example" spentCents={null} />
      </SessionSpendProvider>,
    );

    expect(screen.getByLabelText("Provider spend temporarily unavailable")).toBeInTheDocument();
    expect(screen.getByText("Temporarily unavailable")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });
});
