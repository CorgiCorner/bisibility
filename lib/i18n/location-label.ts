/** Provider hierarchies repeat the city/region. Keep the place and country for display only. */
export function compactLocationLabel(label: string): string {
  const parts = label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3) return label;
  const first = parts[0],
    last = parts[parts.length - 1];
  return first === last ? first : `${first}, ${last}`;
}
