const FALLBACK_INITIALS = "U";

export function initials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || FALLBACK_INITIALS
  ).toUpperCase();
}
