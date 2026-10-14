/** SpreadsheetML ST_Xstring: preserve CR/control bytes and literal escape markers. */
export function xlsxCellText(value: string) {
  const protectedMarkers = value.replace(/_(?=x[0-9a-f]{4}_)/gi, "_x005F_");
  return Array.from(protectedMarkers, (character) => {
    const code = character.charCodeAt(0);
    const needsEscape =
      code <= 8 || (code >= 11 && code <= 31) || code === 0xfffe || code === 0xffff;
    return needsEscape ? `_x${code.toString(16).toUpperCase().padStart(4, "0")}_` : character;
  }).join("");
}
