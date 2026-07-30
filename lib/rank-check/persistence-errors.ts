export class RankCheckClosedBeforePersistenceError extends Error {
  constructor() {
    super("Rank check was closed before its result could be persisted.");
    this.name = "RankCheckClosedBeforePersistenceError";
  }
}
