export class ProviderAuthError extends Error {
  constructor(
    readonly providerId: string,
    message = `Provider ${providerId} authorization is no longer valid. Reconnect the account.`,
  ) {
    super(message);
    this.name = "ProviderAuthError";
  }
}
