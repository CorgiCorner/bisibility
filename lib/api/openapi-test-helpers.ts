export type Parameter = { $ref?: string; name?: string; schema: object };

export function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
