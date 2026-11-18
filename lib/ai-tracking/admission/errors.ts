export class TrackingConsentStaleError extends Error {
  constructor() {
    super("Tracking preview changed. Review it again before launch.");
    this.name = "TrackingConsentStaleError";
  }
}
