import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { capitalizeFirst, InstallPageContent } from "./InstallPageContent";
import { SKILLS } from "./install-catalog";

vi.mock("@/components/ui/CopyButton", () => ({
  CopyButton: ({ label }: { label?: string }) => <button aria-label={label} type="button" />,
}));

const props = {
  apiKey: {
    createdLabel: "created 2026-08-16",
    maskedValue: "bsk_example_******",
    scopeLabel: "Read and write",
  },
  isCloudHosted: true,
  mcpUrl: "https://app.example.com/api/mcp",
  origin: "https://app.example.com",
  projectRef: "prj_abcdefghijklmnopqrstuvwx",
};

describe("InstallPageContent", () => {
  it("does not repeat the Install header introduction in the page body", () => {
    const { container } = render(<InstallPageContent {...props} />);

    expect(container).not.toHaveTextContent(
      "Let your AI agent, editor or scripts use the same data you see here.",
    );
    expect(container).not.toHaveTextContent("Nothing new to sign up for.");
  });

  it("uses neutral input styling for the MCP endpoint and stored API key", () => {
    render(<InstallPageContent {...props} />);

    const endpointSection = screen
      .getByRole("heading", { name: "MCP endpoint" })
      .closest("section");
    const apiKeySection = screen.getByRole("heading", { name: "API key" }).closest("section");
    expect(endpointSection).not.toBeNull();
    expect(apiKeySection).not.toBeNull();

    const endpointSurface = within(endpointSection as HTMLElement).getByText(
      props.mcpUrl,
    ).parentElement;
    const apiKeySurface = within(apiKeySection as HTMLElement).getByText(
      props.apiKey.maskedValue,
    ).parentElement;

    for (const surface of [endpointSurface, apiKeySurface]) {
      expect(surface).toHaveClass("border-border-control", "bg-transparent");
      expect(surface).not.toHaveClass("border-border", "bg-bg");
    }
  });

  it("uses Sans for URLs, key values, status, and labels while retaining command Mono", () => {
    const { container } = render(<InstallPageContent {...props} />);

    const endpointSection = screen
      .getByRole("heading", { name: "MCP endpoint" })
      .closest("section");
    const keySection = screen.getByRole("heading", { name: "API key" }).closest("section");
    expect(within(endpointSection as HTMLElement).getByText(props.mcpUrl)).not.toHaveClass(
      "font-mono",
    );
    expect(within(keySection as HTMLElement).getByText(props.apiKey.maskedValue)).not.toHaveClass(
      "font-mono",
    );
    expect(within(keySection as HTMLElement).getByText(/Read and write/)).not.toHaveClass(
      "font-mono",
    );
    expect(screen.getByText("planned")).not.toHaveClass("font-mono");
    expect(container.querySelector("pre")).toHaveClass("font-mono");
  });

  it("renders the retained planned skills and omits removed catalog entries", () => {
    render(<InstallPageContent {...props} />);

    for (const skill of SKILLS) {
      const skillName = screen.getByText(skill.name);
      expect(skillName.closest("a, button")).toBeNull();
    }

    expect(screen.queryByText("bisibility")).not.toBeInTheDocument();
    expect(screen.queryByText("Project context")).not.toBeInTheDocument();
    expect(screen.queryByText("alert-triage")).not.toBeInTheDocument();
    expect(screen.queryByText("Explain and act on drops")).not.toBeInTheDocument();
    expect(screen.queryByText("self-host-health")).not.toBeInTheDocument();
    expect(screen.queryByText("Instance checks")).not.toBeInTheDocument();
    expect(screen.queryByText("domain-onboarding")).not.toBeInTheDocument();

    expect(screen.getByText("keyword-import")).toBeInTheDocument();
    expect(screen.getByText("Bulk add, dedupe")).toBeInTheDocument();
    expect(screen.getByText("project-onboarding")).toBeInTheDocument();
    expect(screen.getByText("First project setup")).toBeInTheDocument();
    expect(screen.getByText("seo-audit")).toBeInTheDocument();
    expect(screen.getByText("Prioritized fixes")).toBeInTheDocument();

    // nav-active is the opaque #EDEAE1 the design calls surface-hover. bg-sunken is a 30%
    // alpha that composites to roughly the card colour, leaving the pill invisible.
    expect(screen.getByText("planned")).toHaveClass("bg-nav-active", "text-yellow-text");
  });

  it("highlights curl syntax and environment variables while keeping the URL neutral", () => {
    render(<InstallPageContent {...props} />);

    const expectedCurl =
      'curl -H "Authorization: Bearer $BISIBILITY_API_KEY" \\\n  https://app.example.com/api/v1/keywords';
    const curlBlock = screen.getByText(
      (_content, element) => element?.tagName === "PRE" && element.textContent === expectedCurl,
    );

    expect(curlBlock.textContent).toBe(expectedCurl);
    expect(screen.getByText("curl", { selector: "span" })).toHaveStyle({ color: "var(--blue)" });
    expect(screen.getByText("-H", { selector: "span" })).toHaveStyle({ color: "var(--blue)" });
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "SPAN" && element.textContent === '"Authorization: Bearer ',
      ),
    ).toHaveStyle({ color: "var(--green)" });
    expect(screen.getByText("$BISIBILITY_API_KEY", { selector: "span" })).toHaveStyle({
      color: "var(--accent)",
    });
    expect(
      [...curlBlock.querySelectorAll("[style]")].some(
        (element) => element.textContent === "https://app.example.com/api/v1/keywords",
      ),
    ).toBe(false);
  });

  it("pins the curl copy control to the top right of the code block through a wrapper", () => {
    render(<InstallPageContent {...props} />);

    const button = screen.getByRole("button", { name: "Copy curl example" });
    const wrapper = button.parentElement;

    expect(wrapper?.tagName).toBe("SPAN");
    expect(wrapper).toHaveClass("absolute", "right-[7px]", "top-[7px]");
    expect(button).not.toHaveClass("absolute");
  });

  it("links to the current project Developers settings", () => {
    render(<InstallPageContent {...props} />);

    expect(screen.getByRole("link", { name: /Manage in Settings, Developers/ })).toHaveAttribute(
      "href",
      "/app/prj_abcdefghijklmnopqrstuvwx/settings/developers",
    );
  });

  it("renders the no-key settings link inline without a bordered action", () => {
    render(<InstallPageContent {...props} apiKey={null} />);

    const link = screen.getByRole("link", { name: "Create one in Settings, Developers." });

    expect(link).toHaveAttribute("href", "/app/prj_abcdefghijklmnopqrstuvwx/settings/developers");
    expect(link).toHaveClass("text-accent-text", "hover:underline");
    expect(link).not.toHaveClass("border", "border-border-control", "rounded-control");
    expect(link.parentElement).toHaveTextContent(
      "No API key yet. Create one in Settings, Developers.",
    );
    expect(screen.queryByRole("link", { name: /Manage in Settings, Developers/ })).toBeNull();
  });

  it("never renders a control for the stored API key", () => {
    const { container } = render(<InstallPageContent {...props} />);
    const prohibitedCopyLabel = ["Copy API", "key"].join(" ");

    expect(screen.queryByLabelText(/copy api\s+key/i)).toBeNull();
    expect(container.textContent).not.toContain(prohibitedCopyLabel);
  });

  it("capitalizes a created label once for the API key sentence", () => {
    expect(capitalizeFirst("created 2026-08-16")).toBe("Created 2026-08-16");
    expect(capitalizeFirst("")).toBe("");
  });
});
