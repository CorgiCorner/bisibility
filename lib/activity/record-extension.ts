export function recordUserActivity(_input: {
  userId: string;
  email: string;
  channel: "app" | "api" | "mcp";
  kind: "seen" | "acted";
  interactive: boolean;
}): void {}
