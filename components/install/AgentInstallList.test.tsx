import { renderWithInstallMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentInstallList } from "./AgentInstallList";
import { AGENTS, API_VERSION, curlExample } from "./install-catalog";

const mocks = vi.hoisted(() => ({ copyButton: vi.fn() }));

vi.mock("@/components/ui/CopyButton", () => ({
  CopyButton: ({ label, text }: { label?: string; text: string }) => {
    mocks.copyButton({ label, text });
    return <button aria-label={label} type="button" />;
  },
}));

const mcpUrl = "https://app.example.com/api/mcp";
const agentLabels = {
  "claude-code": "Claude Code",
  "claude-desktop": "Claude (web and desktop)",
  chatgpt: "ChatGPT",
  codex: "Codex",
  cursor: "Cursor",
  other: "Any MCP client",
} as const;

// Literal expectations. Asserting a rendered block against AGENTS[n].command(mcpUrl) only
// proves the component calls the catalogue, not that the catalogue still spells the command
// the way the design does - a typo in the catalogue would satisfy both sides.
const EXPECTED_COMMANDS: Record<(typeof AGENTS)[number]["id"], string> = {
  "claude-code":
    "claude mcp add --scope user --transport http bisibility \\\n  https://app.example.com/api/mcp",
  codex: "codex mcp add bisibility --url https://app.example.com/api/mcp",
  cursor:
    '{\n  "mcpServers": {\n    "bisibility": {\n      "url": "https://app.example.com/api/mcp"\n    }\n  }\n}',
  chatgpt: "https://app.example.com/api/mcp",
  "claude-desktop": "https://app.example.com/api/mcp",
  other: "https://app.example.com/api/mcp",
};

// The per-tool copy labels ("Copy Cursor command") also match a tool's name, so the
// disclosure trigger is picked by the attribute only it carries.
function agentButton(label: string) {
  const triggers = screen
    .getAllByRole("button", {
      name: (name) => name.toLowerCase().includes(label.toLowerCase()),
    })
    .filter((button) => button.hasAttribute("aria-expanded"));

  expect(triggers).toHaveLength(1);

  return triggers[0] as HTMLButtonElement;
}

function commandBlock(command: string) {
  return screen.getByText(
    (_content, element) =>
      element?.tagName === "PRE" &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.textContent === command,
  );
}

function queryCommandBlock(command: string) {
  return screen.queryByText(
    (_content, element) =>
      element?.tagName === "PRE" &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.textContent === command,
  );
}

