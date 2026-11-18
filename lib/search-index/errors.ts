export class SearchIndexConnectionError extends Error {
  constructor() {
    super("No connected Search Console property is available for this project.");
    this.name = "SearchIndexConnectionError";
  }
}
