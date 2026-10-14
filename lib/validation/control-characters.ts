/** C0 and DEL bytes cannot be opaque identities, tokens or retained provider text. */
export function hasAsciiControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}
