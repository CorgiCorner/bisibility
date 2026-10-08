import { type AuditTransport, type CrawlBudget, fetchAuditPage } from "./fetch";

function pathMatches(pattern: string, path: string) {
  const anchored = pattern.endsWith("$");
  const parts = (anchored ? pattern.slice(0, -1) : pattern).split("*");
  if (!path.startsWith(parts[0])) return false;
  let position = parts[0].length;
  for (const part of parts.slice(1)) {
    const match = path.indexOf(part, position);
    if (match < 0) return false;
    position = match + part.length;
  }
  return (
    !anchored || (parts.length === 1 ? position === path.length : path.endsWith(parts.at(-1) ?? ""))
  );
}
export function robotsDisallows(text: string, pathname: string) {
  let applies = false;
  let groupStarted = false;
  const rules: { allow: boolean; path: string }[] = [];
  for (const line of text.split(/\r?\n/).slice(0, 5000)) {
    const content = line.split("#")[0]?.trim() ?? "";
    const separator = content.indexOf(":");
    if (separator < 0) continue;
    const directive = content.slice(0, separator).trim().toLowerCase();
    const value = content.slice(separator + 1).trim();
    if (directive === "user-agent") {
      if (groupStarted) {
        applies = false;
        groupStarted = false;
      }
      applies ||= value === "*" || value.toLowerCase() === "bisibilitysiteaudit";
    } else if (directive === "allow" || directive === "disallow") {
      groupStarted = true;
      if (applies && value && value.length <= 512)
        rules.push({ allow: directive === "allow", path: value });
    }
  }
  const matching = rules
    .filter((rule) => pathMatches(rule.path, pathname))
    .sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return matching[0] ? !matching[0].allow : false;
}

export function auditRobotsPolicy(
  target: URL,
  budget: CrawlBudget,
  transport: AuditTransport,
  limitations: string[],
) {
  const policies = new Map<string, Promise<string>>();
  let unavailable = false;
  async function read(origin: string) {
    try {
      const fetched = await fetchAuditPage(new URL("/robots.txt", origin), budget, transport, {
        checkRobots: false,
      });
      if (fetched.status !== 200 && fetched.status !== 404) {
        limitations.push(`robots.txt returned HTTP ${fetched.status}.`);
        if (origin !== target.origin || new URL(fetched.url).origin !== target.origin)
          throw new Error("Canonical origin robots.txt could not be read.");
      }
      const text = fetched.status === 200 ? fetched.html : "";
      const final = new URL(fetched.url);
      if ([200, 404].includes(fetched.status) && final.pathname === "/robots.txt")
        policies.set(final.origin, Promise.resolve(text));
      return text;
    } catch {
      unavailable = true;
      const message = "robots.txt could not be read; no additional paths were crawled.";
      if (!limitations.includes(message)) limitations.push(message);
      if (origin !== target.origin)
        throw new Error("Canonical origin robots.txt could not be read.");
      return "";
    }
  }
  function load(origin: string) {
    let policy = policies.get(origin);
    if (!policy) {
      policy = read(origin);
      policies.set(origin, policy);
    }
    return policy;
  }
  return {
    load,
    unavailable: () => unavailable,
    disallowed: async (url: URL) => robotsDisallows(await load(url.origin), url.pathname),
  };
}
