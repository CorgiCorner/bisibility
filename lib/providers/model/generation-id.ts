/** Reads only a completed top-level JSON string field from a bounded response prefix. */
export function openRouterGenerationId(prefix: string): string | null {
  const text = prefix.slice(0, 8192);
  let depth = 0;
  let key = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const start = i;
      for (i++; i < text.length; i++) {
        if (text[i] === "\\") i++;
        else if (text[i] === '"') break;
      }
      if (i >= text.length) return null;
      if (depth !== 1 || !key) continue;
      key = false;
      let name: unknown;
      try {
        name = JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
      if (name !== "id") continue;
      const rest = text.slice(i + 1);
      const match = /^\s*:\s*("(?:[^"\\]|\\.)*")(?=\s*[,}]|\s*$)/.exec(rest);
      if (!match) return null;
      try {
        const value: unknown = JSON.parse(match[1]);
        return typeof value === "string" && /^gen-[A-Za-z0-9_-]{1,196}$/.test(value) ? value : null;
      } catch {
        return null;
      }
    } else if (char === "{" || char === "[") {
      depth++;
      if (depth === 1) {
        if (char !== "{") return null;
        key = true;
      }
    } else if (char === "}" || char === "]") {
      depth--;
      if (depth < 1) return null;
    } else if (char === "," && depth === 1) key = true;
    else if (depth === 0 && !/\s/.test(char)) return null;
  }
  return null;
}
