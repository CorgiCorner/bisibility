const simpleCaseAliases: Readonly<Record<string, string>> = {
  ı: "ı",
  ΐ: "ΐ",
  ΰ: "ΰ",
  ﬅ: "ﬆ",
};

function foldLiteralCase(value: string) {
  return Array.from(value, (character) => {
    // Simple-fold exceptions preserve literal matching and original source offsets.
    if (simpleCaseAliases[character]) return simpleCaseAliases[character];
    const upper = character.toUpperCase();
    const folded =
      upper.length === character.length ? upper.toLowerCase() : character.toLowerCase();
    return folded.length === character.length ? folded : character;
  }).join("");
}

export function findLiteralWordMatch(answer: string, alias: string, ignoreCase = false) {
  if (!alias) return null;
  const text = ignoreCase ? foldLiteralCase(answer) : answer;
  const literal = ignoreCase ? foldLiteralCase(alias) : alias;
  let index = text.indexOf(literal);
  while (index !== -1) {
    const end = index + literal.length;
    const splitsCharacter = (offset: number) =>
      /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(text.slice(offset - 1, offset + 1));
    if (
      !splitsCharacter(index) &&
      !splitsCharacter(end) &&
      !/[\p{L}\p{N}]$/u.test(text.slice(Math.max(0, index - 2), index)) &&
      !/^[\p{L}\p{N}]/u.test(text.slice(end, end + 2))
    ) {
      return { index, length: literal.length };
    }
    index = text.indexOf(literal, index + 1);
  }
  return null;
}
