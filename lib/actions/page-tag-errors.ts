// Page-tag rule input errors. Kept out of the "use server" module so that
// module exports only async functions.

export class TagPageRuleInputError extends Error {
  constructor(readonly code: "invalid_url" | "tag_not_found" | "too_many_urls") {
    super(code);
    this.name = "TagPageRuleInputError";
  }
}
