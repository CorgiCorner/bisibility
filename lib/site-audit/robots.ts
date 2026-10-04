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
