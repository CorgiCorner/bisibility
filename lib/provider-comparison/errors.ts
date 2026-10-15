/** A definitive rejection before run creation, safe to obtain a new preview. */
export class ComparisonPreviewRejectedError extends Error {
  constructor() {
    super("Comparison preview must be refreshed.");
    this.name = "ComparisonPreviewRejectedError";
  }
}
