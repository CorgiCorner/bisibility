export const ORGANIC_DEPTH_NOT_COVERED = "organic_depth_not_covered";

export class OrganicCoverageError extends Error {
  readonly code = ORGANIC_DEPTH_NOT_COVERED;
  readonly retryable = false;

  constructor(detail: string) {
    super(`Organic result is indeterminate: ${ORGANIC_DEPTH_NOT_COVERED} (${detail}).`);
    this.name = "OrganicCoverageError";
  }
}
