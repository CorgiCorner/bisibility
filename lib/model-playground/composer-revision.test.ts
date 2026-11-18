import { expect, it } from "vitest";
import { composerFixture } from "./composer-fixtures.test-support";
import { previousRunCause } from "./composer-revision";

it("does not mark value-identical parsed drafts as a previous run after a new revision", () => {
  const before = { input: composerFixture().input, revision: "old", search: false, market: "US" };
  const after = { ...structuredClone(before), revision: "new" };
  expect(
    previousRunCause(before, after, {
      promptChanged: "prompt",
      languageChanged: "language",
      marketChanged: "market",
      searchChanged: "search",
      columnsChanged: "columns",
    }),
  ).toBeUndefined();
});
