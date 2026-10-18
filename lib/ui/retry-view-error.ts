function isMissingWebpackModule(error: Error): boolean {
  if (
    error.name !== "TypeError" ||
    error.message !== "Cannot read properties of undefined (reading 'call')"
  ) {
    return false;
  }

  const firstFrame = error.stack
    ?.split("\n")
    .slice(1)
    .find((line) => line.trim());
  return /^\s*at (?:[^\s(]+ \()?https?:\/\/[^/\s)]+\/_next\/static\/chunks\/webpack-[a-f\d]+\.js(?:\?[^\s)]*)?:\d+:\d+\)?$/.test(
    firstFrame ?? "",
  );
}

/** Called only by an explicit recovery action; a broken module registry survives React reset. */
export function retryViewError(error: Error, reset: () => void): void {
  if (isMissingWebpackModule(error)) {
    globalThis.location.reload();
    return;
  }
  reset();
}