describe("AgentInstallList", () => {
  it("expands Claude Code first and leaves all other rows closed", () => {
    render(<AgentInstallList mcpUrl={mcpUrl} />);

    expect(agentButton("Claude Code")).toHaveAttribute("aria-expanded", "true");
    expect(agentButton("ChatGPT")).toHaveAttribute("aria-expanded", "false");
    expect(agentButton("Codex")).toHaveAttribute("aria-expanded", "false");
    expect(agentButton("Cursor")).toHaveAttribute("aria-expanded", "false");
    expect(agentButton("Claude (web and desktop)")).toHaveAttribute("aria-expanded", "false");
    expect(agentButton("Any MCP client")).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps every disclosure panel mounted for smooth height transitions", () => {
    render(<AgentInstallList mcpUrl={mcpUrl} />);

    for (const agent of AGENTS) {
      const panel = document.getElementById(`install-agent-${agent.id}`);
      expect(panel).not.toBeNull();
      expect(panel).toHaveClass(
        "grid",
        "overflow-hidden",
        "motion-safe:[transition:grid-template-rows_.24s_cubic-bezier(.32,.72,0,1),opacity_.18s_ease]",
      );
      expect(panel).toHaveAttribute("aria-hidden", agent.id === "claude-code" ? "false" : "true");
    }
  });

  it("opens Codex and closes Claude Code", () => {
    render(<AgentInstallList mcpUrl={mcpUrl} />);

    fireEvent.click(agentButton("Codex"));

    expect(agentButton("Claude Code")).toHaveAttribute("aria-expanded", "false");
    expect(agentButton("Codex")).toHaveAttribute("aria-expanded", "true");
    expect(commandBlock(EXPECTED_COMMANDS.codex)).toBeInTheDocument();
    expect(queryCommandBlock(EXPECTED_COMMANDS["claude-code"])).not.toBeInTheDocument();
  });

  it("closes the open row when its trigger is clicked again", () => {
    render(<AgentInstallList mcpUrl={mcpUrl} />);

    fireEvent.click(agentButton("Codex"));
    fireEvent.click(agentButton("Codex"));

    expect(agentButton("Codex")).toHaveAttribute("aria-expanded", "false");
    expect(queryCommandBlock(EXPECTED_COMMANDS.codex)).not.toBeInTheDocument();
  });

  it("keeps the Claude Code flags before the bisibility positional argument", () => {
    render(<AgentInstallList mcpUrl={mcpUrl} />);

    const command = EXPECTED_COMMANDS["claude-code"];

    expect(commandBlock(command)).toBeInTheDocument();
    expect(command.indexOf("--scope user --transport http")).toBeLessThan(
      command.indexOf("bisibility"),
    );
  });

  // The design carries the wrapped commands as JS string concatenation. Transcribing the
  // "+" of that concatenation into the template literal ships a command that pastes a
  // literal "+" as the continuation line, which every shell rejects.
  it("renders the exact command the design specifies for every tool", () => {
    render(<AgentInstallList mcpUrl={mcpUrl} />);

    for (const agent of AGENTS) {
      const trigger = agentButton(agentLabels[agent.id]);
      // Claude Code is already open on first render; clicking it would close it.
      if (trigger.getAttribute("aria-expanded") === "false") {
        fireEvent.click(trigger);
      }

      expect(commandBlock(EXPECTED_COMMANDS[agent.id])).toBeInTheDocument();
    }

    expect(curlExample("https://app.example.com")).toBe(
      `curl -H "Authorization: Bearer $BISIBILITY_API_KEY" \\\n  https://app.example.com/api/${API_VERSION}/keywords`,
    );
  });

  it("highlights shell commands, flags, and Cursor JSON while keeping URLs neutral", () => {
    render(<AgentInstallList mcpUrl={mcpUrl} />);

    const claudeCommand = commandBlock(EXPECTED_COMMANDS["claude-code"]);
    expect(claudeCommand.textContent).toBe(EXPECTED_COMMANDS["claude-code"]);
    expect(screen.getByText("claude", { selector: "span" })).toHaveStyle({
      color: "var(--blue)",
    });
    expect(screen.getByText("--scope", { selector: "span" })).toHaveStyle({
      color: "var(--blue)",
    });
    expect(
      [...claudeCommand.querySelectorAll("[style]")].some(
        (element) => element.textContent === mcpUrl,
      ),
    ).toBe(false);

    mocks.copyButton.mockClear();
    fireEvent.click(agentButton("Cursor"));

    const cursorCommand = commandBlock(EXPECTED_COMMANDS.cursor);
    expect(cursorCommand.textContent).toBe(EXPECTED_COMMANDS.cursor);
    const command = AGENTS.find((agent) => agent.id === "cursor")?.command(mcpUrl);
    expect(command).toBe(EXPECTED_COMMANDS.cursor);
    expect(JSON.parse(command ?? "")).toEqual({
      mcpServers: { bisibility: { url: mcpUrl } },
    });
    expect(mocks.copyButton).toHaveBeenCalledWith({
      label: "Copy Cursor command",
      text: EXPECTED_COMMANDS.cursor,
    });
    expect(screen.getByText('"mcpServers"', { selector: "span" })).toHaveStyle({
      color: "var(--blue)",
    });
    expect(
      [...cursorCommand.querySelectorAll("[style]")].some(
        (element) => element.textContent === mcpUrl,
      ),
    ).toBe(false);
  });

  it("keeps URL-only connector commands neutral without changing their text", () => {
    render(<AgentInstallList mcpUrl={mcpUrl} />);

    fireEvent.click(agentButton("Claude (web and desktop)"));

    const connectorCommand = commandBlock(EXPECTED_COMMANDS["claude-desktop"]);
    expect(connectorCommand.textContent).toBe(mcpUrl);
    expect(connectorCommand.querySelectorAll("[style]")).toHaveLength(0);
  });

  // A MUI IconButton's emotion rules sit outside Tailwind's cascade layer, so "absolute" has
  // to live on a wrapper; on the button itself the copy control flows below the code block.
  it("pins the copy control to the top right of the code block through a wrapper", () => {
    render(<AgentInstallList mcpUrl={mcpUrl} />);

    const button = screen.getByRole("button", { name: "Copy Claude Code command" });
    const wrapper = button.parentElement;

    expect(wrapper?.tagName).toBe("SPAN");
    expect(wrapper).toHaveClass("absolute", "right-[7px]", "top-[7px]");
    expect(button).not.toHaveClass("absolute");
  });

  // The design draws the row as "padding: 11px 0". A UA default of 6px side padding pushes the
  // row out of the card's text column and shifts content when the skeleton settles.
  it("keeps the trigger flush with the card's text column", () => {
    render(<AgentInstallList mcpUrl={mcpUrl} />);

    expect(agentButton("Claude Code")).toHaveClass("px-0", "py-[11px]");
  });

  // D2 guard: entries without a caveat must keep byte-identical output when the optional
  // caveat line is added for other entries.
  it("renders the caveat-less Codex row with byte-identical markup", () => {
    render(<AgentInstallList mcpUrl={mcpUrl} />);

    fireEvent.click(agentButton("Codex"));

    const row = document.getElementById("install-agent-codex")?.parentElement;
    expect(row?.outerHTML).toMatchInlineSnapshot(
      `"<div class="border-t border-border"><button aria-controls="install-agent-codex" aria-expanded="true" class="flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-0 py-[11px] text-left text-[13.5px] text-fg" type="button"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true" class="shrink-0 text-fg-muted"><path d="M117.31,134l-72,64a8,8,0,1,1-10.63-12L100,128,34.69,70A8,8,0,1,1,45.32,58l72,64a8,8,0,0,1,0,12ZM216,184H120a8,8,0,0,0,0,16h96a8,8,0,0,0,0-16Z"></path></svg><span class="font-medium">Codex</span><span class="ml-auto font-sans text-[10.5px] text-fg-muted">CLI</span><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true" class="shrink-0 text-fg-muted"><path d="M213.66,165.66a8,8,0,0,1-11.32,0L128,91.31,53.66,165.66a8,8,0,0,1-11.32-11.32l80-80a8,8,0,0,1,11.32,0l80,80A8,8,0,0,1,213.66,165.66Z"></path></svg></button><div aria-hidden="false" class="grid overflow-hidden transition-none motion-safe:[transition:grid-template-rows_.24s_cubic-bezier(.32,.72,0,1),opacity_.18s_ease] grid-rows-[1fr] opacity-100" id="install-agent-codex"><div class="min-h-0 overflow-hidden"><div class="pb-3"><div class="relative"><pre aria-hidden="false" class="m-0 whitespace-pre-wrap break-words rounded-[8px] bg-code-bg py-2.5 pl-3 pr-10 font-mono text-[11.5px] leading-[1.65] text-code-fg [word-break:break-word]"><span style="color: var(--blue);">codex</span> mcp add bisibility <span style="color: var(--blue);">--url</span> https://app.example.com/api/mcp</pre><span class="absolute right-[7px] top-[7px]"><button type="button" aria-label="Copy Codex command"></button></span></div><p class="m-0 mt-2 text-[11.5px] text-fg-muted">Codex signs in through the same OAuth flow.</p></div></div></div></div>"`,
    );
  });

  it("renders the ChatGPT caveat as a second muted line under the note", () => {
    render(<AgentInstallList mcpUrl={mcpUrl} />);

    fireEvent.click(agentButton("ChatGPT"));

    const note = screen.getByText(
      "Open ChatGPT Plugins, select +, then Add custom MCP server. Use the MCP URL and OAuth.",
    );
    const caveat = screen.getByText(
      "Access depends on your workspace policy. This bisibility connection requests read-only access.",
    );
    expect(note).toHaveClass("text-fg-muted");
    expect(caveat.tagName).toBe("P");
    expect(caveat).toHaveClass("text-fg-muted");
    expect(caveat.previousElementSibling).toBe(note);
  });

  it("renders the Claude (web and desktop) caveat as a second muted line under the note", () => {
    render(<AgentInstallList mcpUrl={mcpUrl} />);

    fireEvent.click(agentButton("Claude (web and desktop)"));

    const note = screen.getByText(
      "Customize, Connectors, Add custom connector, paste the URL, then approve the sign-in.",
    );
    const caveat = screen.getByText(
      "Claude exposes every tool. It asks before each write tool the first time; use Allow always only for tools you trust to run unsupervised. Research runs tools without asking, so disable write tools there.",
    );
    expect(note).toHaveClass("text-fg-muted");
    expect(caveat.tagName).toBe("P");
    expect(caveat).toHaveClass("text-fg-muted");
    expect(caveat.previousElementSibling).toBe(note);
  });

  it("ties each trigger to the panel it opens and names its copy button per tool", () => {
    render(<AgentInstallList mcpUrl={mcpUrl} />);

    const trigger = agentButton("Claude Code");

    expect(trigger).toHaveAttribute("aria-controls", "install-agent-claude-code");
    expect(document.getElementById("install-agent-claude-code")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy Claude Code command" })).toBeInTheDocument();

    fireEvent.click(agentButton("Cursor"));

    expect(agentButton("Cursor")).toHaveAttribute("aria-controls", "install-agent-cursor");
    expect(document.getElementById("install-agent-cursor")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy Cursor command" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy command" })).not.toBeInTheDocument();
  });
});
