import { type ParsedCronExpression, parseCronExpression } from "./cron";

/** Grammar shared by the candidate parser and the pinned numeric worker. */
export function parseCanonicalCron(expression: string): ParsedCronExpression {
  const fields = expression.trim().split(/\s+/);
  // The worker uses parseInt: suffixes and bare value/step would silently change
  // meaning. A step is safe only on a wildcard or an explicit inclusive range.
  const field =
    /^(?:\*(?:\/[1-9]\d?)?|\d{1,2}(?:-\d{1,2}(?:\/[1-9]\d?)?)?(?:,\d{1,2}(?:-\d{1,2}(?:\/[1-9]\d?)?)?)*)$/;
  if (fields.length !== 5 || fields.some((value) => !field.test(value))) return { ok: false };
  return parseCronExpression(expression);
}
