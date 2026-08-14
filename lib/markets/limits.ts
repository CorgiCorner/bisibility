/** Shared project cap for onboarding and every registry-creating surface. */
export const MAX_PROJECT_MARKETS = 5;

export class ProjectMarketLimitExceededError extends Error {
  readonly limit: number;

  constructor(limit: number) {
    super(`This project can track up to ${limit} markets.`);
    this.name = "ProjectMarketLimitExceededError";
    this.limit = limit;
  }
}
