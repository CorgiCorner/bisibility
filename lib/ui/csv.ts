// One sanitizer for every CSV the app hands to a spreadsheet: a leading formula marker or
// control character needs an apostrophe, and separators are escaped.
export function csvCell(value: number | string | null) {
  const raw = value === null ? "" : String(value);
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvRow(values: readonly (number | string | null)[]) {
  return values.map(csvCell).join(",");
}
