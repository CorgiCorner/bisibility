import { describe, expect, it } from "vitest";
import { chatgptStarterPromptKey } from "./install-getting-started-copy";

describe("chatgptStarterPromptKey", () => {
  it("selects the rank-movement prompt when the project has a keyword and a check", () => {
    expect(chatgptStarterPromptKey(true)).toBe("withChecks");
  });

  it("selects the first-keyword prompt when the project has none", () => {
    expect(chatgptStarterPromptKey(false)).toBe("withoutChecks");
  });
});
