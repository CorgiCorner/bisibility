export class IdentityIdentifierClaimedError extends Error {
  constructor() {
    super("An active location already owns this identifier in the project.");
    this.name = "IdentityIdentifierClaimedError";
  }
}
export class IdentityMapsUrlError extends Error {
  constructor(
    readonly reason: "maps_identifier_conflict" | "invalid_maps_identifier",
    message: string,
  ) {
    super(message);
    this.name = "IdentityMapsUrlError";
  }
}
