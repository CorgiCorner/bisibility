export const API_VERSION = "v1";

export function curlExample(origin: string) {
  return `curl -H "Authorization: Bearer $BISIBILITY_API_KEY" \\\n  ${origin}/api/${API_VERSION}/keywords`;
}

export type AgentInstall = {
  command: (mcpUrl: string) => string;
  icon: "cube" | "dots-three" | "monitor" | "terminal";
  id: "claude-code" | "codex" | "cursor" | "claude-desktop" | "other";
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
  { name: "keyword-import" },
  { name: "provider-setup" },
  { name: "project-onboarding" },
  { name: "weekly-report" },
  { name: "keyword-clustering" },
  { name: "seo-audit" },
] as const;
