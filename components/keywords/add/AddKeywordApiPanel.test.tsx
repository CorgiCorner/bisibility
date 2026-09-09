import { ToastProvider } from "@/components/ui/Toast";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddKeywordApiPanel } from "./AddKeywordApiPanel";

function renderPanel() {
  return render(
    <ToastProvider>
      <AddKeywordApiPanel projectId="prj_1" />
    </ToastProvider>,
  );
}

describe("AddKeywordApiPanel", () => {
  it("shows a highlighted curl snippet with an external OpenAPI link", () => {
    renderPanel();

    expect(
      screen.getByText(
        "Batch-add keywords from your own scripts or CI. Authenticate with a project API key.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/stored as/)).not.toBeInTheDocument();
    expect(screen.getByText("<API_KEY>")).toBeInTheDocument();
    expect(screen.getByText("<API_KEY>")).toHaveStyle({ color: "var(--accent)" });
    expect(screen.getByText("curl", { selector: "span" })).toHaveStyle({ color: "var(--blue)" });

    const header = screen.getByText("curl", { selector: "div" }).parentElement;
    expect(header).toHaveClass("border-code-border");
    expect(header).not.toHaveClass("border-border");

    const spec = screen.getByRole("link", { name: /\/api\/v1\/openapi\.json$/ });
    expect(spec).toHaveAttribute("target", "_blank");
    expect(spec).toHaveAttribute("rel", "noreferrer noopener");
    expect(spec).toHaveAttribute("href", expect.stringMatching(/\/api\/v1\/openapi\.json$/));
  });

  it("copies the curl snippet with the placeholder intact", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Copy curl snippet" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"country": "Spain"')),
    );
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"language": "en"'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Bearer <API_KEY>"));
  });
});
