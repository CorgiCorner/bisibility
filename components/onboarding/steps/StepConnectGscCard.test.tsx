import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepConnectGscCard } from "./StepConnectGscCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("StepConnectGscCard", () => {
  it("starts OAuth without asking the user to type a property id", () => {
    render(<StepConnectGscCard configured projectId="prj_1" />);

    expect(screen.queryByLabelText("Search Console property")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect Search Console" })).toHaveAttribute(
      "href",
      expect.not.stringContaining("property="),
    );
  });

  it("returns the OAuth roundtrip to onboarding step 5 with the wizard context", () => {
    const returnPath = "/onboarding?step=5&projectId=prj_1&loc=US&device=desktop";
    render(<StepConnectGscCard configured projectId="prj_1" returnPath={returnPath} />);

    const href = screen.getByRole("link", { name: "Connect Search Console" }).getAttribute("href");
    const install = new URL(href ?? "", "https://example.test");
    expect(install.searchParams.get("returnPath")).toBe(returnPath);
  });

  it("uses a verified property returned by the connected Google account", async () => {
    const completePropertySelection = vi.fn(async (input) => ({ property: input.property }));
    render(
      <StepConnectGscCard
        completePropertySelection={completePropertySelection}
        configured
        googleOAuth={{
          properties: [
            {
              kind: "domain",
              label: "example.com (Domain property)",
              permissionLevel: "siteOwner",
              value: "sc-domain:example.com",
            },
          ],
        }}
        projectId="prj_1"
      />,
    );

    expect(screen.getByText("sc-domain:example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use selected property" }));
    await waitFor(() =>
      expect(completePropertySelection).toHaveBeenCalledWith({
        projectId: "prj_1",
        property: "sc-domain:example.com",
      }),
    );
  });
});
