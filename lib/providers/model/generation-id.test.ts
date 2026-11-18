import { expect, test } from "vitest";
import { openRouterGenerationId } from "./generation-id";

test.each([
  '{"id":"gen-fixture",',
  '{ "object": "chat.completion", "id" : "gen-fixture"',
  '{"nested":{"id":"gen-other"},"id":"gen-fixture",',
  '{"text":"escaped \\"id\\":", "id":"gen-fixture",',
])("reads the top-level generation from a partial response: %s", (prefix) => {
  expect(openRouterGenerationId(prefix)).toBe("gen-fixture");
});
test.each([
  '{"nested":{"id":"gen-other"},',
  '{"text":"id:gen-other"}',
  '{"id":"gen-truncated',
  '{"id":"req_wrong"}',
  '[{"id":"gen-array"}]',
  '{"id":null}',
  'garbage {"id":"gen-other"}',
])("does not guess an id from %s", (prefix) => expect(openRouterGenerationId(prefix)).toBeNull());
