export function datedCsvFilename(
  prefix: string,
  label: string,
  window: { start: string; end: string } | null,
) {
  const slug =
    label
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "") || "property";
  return `${prefix}-${slug}-${window ? `${window.start}-${window.end}` : "no-window"}.csv`;
}
