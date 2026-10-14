type CsvValue = number | string | null;

// Numeric formatters are trusted presentation callbacks and never receive strings.
function formattedCell(value: CsvValue, formatNumber?: (value: number) => string) {
  const raw =
    value === null
      ? ""
      : typeof value === "number" && formatNumber
        ? formatNumber(value)
        : String(value);
  let formulaStart = 0;
  while (
    formulaStart < raw.length &&
    (raw.charCodeAt(formulaStart) <= 32 || raw.charCodeAt(formulaStart) === 0xfeff)
  )
    formulaStart++;
  const formula = ["=", "+", "-", "@"].includes(raw[formulaStart] ?? "");
  const control = /^[\t\r\n]/.test(raw);
  const text = typeof value === "string" && (formula || control) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvCell(value: CsvValue) {
  return formattedCell(value);
}

export function csvRow(values: readonly CsvValue[]) {
  return values.map(csvCell).join(",");
}

export function csvRowWithNumberFormat(
  values: readonly CsvValue[],
  formatNumber: (value: number, index: number) => string,
) {
  return values
    .map((value, index) => formattedCell(value, (number) => formatNumber(number, index)))
    .join(",");
}
