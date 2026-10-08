export const API_VERSION = "v1";

export function curlExample(origin: string) {
  return `curl -H "Authorization: Bearer $BISIBILITY_API_KEY" \\\n  ${origin}/api/${API_VERSION}/keywords`;
}

export type AgentInstall = {
  caveat?: true;
  command: (mcpUrl: string) => string;
  icon: "cube" | "dots-three" | "monitor" | "terminal";
  id: "claude-code" | "chatgpt" | "codex" | "cursor" | "claude-desktop" | "other";
};

export const AGENTS = [
  {
    command: (mcpUrl) => `claude mcp add --scope user --transport http bisibility \\\n  ${mcpUrl}`,
    icon: "terminal",
    id: "claude-code",
  },
  {
    command: (mcpUrl) => `codex mcp add bisibility --url ${mcpUrl}`,
    icon: "terminal",
    id: "codex",
  },
  {
    command: (mcpUrl) =>
      `{\n  "mcpServers": {\n    "bisibility": {\n      "url": "${mcpUrl}"\n    }\n  }\n}`,
    icon: "cube",
    id: "cursor",
  },
  {
    caveat: true,
    command: (mcpUrl) => mcpUrl,
    icon: "dots-three",
    id: "chatgpt",
  },
  {
    caveat: true,
    command: (mcpUrl) => mcpUrl,
    icon: "monitor",
    id: "claude-desktop",
  },
  {
    command: (mcpUrl) => mcpUrl,
    icon: "dots-three",
    id: "other",
  },
] satisfies readonly AgentInstall[];

export const SKILLS = [
  { archivePath: "/.well-known/agent-skills/keyword-import.tar.gz", name: "keyword-import" },
  { archivePath: "/.well-known/agent-skills/provider-setup.tar.gz", name: "provider-setup" },
  { archivePath: null, name: "project-onboarding" },
  { archivePath: "/.well-known/agent-skills/weekly-report.tar.gz", name: "weekly-report" },
  { archivePath: null, name: "keyword-clustering" },
  { archivePath: null, name: "seo-audit" },
] as const;
