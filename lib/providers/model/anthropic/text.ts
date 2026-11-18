export function text(value: unknown): string {
  if (typeof value !== "string" || /[\uD800-\uDFFF]/u.test(value)) throw new Error();
  return value;
}

export function boundedText(value: string, bytes: number) {
  let result = "";
  let size = 0;
  for (const character of value) {
    size += Buffer.byteLength(character);
    if (size > bytes) break;
    result += character;
  }
  return result;
}
