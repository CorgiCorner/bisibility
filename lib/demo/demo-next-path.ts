function unsafePath(value: string): boolean {
  return (
    value.includes("//") ||
    value.includes("\\") ||
    /%2e%2e/i.test(value) ||
    /(?:^|\/)\.\.(?:\/|$)/.test(value.split(/[?#]/, 1)[0]) ||
    /^[^/]*:/.test(value) ||
    /[a-z][a-z\d+.-]*:\/\//i.test(value) ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  );
}

export function demoNextPath(
  raw: string | null | undefined,
  projectPublicId?: string,
): string | null {
  if (!raw || raw.length > 512 || unsafePath(raw)) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/app/") || unsafePath(decoded)) return null;
  const pathname = decoded.split(/[?#]/, 1)[0];
  if (projectPublicId !== undefined && pathname.split("/")[2] !== projectPublicId) return null;

  // Next already decoded the outer next parameter; keep inner query escapes usable.
  const suffix = raw.search(/[?#]/);
  return suffix === -1 ? decoded : pathname + raw.slice(suffix);
}
