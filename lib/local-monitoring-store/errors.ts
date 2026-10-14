export class LocalMeasurementUnavailableError extends Error {
  readonly status = 404;
  constructor() {
    super("Local measurement resource is unavailable.");
    this.name = "LocalMeasurementUnavailableError";
  }
}
export class LocalMeasurementConflictError extends Error {
  readonly status = 409;
  constructor() {
    super("Local measurement binding changed.");
    this.name = "LocalMeasurementConflictError";
  }
}
export class LocalDeviceNotConfiguredError extends Error {
  readonly status = 422;
  constructor() {
    super("Requested device is not configured for this keyword.");
    this.name = "LocalDeviceNotConfiguredError";
  }
}
