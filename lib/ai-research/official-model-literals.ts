// Strict literal reads only. Downloaded JavaScript is never executed or imported.
export function literalParts(
  source: string,
  start: number,
): { parts: string[]; end: number } | null {
  const pairs: Record<string, string> = { "{": "}", "[": "]", "(": ")" };
  const stack: string[] = [];
  const parts: string[] = [];
  let quote = "";
  let begin = start + 1;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
      continue;
    }
    if (["`", '"', "'"].includes(char)) quote = char;
    else if (pairs[char]) stack.push(pairs[char]);
    else if (["}", "]", ")"].includes(char)) {
      if (stack.pop() !== char) return null;
    }
    if ((char === "," && stack.length === 1) || !stack.length) {
      const part = source.slice(begin, index).trim();
      if (part) parts.push(part);
      else if (stack.length) return null;
      begin = index + 1;
      if (!stack.length) return { parts, end: index + 1 };
    }
  }
  return null;
}
export function literalFields(source: string, start = 0): Map<string, string> | null {
  const output = new Map<string, string>();
  const parsed = source[start] === "{" ? literalParts(source, start) : null;
  if (!parsed) return null;
  for (const part of parsed.parts) {
    const match = /^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/.exec(part);
    if (!match || output.has(match[1])) return null;
    output.set(match[1], match[2]);
  }
  return output;
}
export function literalString(value: string | undefined): string | null {
  return value && /^`[^`\\]*`$/.test(value) && !value.includes("${") ? value.slice(1, -1) : null;
}
export function literalNumber(value: string | undefined): number | null {
  if (!value || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function literalInteger(value: string | undefined): number | null {
  const number = literalNumber(value);
  return number !== null && Number.isSafeInteger(number) && number > 0 ? number : null;
}
export function literalData(source: string, depth = 0): unknown {
  if (depth > 20) throw new Error("Official data nesting is unknown.");
  const value = source.trim();
  const string = literalString(value);
  if (string !== null) return string;
  const number = literalNumber(value);
  if (number !== null) return number;
  if (["!0", "true"].includes(value)) return true;
  if (["!1", "false"].includes(value)) return false;
  if (value === "null") return null;
  const parts = literalParts(value, 0);
  if (!parts || parts.end !== value.length) throw new Error("Official data is not a literal.");
  if (value[0] === "[") return parts.parts.map((part) => literalData(part, depth + 1));
  const fields = literalFields(value);
  if (value[0] !== "{" || !fields) throw new Error("Official data is not an object literal.");
  return Object.fromEntries([...fields].map(([key, part]) => [key, literalData(part, depth + 1)]));
}
export function namedObjects(source: string): Map<string, Map<string, string>[]> {
  const output = new Map<string, Map<string, string>[]>();
  for (const match of source.matchAll(/\{\s*name\s*:\s*`([^`\\$]*)`\s*,/g)) {
    const fields = literalFields(source, match.index);
    output.set(match[1], [
      ...(output.get(match[1]) ?? []),
      fields ?? new Map([["invalid_literal", "true"]]),
    ]);
  }
  return output;
}
export function defaultTokenUnit(source: string): boolean {
  let count = 0;
  for (const declaration of source.matchAll(/let\{price_type:[^}]{1,400}\}/g)) {
    const identifier = /price_unit:([A-Za-z_$][\w$]*)/.exec(declaration[0])?.[1];
    const remainder = source.slice(
      declaration.index + declaration[0].length,
      declaration.index + 1200,
    );
    if (
      [...remainder.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\?\?`1M tokens`/g)].some(
        (match) => match[1] === identifier,
      )
    )
      count++;
  }
  return count === 1;
}
export function usdRenderer(source: string): boolean {
  const formats = [...source.matchAll(/new Intl\.NumberFormat\(/g)];
  const declarations = [...source.matchAll(/new Intl\.NumberFormat\(`en-US`,\s*(?=\{)/g)];
  if (!formats.length || declarations.length !== formats.length) return false;
  for (const declaration of declarations) {
    const options = literalFields(source, declaration.index + declaration[0].length);
    if (
      literalString(options?.get("style")) !== "currency" ||
      literalString(options?.get("currency")) !== "USD"
    )
      return false;
  }
  const cards = [
    ...source.matchAll(/function [\w$]+\(\{label:[\w$]+,price:([\w$]+),unit:[\w$]+\}\)\{/g),
  ];
  if (cards.length !== 1) return false;
  const card = cards[0];
  const nextFunction = source.indexOf("function ", card.index + card[0].length);
  const body = source.slice(
    card.index,
    Math.min(card.index + 2000, nextFunction < 0 ? source.length : nextFunction),
  );
  const formatter = /(?:let|const|var)\s+([\w$]+)=new Intl\.NumberFormat\(/.exec(body)?.[1];
  const calls = body.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\.format\(([A-Za-z_$][\w$]*)\)/g);
  return !!formatter && [...calls].some((match) => match[1] === formatter && match[2] === card[1]);
}
