import { expect, it } from "vitest";
import { trackingPromptForm } from "./forms";

it("preserves exact prompt bytes for immutable revision identity", () => {
  const text = "  Which tools are useful?\n\n  ";
  expect(trackingPromptForm.parse({ text }).text).toBe(text);
  expect(trackingPromptForm.safeParse({ text: "  \n" }).success).toBe(false);
});
