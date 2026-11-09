export function requireFixture<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Required preview fixture is missing");
  return value;
}
