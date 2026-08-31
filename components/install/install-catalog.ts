export const API_VERSION = "v1";

export function curlExample(origin: string) {
  return `curl -H "Authorization: Bearer $BISIBILITY_API_KEY" \\\n  ${origin}/api/${API_VERSION}/keywords`;
}

export type AgentInstall = {
  command: (mcpUrl: string) => string;
  hint: string;
  icon: "cube" | "dots-three" | "monitor" | "terminal";
  id: "claude-code" | "codex" | "cursor" | "claude-desktop" | "other";
  label: string;
  note: string;
};

export const AGENTS = [
  {
    command: (mcpUrl) => `claude mcp add --scope user --transport http bisibility \\\n  ${mcpUrl}`,
    hint: "CLI",
    icon: "terminal",
    id: "claude-code",
    label: "Claude Code",
    note: "Then run /mcp inside Claude Code to sign in.",
  },
  {
    command: (mcpUrl) => `codex mcp add bisibility --url ${mcpUrl}`,
    hint: "CLI",
    icon: "terminal",
    id: "codex",
    label: "Codex",
    note: "Codex signs in through the same OAuth flow.",
  },
  {
    command: (mcpUrl) =>
      `{\n  "mcpServers": {\n    "bisibility": {\n      "url": "${mcpUrl}"\n    }\n  }\n}`,
    hint: "editor",
    icon: "cube",
    id: "cursor",
    label: "Cursor",
    note: "Settings, MCP, then paste into mcp.json.",
  },
  {
    command: (mcpUrl) => mcpUrl,
    hint: "connector",
    icon: "monitor",
    id: "claude-desktop",
    label: "Claude Desktop",
    note: "No terminal: Settings, Connectors, Add custom connector, then paste this URL and sign in.",
  },
  {
    command: (mcpUrl) => mcpUrl,
    hint: "manual",
    icon: "dots-three",
    id: "other",
    label: "Any MCP client",
    note: "Streamable HTTP with OAuth sign-in. No key in the URL.",
  },
] satisfies readonly AgentInstall[];

export const SKILLS = [
  { name: "keyword-import", note: "Bulk add, dedupe" },
  { name: "provider-setup", note: "Connect, verify keys" },
  { name: "project-onboarding", note: "First project setup" },
  { name: "weekly-report", note: "Digest of movements" },
  { name: "keyword-clustering", note: "Group by intent" },
  { name: "seo-audit", note: "Prioritized fixes" },
] as const;
