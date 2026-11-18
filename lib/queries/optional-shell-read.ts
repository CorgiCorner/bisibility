const transientDatabaseCodes = new Set(["P2028", "P2024", "P1001", "P1002", "P1008", "P1017"]);

/** Optional shell decorations must not replace the page with a database error. */
export async function optionalShellRead<T>(read: Promise<T>, part: string): Promise<T | null> {
  try {
    return await read;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    // Preserve authorization redirects, programming errors and unknown failures.
    if (typeof code !== "string" || !transientDatabaseCodes.has(code)) throw error;
    console.warn("[workspace-shell] optional read unavailable", { part, code });
    return null;
  }
}
