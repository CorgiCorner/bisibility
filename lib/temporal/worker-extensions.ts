export function startWorkerExtensions(): { close(): Promise<void> } {
  return { close: async () => undefined };
}
