import type { ModelPlaygroundCopy } from "./composer-copy";
import type { ModelPlaygroundInput } from "./types";

export type ComposerRevision = {
  input: ModelPlaygroundInput;
  revision: string;
  search: boolean;
  market: string;
};

export function previousRunCause(
  before: ComposerRevision,
  after: ComposerRevision,
  copy: Pick<
    ModelPlaygroundCopy,
    "promptChanged" | "languageChanged" | "marketChanged" | "searchChanged" | "columnsChanged"
  >,
) {
  const changes = [
    before.input.prompt !== after.input.prompt && copy.promptChanged,
    before.input.responseLanguage !== after.input.responseLanguage && copy.languageChanged,
    before.market !== after.market && copy.marketChanged,
    before.search !== after.search && copy.searchChanged,
    JSON.stringify(before.input.columns) !== JSON.stringify(after.input.columns) &&
      copy.columnsChanged,
  ].filter(Boolean);
  return changes.length ? changes.join("; ") : undefined;
}

export function composerContentKey(input: ModelPlaygroundInput) {
  return JSON.stringify(input);
}
