import {
  renderWithSharedMessages as render,
  renderWithFeatureMessages,
  sharedControlTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SampleDataButton } from "./SampleDataButton";

const SAMPLE_DATA_BUTTON_TOOLTIP = "Loads a temporary sample project and skips the rest of setup.";

vi.mock("@/lib/actions/sample-data", () => ({
  installSampleData: vi.fn(),
}));

describe("SampleDataButton", () => {
  it("puts the skip-setup help on the action button itself", () => {
    render(
      <SampleDataButton
        help={SAMPLE_DATA_BUTTON_TOOLTIP}
        label="Load sample project"
        variant="secondary"
      />,
    );

    const button = screen.getByRole("button", { name: "Load sample project" });
    expect(button).toHaveAttribute("data-variant", "secondary");
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? "")).toHaveTextContent(
      SAMPLE_DATA_BUTTON_TOOLTIP,
    );
    expect(
      screen.queryByRole("button", { name: SAMPLE_DATA_BUTTON_TOOLTIP }),
    ).not.toBeInTheDocument();
  });

  it("navigates to the installed sample project without rendering an action error", async () => {
    const destination = "/app/prj_e00000000000000000000000/dashboard";
    const action = vi.fn(async () => ({ destination }));
    render(<SampleDataButton action={action} label="Load sample project" />);

    fireEvent.click(screen.getByRole("button", { name: "Load sample project" }));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(destination));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/NEXT_REDIRECT/)).not.toBeInTheDocument();
  });

  it("renders genuine action failures", async () => {
    const action = vi.fn(async () => {
      throw new Error("Database unavailable");
    });
    render(<SampleDataButton action={action} label="Load sample project" />);

    fireEvent.click(screen.getByRole("button", { name: "Load sample project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("localizes an unknown action failure through the shared error contract", async () => {
    const action = vi.fn(async () => {
      throw null;
    });
    const messages = structuredClone(sharedControlTestMessages);
    messages.shared.errors.genericFallback = "Nie można było wykonać tej czynności.";

    renderWithFeatureMessages(<SampleDataButton action={action} label="Load sample project" />, {
      locale: "pl",
      messages,
    });
    fireEvent.click(screen.getByRole("button", { name: "Load sample project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nie można było wykonać tej czynności.",
    );
  });

  it("renders a stale deployment through its scoped locale without changing other consumers", async () => {
    const action = vi.fn(async () => {
      throw new Error("This request might be from an older or newer deployment.");
    });
    const messages = structuredClone(sharedControlTestMessages);
    messages.shared.errors.staleDeployment =
      "Aplikacja bisibility została zaktualizowana, gdy ta strona była otwarta. Odśwież aplikację, aby kontynuować. Niezapisane zmiany zostaną utracone.";

    renderWithFeatureMessages(<SampleDataButton action={action} label="Load sample project" />, {
      locale: "pl",
      messages,
    });
    fireEvent.click(screen.getByRole("button", { name: "Load sample project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Aplikacja bisibility została zaktualizowana",
    );
    expect(screen.queryByText(/Refresh the app to continue/)).not.toBeInTheDocument();
  });

  it("omits the help control when no help is provided", () => {
    render(<SampleDataButton label="Load sample project" />);

    expect(screen.getByRole("button", { name: "Load sample project" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: SAMPLE_DATA_BUTTON_TOOLTIP }),
    ).not.toBeInTheDocument();
  });
});
