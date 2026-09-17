export type ChatGptStarterPromptKey = "withChecks" | "withoutChecks";

/**
 * Selects which starter prompt the ChatGPT guide suggests. The wording itself
 * lives in the `projectInstall` catalog; this module only picks the variant.
 */
export function chatgptStarterPromptKey(hasKeywordAndCheck: boolean): ChatGptStarterPromptKey {
  return hasKeywordAndCheck ? "withChecks" : "withoutChecks";
}
