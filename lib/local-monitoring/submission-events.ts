import {
  LocalOperationConflict,
  type LocalOperationStore,
  type SubmissionEvent,
  type SubmissionRecord,
} from "./execution-types";

/** CAS retries persist already known evidence; they never retry provider I/O. */
export async function persistSubmissionEvent(
  store: LocalOperationStore,
  record: SubmissionRecord,
  event: SubmissionEvent,
) {
  let current = record;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await store.apply(current.key, current.version, event);
    } catch (cause) {
      if (!(cause instanceof LocalOperationConflict)) throw cause;
      const latest = await store.read(current.key);
      if (!latest) throw new Error("Durable submission disappeared");
      current = latest;
    }
  }
  throw new LocalOperationConflict();
}
