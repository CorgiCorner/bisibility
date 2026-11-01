/**
 * Keeps the first recorded failure reason and appends a later note, such as the queue-age expiry.
 * Repeating the same note is a no-op, so retried cleanup never grows the stored text.
 */
export function withKeptReason(original: string | null | undefined, note: string) {
  const first = original?.trim();
  if (!first) return note;
  if (first === note || first.includes(note)) return first;
  return `${/[.!?]$/.test(first) ? first : `${first}.`} ${note}`;
}
