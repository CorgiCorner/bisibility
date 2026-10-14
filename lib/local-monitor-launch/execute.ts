type PreparedMonitorRun = Readonly<{
  id: string;
  fresh: boolean;
  submitters: readonly Readonly<{
    targetKey: string;
    submit(): Promise<unknown>;
  }>[];
}>;
/** Invoke only freshly granted one-shot permits. Unknown transport remains authoritative in storage. */
export async function executePreparedMonitorRun<T>(
  prepared: PreparedMonitorRun,
  read: (id: string) => Promise<T>,
): Promise<T> {
  if (prepared.fresh)
    for (const item of prepared.submitters) {
      try {
        await item.submit();
      } catch {
        /* No retry: the durable owner and receipt determine recovery. */
      }
    }
  return read(prepared.id);
}
