export const PROMPT_TEXT_LIMIT = 200;
export const BULK_PROMPT_LIMIT = 50;

export type BulkSkipReason = "duplicate" | "empty" | "over_limit" | "too_long";

export type BulkPromptSkip = {
  line: number;
  reason: BulkSkipReason;
  text: string;
};

export type BulkPromptParse = {
  skipped: readonly BulkPromptSkip[];
  valid: readonly string[];
};

export function promptCharacterCount(text: string) {
  return Array.from(text).length;
}

export function singlePromptIssue(text: string): "empty" | "too_long" | null {
  if (text.trim().length === 0) return "empty";
  if (promptCharacterCount(text) > PROMPT_TEXT_LIMIT) return "too_long";
  return null;
}

/**
 * One prompt per non-empty line. Empty, over-long, and duplicate lines are skipped.
 * Only the first 50 non-empty lines are validated; the rest are over the limit.
 * Nothing in `skipped` is returned in `valid`.
 */
export function parseBulkPrompts(value: string, existing: readonly string[]): BulkPromptParse {
  const seen = new Set(existing.map(normalizePrompt));
  const lines = value.split(/\r?\n/);
  const skipped: BulkPromptSkip[] = [];
  const valid: string[] = [];
  let nonEmpty = 0;
  lines.forEach((text, index) => {
    const line = index + 1;
    if (text.trim().length === 0) {
      if (text.length === 0 && index === lines.length - 1) return;
      skipped.push({ line, reason: "empty", text });
      return;
    }
    nonEmpty += 1;
    if (nonEmpty > BULK_PROMPT_LIMIT) {
      skipped.push({ line, reason: "over_limit", text });
      return;
    }
    if (promptCharacterCount(text) > PROMPT_TEXT_LIMIT) {
      skipped.push({ line, reason: "too_long", text });
      return;
    }
    const key = normalizePrompt(text);
    if (seen.has(key)) {
      skipped.push({ line, reason: "duplicate", text });
      return;
    }
    seen.add(key);
    valid.push(text);
  });
  return { skipped, valid };
}

function normalizePrompt(text: string) {
  return text.trim();
}
