// Presentation helpers for the settings members list, extracted because settings.ts sits at
// the 300-line cap. It already decomposes this way: see settings-provider-summaries.ts and
// api-key-settings.ts.

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function roleLabel(role: string): "Editor" | "Owner" | "Viewer" {
  if (role === "owner") return "Owner";
  if (role === "viewer") return "Viewer";
  return "Editor";
}

export function memberColor(index: number): "accent" | "blue" | "purple" {
  if (index === 0) return "accent";
  return index % 2 === 0 ? "purple" : "blue";
}
