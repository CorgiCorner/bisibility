import { renderWithInstallMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InstallPageContent } from "./InstallPageContent";

vi.mock("@/components/ui/CopyButton", () => ({
  CopyButton: ({ label }: { label?: string }) => <button aria-label={label} type="button" />,
}));

const props = {
  apiKey: {
    createdAt: new Date("2026-08-16T12:00:00.000Z"),
    maskedValue: "bsk_example_******",
    scope: "write" as const,
  },
  hasKeywordAndCheck: false,
  isCloudHosted: true,
  mcpToolCounts: { readOnly: 3, total: 5 },
  mcpUrl: "https://example.com/api/mcp",
  origin: "https://example.com",
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

  it("renders the tool scope paragraph under the MCP URL with live counts", () => {
    render(<InstallPageContent {...props} />);

    const endpointSection = screen
      .getByRole("heading", { name: "MCP endpoint" })
      .closest("section");
    expect(endpointSection).not.toBeNull();

    expect(
      within(endpointSection as HTMLElement).getByText(
        "3 of 5 tools are marked read-only. Clients and approved scopes can restrict tool availability. Paid operations such as rank checks and backlink analysis are write tools. Stored reports and cost estimates are read-only.",
      ),
    ).toHaveClass("text-fg-muted");
  });

  it("renders both client connect caveats verbatim on the install page", () => {
    const { container } = render(<InstallPageContent {...props} />);

    expect(container).toHaveTextContent(
      "Access depends on your workspace policy. This bisibility connection requests read-only access.",
    );
    expect(container).toHaveTextContent(
      "Claude exposes every tool. It asks before each write tool the first time; use Allow always only for tools you trust to run unsupervised. Research runs tools without asking, so disable write tools there.",
    );
    expect(container).toHaveTextContent(
      "Paid operations such as rank checks and backlink analysis are write tools and charge your project's payment source. Ask the bot to confirm the cost before running them.",
    );
    expect(container).toHaveTextContent(
      "Paste this into a Grok Bot chat, confirm adding the custom MCP server, then sign in from the connect card. The bisibility consent screen may name the client Cursor and say it was registered automatically; that is expected for Grok Bot.",
    );
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
    expect(
      screen.getByText("9 available · 9 in the Claude Code plugin · 4 planned"),
    ).not.toHaveClass("font-mono");
    expect(container.querySelector("pre")).toHaveClass("font-mono");
  });

  it("distinguishes archive downloads, plugin skills and planned tasks", () => {
    render(<InstallPageContent {...props} />);

    for (const name of [
      "domain-onboarding",
      "bisibility",
      "ai-visibility-audit",
      "keyword-import",
      "weekly-report",
      "alert-triage",
      "provider-setup",
      "team-api-governance",
      "self-host-health",
    ]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", `/.well-known/agent-skills/${name}.tar.gz`);
      expect(link).toHaveAttribute("download");
      expect(within(link.parentElement as HTMLElement).getByText("available")).toBeVisible();
    }
    for (const name of [
      "project-setup",
      "seo-coach",
      "seo-audit",
      "keyword-opportunity-research",
      "rank-tracking-report",
      "backlink-profile-analysis",
      "keyword-clustering",
      "competitor-analysis",
      "competitive-landscape",
    ]) {
      const label = screen.getByText(name);
      expect(label.closest("a, button")).toBeNull();
      expect(
        within(label.parentElement as HTMLElement).getByText("in the Claude Code plugin"),
      ).toBeVisible();
      expect(within(label.parentElement as HTMLElement).queryByText("planned")).toBeNull();
    }
    for (const name of [
      "ai-prompt-research",
      "local-seo",
      "link-prospecting",
      "sitemap-change-watch",
    ]) {
      const label = screen.getByText(name);
      expect(label.closest("a, button")).toBeNull();
      expect(within(label.parentElement as HTMLElement).getByText("planned")).toBeVisible();
    }
    expect(screen.queryByText("project-onboarding")).not.toBeInTheDocument();
    expect(screen.getByText("9 available · 9 in the Claude Code plugin · 4 planned")).toHaveClass(
      "bg-nav-active",
      "text-yellow-text",
    );
  });

  it("highlights curl syntax and environment variables while keeping the URL neutral", () => {
    render(<InstallPageContent {...props} />);

    const expectedCurl =
      'curl -H "Authorization: Bearer $BISIBILITY_API_KEY" \\\n  https://example.com/api/v1/keywords';
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
        (element) => element.textContent === "https://example.com/api/v1/keywords",
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

    expect(
      screen.getByText(
        "No API key yet. Project admins can create one under Settings → Developers.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Create one in Settings, Developers." }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Manage in Settings, Developers/ })).toBeNull();
  });

  it("never renders a control for the stored API key", () => {
    const { container } = render(<InstallPageContent {...props} />);
    const prohibitedCopyLabel = ["Copy API", "key"].join(" ");

    expect(screen.queryByLabelText(/copy api\s+key/i)).toBeNull();
    expect(container.textContent).not.toContain(prohibitedCopyLabel);
  });

  it("formats an API key creation date at the presentation boundary", () => {
    render(<InstallPageContent {...props} />);
    expect(screen.getByText(/Created Aug 16, 2026/)).toBeVisible();
  });
});
