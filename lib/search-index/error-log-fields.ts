export function errorLogFields(error: unknown) {
  const fields: {
    name?: string | number;
    code?: string | number;
    status?: string | number;
    message?: string;
  } = {};
  if (typeof error !== "object" || error === null) return fields;

  const source = error as Record<string, unknown>;
  for (const key of ["name", "code", "status"] as const) {
    const value = source[key];
    if (typeof value === "string" || typeof value === "number") fields[key] = value;
  }
  if (typeof source.message === "string") fields.message = source.message.slice(0, 300);
  return fields;
}
