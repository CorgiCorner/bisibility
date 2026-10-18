import { renderWithOnboardingMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepCreateProject } from "./StepCreateProject";

// Reproduce externally replaced text nodes observed as nested font elements.
function replaceVisibleText(element: HTMLElement) {
  const outer = document.createElement("font");
  const inner = document.createElement("font");
  inner.textContent = element.textContent;
  outer.append(inner);
  element.replaceChildren(outer);
}

describe("website preview after external text replacement", () => {
  it("keeps fallback, loading and resolved text usable through every preview transition", async () => {
    let resolvePreview!: (value: { domain: string; name: string }) => void;
    const deriveWebsiteAction = vi.fn(
      () =>
        new Promise<{ domain: string; name: string }>((resolve) => {
          resolvePreview = resolve;
        }),
    );
    const { container, unmount } = render(
      <StepCreateProject
        defaultValues={{ website: "example.com" }}
        deriveWebsiteAction={deriveWebsiteAction}
      />,
    );
    const note = container.querySelector<HTMLElement>('p[aria-live="polite"]');
    expect(note).not.toBeNull();
    replaceVisibleText(note!);

    const website = screen.getByLabelText("Your website");
    fireEvent.blur(website);
    await waitFor(() => expect(deriveWebsiteAction).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Checking website...")).toBeInTheDocument();
    replaceVisibleText(note!);

    await act(async () => {
      resolvePreview({ domain: "example.com", name: "example" });
    });
    expect(screen.getByText("Project name: example")).toBeInTheDocument();
    replaceVisibleText(note!);
    fireEvent.change(website, { target: { value: "second.example.com" } });
    expect(note).toHaveTextContent("We will use the website as the project name.");
    expect(note).not.toHaveTextContent("Project name: example");
    expect(() => unmount()).not.toThrow();
  });
});
